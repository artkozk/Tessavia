// Only this module owns the IndexedDB schema; payloads stay immutable after enqueue.
export function createIndexedOutbox({ indexedDB = globalThis.indexedDB, name = 'tessavie-outbox-v1' } = {}) {
  let opened;
  const database = () => opened ||= new Promise((resolve, reject) => {
    if (!indexedDB) return reject(new Error('Браузер не предоставляет локальное хранилище. Текст остался в форме.'));
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('items', { keyPath: 'id' }).createIndex('owner', 'owner');
      db.createObjectStore('meta', { keyPath: 'key' });
    };
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => { opened = null; reject(request.error); };
    request.onblocked = () => reject(new Error('Закройте прежнюю вкладку Tessavie для обновления хранилища.'));
  });
  const transaction = async (table, mode, operation) => {
    const db = await database();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(table, mode), store = tx.objectStore(table);
      let value;
      tx.oncomplete = () => resolve(value);
      tx.onabort = tx.onerror = () => reject(tx.error || new Error('Локальное сохранение не завершено. Текст остался в форме.'));
      try { operation(store, result => { value = result; }); } catch (error) { tx.abort(); reject(error); }
    });
  };
  return {
    list: owner => transaction('items', 'readonly', (store, done) => { store.index('owner').getAll(owner).onsuccess = event => done(event.target.result); }),
    addMany: items => transaction('items', 'readwrite', store => { for (const item of items) store.add(item); }),
    update: (id, change) => transaction('items', 'readwrite', (store, done) => {
      store.get(id).onsuccess = event => {
        const current = event.target.result;
        if (!current) return done(null);
        const next = change(current);
        if (next === undefined) return done(null);
        if (next === null) store.delete(id); else store.put(next);
        done(next);
      };
    }),
    identity: () => transaction('meta', 'readonly', (store, done) => { store.get('identity').onsuccess = event => done(event.target.result?.value || null); }),
    setIdentity: value => transaction('meta', 'readwrite', store => { if (value) store.put({ key: 'identity', value: { id: value.id, username: value.username } }); else store.delete('identity'); }),
  };
}

export function createOutboxQueue({ store, verifyOwner, send, changed = () => {}, confirmed = () => {}, authRequired = () => {}, online = () => true, now = () => Date.now(), uuid = () => crypto.randomUUID() }) {
  let owner = null, epoch = 0, running = false;
  const notify = () => { try { changed(); } catch (_) { /* UI cannot undo durable storage. */ } };
  const active = (user, version) => owner === user && epoch === version;
  const eligible = item => (item.status === 'queued' || item.status === 'sending' && item.leaseUntil <= now()) && item.nextAt <= now();
  const api = {
    setOwner(value) { if (owner !== value) { owner = value; epoch++; } notify(); },
    async enqueue(entries, expectedOwner) {
      if (!expectedOwner || owner !== expectedOwner) throw new Error('Аккаунт изменился. Вернитесь в исходный аккаунт; текст остался в форме.');
      const items = entries.map(entry => ({ ...structuredClone(entry), owner: expectedOwner, id: uuid(), status: 'queued', attempts: 0, nextAt: 0, leaseUntil: 0, createdAt: now(), error: '' }));
      await store.addMany(items); // Resolve only on transaction commit, including all Blobs.
      notify();
      return items;
    },
    async retry(id) {
      await store.update(id, item => item.owner === owner && item.status !== 'confirmed' && !(item.status === 'sending' && item.leaseUntil > now()) ? { ...item, status: 'queued', nextAt: 0, error: '' } : undefined);
      notify();
    },
    async stop(id) {
      await store.update(id, item => {
        if (item.owner !== owner || item.status === 'confirmed' || item.status === 'sending' && item.leaseUntil > now()) return;
        // After any attempt the server may already have committed it. Keep the key/text.
        return item.attempts ? { ...item, status: 'paused', error: 'Повторы остановлены. Запись могла дойти до сервера; текст и ключ сохранены.' } : null;
      });
      notify();
    },
    async pump() {
      if (running || !owner || !online()) return;
      running = true;
      const user = owner, version = epoch;
      try {
        const pending = (await store.list(user)).filter(eligible).sort((a,b) => a.createdAt-b.createdAt || a.id.localeCompare(b.id));
        if (!pending.length || !active(user,version)) return;
        await verifyOwner(user);
        for (const candidate of pending.slice(0,20)) {
          if (!active(user,version) || !online()) break;
          const token = uuid();
          const item = await store.update(candidate.id, current => current.owner === user && eligible(current) ? { ...current, status: 'sending', leaseUntil: now()+180000, leaseToken: token, attempts: current.attempts+1 } : undefined);
          if (!item) continue;
          notify();
          try {
            // Cookie changes after verifyOwner are also checked by the server header.
            if (!active(user,version)) throw new Error('Аккаунт изменился');
            const result = await send(item);
            if (!result?.id) throw new Error('Сервер не подтвердил идентификатор записи');
            const saved = await store.update(item.id, current => current.leaseToken === token ? { ...current, status: 'confirmed', resultID: result.id, confirmedAt: now(), leaseUntil: 0, error: '', blob: undefined } : undefined);
            if (saved && active(user,version)) { try { confirmed(saved,result); } catch (_) {} }
          } catch (error) {
            const blocked = [400,403,404,409,413,415,422].includes(error.status);
            await store.update(item.id, current => current.leaseToken === token ? { ...current, status: blocked ? 'blocked' : 'queued', leaseUntil: 0, nextAt: now()+Math.min(300000,2000*2**Math.min(current.attempts,8)), error: error.message || 'Нет связи с сервером' } : undefined);
            if (error.status === 401 || error.code === 'outbox_owner_changed') {
              if (active(user,version)) { api.setOwner(null); authRequired(); }
              break;
            }
          }
          notify();
        }
      } catch (error) {
        if (active(user,version) && (error.status === 401 || error.code === 'outbox_owner_changed')) { api.setOwner(null); authRequired(); }
      } finally { running = false; notify(); }
    },
  };
  return api;
}
