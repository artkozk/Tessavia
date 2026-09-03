// Persistent graph drafts are scoped before any asynchronous work starts.
export function createGraphLayoutStore({ api, storage, normalize, isUserActive, onChange = () => {}, delay = 450, draftId = '' }) {
  const contexts = new Map();
  const canonical = (value) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
  const equal = (left, right) => canonical(left) === canonical(right);
  const clone = (data) => normalize(JSON.parse(JSON.stringify(data)));
  const url = (ctx) => `/api/graph/layout?view=${encodeURIComponent(ctx.view)}`;
  const options = (ctx) => ({ headers: { 'X-Workspace-ID': ctx.workspace } });
  function persist(ctx) {
    try {
      storage.setItem(ctx.dirty ? ctx.draftKey : ctx.key, JSON.stringify({ data: ctx.data, version: ctx.version, updatedAt: ctx.updatedAt, dirty: ctx.dirty }));
      if (!ctx.dirty && ctx.draftKey !== ctx.key) storage.removeItem(ctx.draftKey);
      ctx.cacheError = false;
    } catch (_) { ctx.cacheError = true; }
    onChange(ctx);
  }
  function context({ user, workspace, view }) {
    const key = `business-control:graph-layout:${user}:${encodeURIComponent(workspace)}:${encodeURIComponent(view)}:v1`;
    if (contexts.has(key)) return contexts.get(key);
    const draftKey = draftId ? `${key}:draft:${encodeURIComponent(draftId)}` : key;
    let cached;
    try { cached = JSON.parse(storage.getItem(draftKey) || storage.getItem(key) || 'null'); } catch (_) {}
    const ctx = { key, draftKey, user, workspace, view, data: normalize(cached?.data), version: Number.isSafeInteger(cached?.version) && cached.version >= 0 ? cached.version : 0,
      updatedAt: cached?.updatedAt || '', dirty: cached?.dirty === true, hadCache: Boolean(cached && (cached.version > 0 || cached.dirty || Object.keys(cached.data?.positions || {}).length)), loaded: false, loading: null,
      saving: null, timer: null, revision: 0, conflict: false, error: '', cacheError: false, undo: [] };
    contexts.set(key, ctx);
    return ctx;
  }
  function checkpoint(ctx) {
    if (!ctx.undo.length || !equal(ctx.undo.at(-1), ctx.data)) ctx.undo.push(clone(ctx.data));
    if (ctx.undo.length > 20) ctx.undo.shift();
    onChange(ctx);
  }
  function schedule(ctx) {
    clearTimeout(ctx.timer);
    ctx.timer = setTimeout(() => { ctx.timer = null; void save(ctx); }, delay);
  }
  function change(ctx, data, { remember = true, autoSave = true } = {}) {
    const next = normalize(data);
    if (equal(next, ctx.data)) return false;
    if (remember) checkpoint(ctx);
    ctx.data = next; ctx.revision++; ctx.dirty = true; ctx.error = '';
    persist(ctx);
    if (autoSave && !ctx.conflict) schedule(ctx);
    return true;
  }
  function undo(ctx) {
    if (!ctx.undo.length) return false;
    return change(ctx, ctx.undo.pop(), { remember: false });
  }
  function adopt(ctx, remote) {
    const next = normalize(remote.data);
    if (!equal(ctx.data, next)) ctx.undo = [];
    ctx.data = next; ctx.version = remote.version; ctx.updatedAt = remote.updatedAt;
    ctx.dirty = false; ctx.conflict = false; ctx.error = ''; ctx.loaded = true;
    persist(ctx);
  }
  async function read(ctx) {
    const remote = await api(url(ctx), options(ctx));
    if (remote.view !== ctx.view || !Number.isSafeInteger(remote.version) || remote.version < 0) throw new Error('Сервер вернул некорректную версию раскладки');
    return remote;
  }
  async function load(ctx) {
    if (ctx.loading) return ctx.loading;
    ctx.loading = (async () => {
      try {
        const remote = await read(ctx);
        if (remote.version < ctx.version) {
          if (!ctx.loaded) { ctx.loaded = true; ctx.dirty = true; ctx.conflict = true; persist(ctx); }
          return ctx;
        }
        ctx.loaded = true; ctx.error = '';
        if (!ctx.dirty || equal(ctx.data, normalize(remote.data))) adopt(ctx, remote);
        else { ctx.conflict = ctx.version !== remote.version; persist(ctx); }
      } catch (error) { ctx.error = error.message; onChange(ctx); }
      return ctx;
    })().finally(() => { ctx.loading = null; onChange(ctx); });
    onChange(ctx);
    return ctx.loading;
  }
  function settledWrite(ctx, remote, sentData, sentRevision) {
    if (remote.version >= ctx.version) { ctx.version = remote.version; ctx.updatedAt = remote.updatedAt; }
    ctx.loaded = true;
    ctx.error = ''; ctx.conflict = false;
    ctx.dirty = ctx.revision !== sentRevision && !equal(ctx.data, sentData);
    persist(ctx);
  }
  async function save(ctx) {
    clearTimeout(ctx.timer); ctx.timer = null;
    if (!isUserActive(ctx.user) || !ctx.dirty || ctx.conflict) return false;
    if (ctx.saving) return ctx.saving;
    ctx.saving = (async () => {
      if (!ctx.loaded) await load(ctx);
      if (!ctx.loaded || ctx.conflict || !isUserActive(ctx.user) || !ctx.dirty) return false;
      const sentData = clone(ctx.data), sentRevision = ctx.revision, expectedVersion = ctx.version;
      try {
        const remote = await api(url(ctx), { ...options(ctx), method: 'PUT', body: JSON.stringify({ data: sentData, expectedVersion }) });
        if (remote.view !== ctx.view || remote.version !== expectedVersion + 1) throw new Error('Не удалось подтвердить версию сохранённой раскладки');
        settledWrite(ctx, remote, sentData, sentRevision);
        return true;
      } catch (error) {
        // A lost response can mean the write already committed. Reconcile before retrying.
        try {
          const remote = await read(ctx);
          if (equal(normalize(remote.data), sentData)) { settledWrite(ctx, remote, sentData, sentRevision); return true; }
          ctx.conflict = remote.version !== expectedVersion || error.status === 409;
        } catch (_) { ctx.conflict = error.status === 409; }
        ctx.error = error.message; persist(ctx);
        return false;
      }
    })().finally(() => {
      ctx.saving = null; onChange(ctx);
      if (ctx.dirty && !ctx.error && !ctx.conflict && isUserActive(ctx.user)) schedule(ctx);
    });
    onChange(ctx);
    return ctx.saving;
  }
  async function retry(ctx) {
    await load(ctx);
    return save(ctx);
  }
  async function acceptServer(ctx) {
    if (ctx.saving) await ctx.saving;
    const revision = ctx.revision;
    try {
      const remote = await read(ctx);
      if (ctx.revision !== revision) throw new Error('Появились новые локальные изменения. Повторите выбор раскладки');
      clearTimeout(ctx.timer); ctx.timer = null;
      adopt(ctx, remote);
      return true;
    } catch (error) { ctx.error = error.message; onChange(ctx); return false; }
  }
  async function keepLocal(ctx) {
    if (ctx.saving) await ctx.saving;
    try {
      const remote = await read(ctx);
      ctx.version = remote.version; ctx.loaded = true; ctx.conflict = false; ctx.error = ''; ctx.dirty = true;
      persist(ctx);
      return save(ctx);
    } catch (error) { ctx.error = error.message; onChange(ctx); return false; }
  }
  return { context, load, change, checkpoint, undo, save, retry, acceptServer, keepLocal, equal };
}
