import { createIndexedOutbox, createOutboxQueue } from './offline-outbox.js?v=20260903-offline-outbox-3';
import { captureEntry } from './personal-inbox.js?v=20260904-first-use-4';

export function noteCreateEntries(kind,payload,files=[],requestKey='') {
  if(files.length && (kind !== 'note' || !requestKey))throw new Error('Для файлов нужен ключ новой заметки.');
  const entries=[{kind,payload,title:payload.title||String(payload.body||payload.notes).split('\n')[0].slice(0,120),...(requestKey?{noteRequestKey:requestKey}:{})}];
  for(const file of files)entries.push({kind:'note-attachment',noteRequestKey:requestKey,payload:{},fileName:file.name,blob:file.blob,title:file.name});
  return entries;
}

export function parseNoteUploadResponse(status,text) {
  let result;
  try { result=JSON.parse(text); }
  catch (_) { throw Object.assign(new Error(status===413?'Файл превышает допустимый размер загрузки. Сохраните его из очереди и выберите меньший файл.':'Сервер не подтвердил файл. Повторим с тем же ключом.'),{status}); }
  if(status<200 || status>=300)throw Object.assign(new Error(result?.error||'Не удалось отправить файл'),{status,code:result?.code});
  return result;
}

export function pendingNoteFileEntries(items) {
  const notes=new Map(items.filter(item=>item.kind==='note'&&item.status==='confirmed').map(item=>[`${item.owner}:${item.noteRequestKey||item.id}`,item.resultID]));
  return items.filter(item=>item.kind==='note-attachment'&&item.status!=='confirmed').map(item=>({...item,note:item.note||notes.get(`${item.owner}:${item.noteRequestKey}`)}));
}

export function watchShellUpdates(serviceWorker, toastAction, reload = () => location.reload(), { document: page = globalThis.document, window: host = globalThis.window, onPendingChange = () => {}, loadedVersion = '' } = {}) {
  if (!serviceWorker?.addEventListener || typeof toastAction !== 'function') return;
  let pending = '', announced = false;
  const announce = () => {
    if (!pending || page?.hidden || announced) return;
    announced = true;
    toastAction('Доступно обновление интерфейса. Оно также сохранено в настройках.', 'Обновить', reload);
  };
  const message = event => {
    if (event.data?.type !== 'tessavie-shell-updated') return;
    const version = event.data.version;
    if (typeof version !== 'string' || !/^tessavie-shell-[a-zA-Z0-9-]{1,100}$/.test(version)) return;
    if (version === loadedVersion) { if (pending) { pending = ''; announced = false; onPendingChange(''); } return; }
    if (version === pending) return;
    pending = version; announced = false;
    onPendingChange(pending);
    announce();
  };
  const requestVersion = () => serviceWorker.controller?.postMessage?.({ type: 'tessavie-shell-version-request' });
  const returned = () => { if (!page?.hidden) { requestVersion(); announce(); } };
  const visibility = () => { if (page?.hidden) announced = false; else returned(); };
  serviceWorker.addEventListener('message', message);
  serviceWorker.addEventListener('controllerchange', requestVersion);
  page?.addEventListener('visibilitychange', visibility);
  host?.addEventListener('pageshow', returned);
  return { get pending() { return pending; }, apply: reload, stop() {
    serviceWorker.removeEventListener?.('message', message);
    serviceWorker.removeEventListener?.('controllerchange', requestVersion);
    page?.removeEventListener('visibilitychange', visibility);
    host?.removeEventListener('pageshow', returned);
  } };
}

export function createOutboxUI({ user, workspace, openDialog, closeDialog, newPersonal, newCapture, onConfirmed, onOfflineIdentity, onAuthRequired, escapeHTML, toast, toastAction, reloadInterface, onShellUpdate }) {
  const store = createIndexedOutbox();
  let owner = null, refreshVersion = 0, lastMarkup = '', channel;
  const uploadProgress=new Map();
  const noteFileRequest=item=>new Promise((resolve,reject)=>{
    const xhr=new XMLHttpRequest(),body=new FormData();body.append('file',item.blob,item.fileName);body.append('requestKey',item.id);
    if(item.noteRequestKey)body.append('noteRequestKey',item.noteRequestKey);
    xhr.open('POST',item.note?`/api/personal/notes/${encodeURIComponent(item.note)}/attachments`:'/api/personal/note-attachments');xhr.timeout=120000;xhr.setRequestHeader('X-Outbox-Owner',String(item.owner));
    xhr.upload.onprogress=event=>{const percent=event.lengthComputable?Math.min(99,Math.round(event.loaded/event.total*100)):0;uploadProgress.set(item.id,percent);const progress=dialog.querySelector(`[data-id="${CSS.escape(item.id)}"] progress`);if(progress)progress.value=percent;window.dispatchEvent(new CustomEvent('tessavie-note-file-progress',{detail:{id:item.id,owner:item.owner,percent}}));};
    xhr.onload=()=>{try{const result=parseNoteUploadResponse(xhr.status,xhr.responseText);uploadProgress.delete(item.id);resolve(result);}catch(error){reject(error);}};
    xhr.onerror=xhr.ontimeout=xhr.onabort=()=>reject(new Error('Нет подтверждения файла. Повторим отправку с тем же ключом.'));xhr.send(body);
  });
  const trigger = document.createElement('button');
  trigger.type = 'button'; trigger.className = 'icon-button topbar-icon outbox-trigger'; trigger.hidden = true;
  trigger.setAttribute('aria-label', 'Очередь отправки'); trigger.title = 'Очередь отправки';
  trigger.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14v6h16v-6M12 16V3m-5 5 5-5 5 5"/></svg><b hidden></b>';
  document.querySelector('.topbar-actions').prepend(trigger);
  const dialog = document.createElement('dialog'); dialog.id = 'outbox-dialog'; dialog.className = 'create-dialog outbox-dialog';
  dialog.innerHTML = '<div class="dialog-header"><h2>Очередь отправки</h2><button type="button" class="close-button" aria-label="Закрыть очередь">×</button></div><div class="dialog-form"><p>Записи хранятся в этом браузере до подтверждения сервера. Не очищайте данные сайта, пока есть ожидающие записи.</p><div data-outbox-list aria-live="polite"></div></div>';
  document.body.append(dialog);
  dialog.querySelector('.close-button').onclick = () => closeDialog(dialog);
  const local = document.createElement('main'); local.id = 'offline-root'; local.className = 'offline-root'; local.hidden = true;
  local.innerHTML = '<img src="/brand/tessavie-logo.svg?v=linked-1" width="180" alt="Tessavie"><h1>Работа без подключения</h1><p data-local-account></p><p>Данные с сервера сейчас недоступны. Здесь можно записать личную заметку или план и проверить очередь этого браузера.</p><div class="offline-actions"><button type="button" class="primary" data-new-note>Новая заметка</button><button type="button" class="secondary" data-new-plan>Новый план</button><button type="button" class="secondary" data-open-outbox>Очередь отправки</button><button type="button" class="secondary" data-reconnect>Открыть платформу</button><button type="button" class="quiet" data-offline-exit>Скрыть локальный аккаунт</button></div><p data-offline-ready></p>';
  document.body.append(local);
  const captureButton=document.createElement('button');captureButton.type='button';captureButton.className='primary';captureButton.textContent='Записать во входящие';captureButton.onclick=()=>newCapture();local.querySelector('.offline-actions').prepend(captureButton);
  local.querySelector('[data-new-note]').className='secondary';
  local.querySelector('[data-new-plan]').textContent='Новое дело';
  local.querySelector('[data-new-note]').onclick = () => newPersonal('note');
  local.querySelector('[data-new-plan]').onclick = () => newPersonal('plan');
  local.querySelector('[data-reconnect]').onclick = () => location.reload();
  local.querySelector('[data-offline-exit]').onclick = () => onAuthRequired();
  const request = async (path, { owner: expected, workspace: project, body, method, timeout = 15000 } = {}) => {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout);
    try {
      const form = body instanceof FormData;
      const response = await fetch(path, { method: method || (body ? 'POST' : 'GET'), body: form ? body : body ? JSON.stringify(body) : undefined, credentials: 'same-origin', cache: 'no-store', signal: controller.signal,
        headers: { 'X-Outbox-Owner': String(expected), ...(project ? { 'X-Workspace-ID': project } : {}), ...(body && !form ? { 'Content-Type': 'application/json' } : {}) } });
      const result = await response.json();
      if (!response.ok) throw Object.assign(new Error(result.error || 'Сервер не подтвердил отправку'), { status: response.status, code: result.code });
      return result;
    } catch (error) {
      if (error.name === 'AbortError' || error instanceof TypeError) throw new Error('Нет подтверждения сервера. Повторим отправку с тем же ключом.');
      throw error;
    } finally { clearTimeout(timer); }
  };
  const refresh = async () => {
    const version = ++refreshVersion, expected = owner;
    if (!expected) return;
    try {
      const all = (await store.list(expected)).sort((a,b) => b.createdAt-a.createdAt);
      if (expected !== owner || version !== refreshVersion) return;
      const count = all.filter(item => item.status !== 'confirmed').length;
      trigger.querySelector('b').textContent = String(count); trigger.querySelector('b').hidden = !count;
      trigger.setAttribute('aria-label', `Очередь отправки${count ? `: ${count}` : ''}`);
      if (!dialog.open) return;
      const labels = { queued: 'В браузере · ожидает отправки', sending: 'Отправляется', confirmed: 'Подтверждено сервером', blocked: 'Требует действия', paused: 'Повторы остановлены' };
      const markup = all.map(item => `<article class="outbox-item" data-id="${escapeHTML(item.id)}"><strong>${escapeHTML(item.title || item.fileName || 'Запись')}</strong><small>${escapeHTML(labels[item.status])} · ${escapeHTML(['note','plan','habit-checkin','note-attachment','capture','note-to-plan'].includes(item.kind) ? 'Только для вас' : item.destination || 'Исходный диалог')}</small>${item.error ? `<p class="form-error">${escapeHTML(item.error)}</p>` : ''}${item.kind==='note-attachment'&&item.status!=='confirmed'?`<progress max="100" value="${uploadProgress.get(item.id)||0}" aria-label="Загрузка файла"></progress>`:''}<div class="outbox-actions"><button type="button" class="quiet" data-text>Открыть текст</button>${item.blob ? '<button type="button" class="quiet" data-file>Сохранить файл</button>' : ''}${['queued','blocked','paused'].includes(item.status) || item.status === 'sending' && item.leaseUntil <= Date.now() ? `<button type="button" class="secondary" data-retry>Повторить отправку</button><button type="button" class="quiet" data-stop>${item.attempts ? 'Остановить повторы' : 'Отменить'}</button>` : ''}</div><textarea class="outbox-text" aria-label="Сохранённый текст" readonly hidden>${escapeHTML([item.payload?.title, item.kind === 'habit-checkin' ? `Дата: ${item.date}\nРезультат: ${item.payload.state}\nФакт: ${item.payload.value}\n${item.payload.note || ''}` : item.payload?.body || item.payload?.notes].filter(Boolean).join('\n\n') || item.fileName || '')}</textarea></article>`).join('') || '<p>Очередь пуста.</p>';
      // Do not replace a selected text field during background checks.
      if (markup === lastMarkup || dialog.querySelector('.outbox-text:focus')) return;
      lastMarkup = markup;
      const list = dialog.querySelector('[data-outbox-list]'); list.innerHTML = markup;
      list.querySelectorAll('[data-id]').forEach(row => {
        const item = all.find(candidate => candidate.id === row.dataset.id);
        row.querySelector('[data-text]').onclick = () => { const text = row.querySelector('textarea'); text.hidden = !text.hidden; if (!text.hidden) { text.focus(); text.select(); } };
        row.querySelector('[data-file]')?.addEventListener('click', () => { const url = URL.createObjectURL(item.blob), link = document.createElement('a'); link.href = url; link.download = item.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
        row.querySelector('[data-retry]')?.addEventListener('click', async () => { try { await queue.retry(item.id); void queue.pump(); } catch (error) { toast(error.message,true); } });
        row.querySelector('[data-stop]')?.addEventListener('click', async () => { try { await queue.stop(item.id); } catch (error) { toast(error.message,true); } });
      });
    } catch (error) { if (dialog.open && expected === owner) dialog.querySelector('[data-outbox-list]').textContent = `Хранилище недоступно: ${error.message}`; }
  };
  const queue = createOutboxQueue({ store,
    verifyOwner: async expected => { const actual = await request('/api/me', { owner: expected }); if (actual.id !== expected) throw Object.assign(new Error('Аккаунт изменился'), { code: 'outbox_owner_changed' }); },
    online: () => navigator.onLine,
    send: item => {
      if (item.kind === 'capture') return request('/api/personal/capture', { owner:item.owner, body:{...item.payload,requestKey:item.payload.requestKey || item.id.replaceAll('-','')} });
      if (item.kind === 'note-to-plan') return request(`/api/personal/notes/${encodeURIComponent(item.note)}/plan`, { owner:item.owner, body:item.payload });
      if (item.kind === 'habit-checkin') return request(`/api/personal/habits/${encodeURIComponent(item.habit)}/checkins/${item.date}`, { owner: item.owner, method: 'PUT', body: item.payload }).then(result => ({ ...result, id: `${item.habit}:${item.date}` }));
      if (item.kind === 'note' || item.kind === 'plan') return request(`/api/personal/${item.kind}s`, { owner: item.owner, body: { ...item.payload, requestKey: item.noteRequestKey || item.id } });
      if (item.kind === 'note-attachment') return noteFileRequest(item);
      if (item.kind === 'message') return request(`/api/chat/threads/${encodeURIComponent(item.thread)}/messages`, { owner: item.owner, workspace: item.workspace, body: { ...item.payload, clientNonce: item.id } });
      const body = new FormData(); body.append('file',item.blob,item.fileName); body.append('clientNonce',item.id);
      for (const [key,value] of Object.entries(item.payload)) body.append(key,value);
      return request(`/api/chat/threads/${encodeURIComponent(item.thread)}/attachments`, { owner: item.owner, workspace: item.workspace, body, timeout: 120000 });
    },
    changed: () => { void refresh(); channel?.postMessage('changed'); window.dispatchEvent(new Event('tessavie-outbox-change')); },
    confirmed: (item,result) => { onConfirmed(item,result); void prune(item.owner); },
    authRequired: () => onAuthRequired(),
  });
  async function prune(expected) {
    try { const all=await store.list(expected), needed=new Set(all.filter(item=>item.kind==='note-attachment'&&item.status!=='confirmed').map(item=>item.noteRequestKey)); const entries=all.filter(item=>item.status==='confirmed'&&!(item.kind==='note'&&needed.has(item.noteRequestKey||item.id))).sort((a,b)=>b.confirmedAt-a.confirmedAt); for(const entry of entries.slice(50))await store.update(entry.id,item=>item.status==='confirmed'?null:undefined); } catch (_) {}
  }
  const open = () => { lastMarkup = ''; openDialog(dialog); void refresh(); };
  trigger.onclick = open; local.querySelector('[data-open-outbox]').onclick = open;
  if (typeof BroadcastChannel !== 'undefined') { channel = new BroadcastChannel('tessavie-outbox'); channel.onmessage = event => { if (event.data === 'logout') { void ui.signOut(); onAuthRequired(); } else { void refresh(); window.dispatchEvent(new Event('tessavie-outbox-change')); } }; }
  window.addEventListener('online', () => { void queue.pump(); });
  setInterval(() => { void queue.pump(); }, 10000);
  const ui = {
    async signIn(account) {
      owner = account.id; queue.setOwner(owner); trigger.hidden = false; local.hidden = true;
      try { await store.setIdentity(account); } catch (_) { /* enqueue reports the storage error without clearing the form. */ }
      void queue.pump();
    },
    async signOut({ broadcast = false } = {}) {
      owner = null; queue.setOwner(null); refreshVersion++; trigger.hidden = true; local.hidden = true; lastMarkup = '';
      dialog.querySelector('[data-outbox-list]').replaceChildren(); if (dialog.open) dialog.close();
      if (broadcast) channel?.postMessage('logout');
      try { await store.setIdentity(null); } catch (_) {}
    },
    async offline() {
      let account; try { account = await store.identity(); } catch (_) { return false; }
      if (!account?.id) return false;
      owner = account.id; queue.setOwner(owner); onOfflineIdentity(account);
      document.querySelector('#app-root').hidden = true; document.querySelector('#auth-root').hidden = true;
      local.hidden = false; local.querySelector('[data-local-account]').textContent = `Локальный аккаунт: ${account.username}`;
      void queue.pump(); return true;
    },
    async addHabit(habit,date,payload,expected,title) {
      const pending = (await store.list(expected)).some(item => item.kind === 'habit-checkin' && item.habit === habit && item.date === date && item.status !== 'confirmed');
      if (pending) throw new Error('Для этого дня уже есть ожидающий результат. Проверьте очередь отправки.');
      await queue.enqueue([{ kind: 'habit-checkin', habit, date, payload, title }], expected);
    },
    async pendingHabits(expected) { return (await store.list(expected)).filter(item => item.kind === 'habit-checkin' && item.status !== 'confirmed'); },
    async addPersonal(kind,payload,expected,{files=[],requestKey=''}={}) {
      if(files.length&&!requestKey)throw new Error('Не найден ключ заметки для файлов. Откройте редактор снова.');
      await queue.enqueue(noteCreateEntries(kind,payload,files,requestKey),expected);
    },
    async addCapture(body,requestKey,expected){return queue.enqueue([captureEntry(body,requestKey)],expected);},
    async pendingCaptures(expected){return (await store.list(expected)).filter(item=>item.kind==='capture'&&item.status!=='confirmed');},
    async addTriage(note,payload,expected){return queue.enqueue([{kind:'note-to-plan',note,payload,title:payload.title}],expected);},
    async pendingTriage(note,expected){return (await store.list(expected)).filter(item=>item.kind==='note-to-plan'&&item.note===note&&!['confirmed','paused'].includes(item.status));},
    stop: id=>queue.stop(id),
    retry: async id=>{await queue.retry(id);void queue.pump();},
    async chatItems(expected){return (await store.list(expected)).filter(item=>['message','attachment'].includes(item.kind));},
    async addNoteFiles(files,context){await queue.enqueue(files.map(file=>({...context,kind:'note-attachment',payload:{},blob:file,fileName:file.name})),context.owner);},
    async pendingNoteFiles(expected){return pendingNoteFileEntries(await store.list(expected));},
    context(thread, destination) { return { owner: user()?.id, workspace: workspace(), thread, destination }; },
    async addMessage(payload,context) { await queue.enqueue([{ ...context, kind: 'message', payload, title: payload.body.slice(0,120) || 'Связанная карточка' }],context.owner); },
    async addFiles(files,context,payload) {
      if (files.some(file => file.size > 15*1024*1024)) throw new Error('Файл должен быть не больше 15 МБ. Файлы не добавлены в очередь.');
      await queue.enqueue(files.map(file => ({ ...context, kind: 'attachment', fileName: file.name, blob: file, payload })),context.owner);
    },
    pump: () => queue.pump(), open,
  };
  if ('serviceWorker' in navigator) {
    watchShellUpdates(navigator.serviceWorker, toastAction, reloadInterface, { onPendingChange: onShellUpdate, loadedVersion: 'tessavie-shell-20260915-media-variants-1' });
    navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(registration => { void registration.update?.(); return navigator.serviceWorker.ready; }).then(() => { local.querySelector('[data-offline-ready]').textContent = 'Оболочка доступна для следующего запуска без сети.'; }).catch(() => { local.querySelector('[data-offline-ready]').textContent = 'Оболочка ещё не сохранена для запуска без сети.'; });
  }
  return ui;
}
