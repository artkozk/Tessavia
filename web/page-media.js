import { createNoteFileDraftStore, validateNoteFiles } from './note-media.js?v=20260915-finance-constructor-1';

export function privateMediaKind(type) {
  if (['image/png','image/jpeg','image/gif','image/webp'].includes(type)) return 'image';
  if (['video/mp4','video/webm'].includes(type)) return 'video';
  return '';
}
export function pageMediaDraftKey(owner,workspace,page,block) {
  return ['page-media-v1',owner,workspace,page,block].map(encodeURIComponent).join(':');
}
export function mediaFileURL(page,block,file,workspace) {
  return `/api/workspace/pages/${encodeURIComponent(page)}/app/media/${encodeURIComponent(block)}/${encodeURIComponent(file)}/file?workspaceId=${encodeURIComponent(workspace)}`;
}
export function requireMediaUploadReceipt(uploaded,item) {
  if(!uploaded||typeof uploaded.id!=='string'||!uploaded.id||uploaded.name!==item.name||uploaded.size!==item.blob.size||typeof uploaded.contentType!=='string')throw new Error('Подтверждение загрузки не получено. Повторите отправку: второй копии не будет.');
  return uploaded;
}
export function privateMediaPreviewMarkup(item,url,e) {
  const kind=privateMediaKind(item.contentType);
  return `${kind==='image'?`<img class="private-media-image" src="${e(url)}" alt="${e(item.name)}">`:kind==='video'?`<video class="private-media-video" src="${e(url)}" controls playsinline preload="metadata" aria-label="${e(item.name)}"></video>`:'<p class="muted">Этот формат можно скачать и открыть в приложении.</p>'}<p data-media-preview-error role="alert"></p>`;
}
export function mediaTileMarkup(item,url,e,icon,{manage=true}={}) {
  const kind=privateMediaKind(item.contentType),size=item.size>=1048576?`${(item.size/1048576).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(item.size/1024))} КБ`;
  const date=item.createdAt&&Number.isFinite(Date.parse(item.createdAt))?new Date(item.createdAt).toLocaleString('ru-RU'):'';
  const attribution=[item.uploaderUsername,date].filter(Boolean).join(' · ');
  return `<article class="page-media-tile ${item.removedAt?'is-removed':''}"><button type="button" class="page-media-open" data-media-open="${e(item.id)}" aria-label="Открыть ${e(item.name)}">${kind==='image'?`<img src="${e(url)}" loading="lazy" alt="">`:`<span class="page-media-placeholder">${icon(kind==='video'?'play':'fileText')}</span>`}<strong>${e(item.name)}</strong><small>${size}${item.removedAt?' · В архиве':''}</small>${attribution?`<small>${e(attribution)}</small>`:''}</button><div class="page-media-file-actions"><a class="text-button" href="${e(url)}&amp;download=1" download>Скачать</a>${manage&&item.canManage?`<button type="button" class="text-button" data-media-state="${e(item.id)}">${item.removedAt?'Восстановить':'В архив'}</button>`:''}</div></article>`;
}

const recordMediaItem=file=>({id:file.id,name:file.originalName,contentType:file.contentType,size:file.sizeBytes,uploaderUsername:file.uploaderUsername,createdAt:file.createdAt});
export function recordMediaMarkup(files,workspace,e,icon) {
  return files.map(file=>mediaTileMarkup(recordMediaItem(file),`/api/attachments/${encodeURIComponent(file.id)}/download?preview=1&workspaceId=${encodeURIComponent(workspace)}`,e,icon,{manage:false})).join('');
}
export function bindRecordMediaPreview(root,files,{state,workspace,escapeHTML:e,icon,openModal,requestDialogClose}) {
  if(!root)return;
  const owner=state.me?.id,alive=()=>root.isConnected&&state.me?.id===owner&&state.activeWorkspaceId===workspace;
  const viewer=createPageMediaUI({state,escapeHTML:e,icon,openModal,requestDialogClose});
  root.querySelectorAll('[data-media-open]').forEach(button=>button.onclick=()=>{
    const file=files.find(item=>item.id===button.dataset.mediaOpen);if(!file||!alive())return;
    viewer.showPreview(recordMediaItem(file),`/api/attachments/${encodeURIComponent(file.id)}/download?preview=1&workspaceId=${encodeURIComponent(workspace)}`,alive);
  });
}

export function createPageMediaUI({state,api,escapeHTML:e,icon,openModal,requestDialogClose,toast}) {
  const drafts=createNoteFileDraftStore(),q=(s,r=document)=>r.querySelector(s),qa=(s,r=document)=>[...r.querySelectorAll(s)];
  const locks=new Map();
  const locked=async(key,action)=>{
    const previous=locks.get(key)||Promise.resolve();
    const next=previous.catch(()=>{}).then(action);locks.set(key,next);
    try{return await next;}finally{if(locks.get(key)===next)locks.delete(key);}
  };
  const fileURL=(context,block,file)=>mediaFileURL(context.page.id,block.id,file.id,context.workspace);
  function showPreview(item,url,alive) {
    if(!alive())return;
    const box=q('#workspace-dialog'),host=q('#workspace-dialog-content');
    if(box.open)return;
    host.innerHTML=`<div class="workspace-editor-shell private-media-preview"><header><h2>${e(item.name)}</h2><button type="button" class="icon-button" data-media-close aria-label="Закрыть">${icon('x')}</button></header>${privateMediaPreviewMarkup(item,url,e)}<a class="secondary" href="${e(url)}&amp;download=1" download>Скачать файл</a></div>`;
    q('[data-media-close]',host).onclick=()=>requestDialogClose(box);
    q('img,video',host)?.addEventListener('error',()=>{if(alive())q('[data-media-preview-error]',host).textContent='Не удалось открыть файл. Проверьте соединение и попробуйте ещё раз.';});
    openModal(box);
  }
  function mount(root,definition,context) {
    for(const block of definition.blocks.filter(item=>item.kind==='media')) {
      const host=q(`[data-app-media="${block.id}"]`,root);if(!host)continue;
      const owner=context.ownerId,scope=pageMediaDraftKey(owner,context.workspace,context.page.id,block.id),path=`/api/workspace/pages/${context.page.id}/app/media/${block.id}`;
      const alive=()=>host.isConnected&&state.me?.id===owner&&state.activeWorkspaceId===context.workspace&&state.view===`page:${context.page.id}`;
      const call=(suffix='',options={})=>api(path+suffix,{...options,headers:{...options.headers,'X-Workspace-ID':context.workspace,'X-Outbox-Owner':String(owner)}});
      let files=[],draft={key:scope,files:[]},busy=false,showRemoved=false,error='',storageError=false;
      host.innerHTML=`<div class="page-media-toolbar"><button type="button" class="secondary" data-media-choose>${icon('plus')} Добавить фото или файлы</button><input type="file" multiple hidden data-media-picker aria-label="Выбрать медиа и файлы"><button type="button" class="text-button" data-media-archive hidden>Архив файлов</button></div><p class="muted page-media-hint">Фото, видео и документы · до 15 МБ. Можно вставить из буфера или перетащить сюда.</p><div class="page-media-grid" data-media-grid></div><div data-media-pending></div><p role="status" data-media-status></p><p role="alert" data-media-error></p>`;
      const draw=()=>{
        if(!alive())return;
        q('[data-media-grid]',host).innerHTML=files.filter(item=>showRemoved||!item.removedAt).map(item=>mediaTileMarkup(item,fileURL(context,block,item),e,icon)).join('')||'<p class="muted">Здесь появятся изображения и материалы этого блока.</p>';
        q('[data-media-pending]',host).innerHTML=draft.files.length?`<div class="page-media-pending"><p>${busy?'Отправляем':'Ожидают отправки'} · ${draft.files.length}. Файлы сохранены на этом устройстве.</p>${draft.files.map(item=>`<div><span>${e(item.name)}</span><button type="button" class="text-button" data-media-pending-remove="${e(item.requestKey)}" ${busy?'disabled':''}>Убрать</button></div>`).join('')}<button type="button" class="secondary" data-media-retry ${busy||storageError?'disabled':''}>${busy?'Отправляется…':'Повторить отправку'}</button></div>`:'';
        q('[data-media-error]',host).textContent=error;
        q('[data-media-choose]',host).disabled=busy||storageError;
        const archive=q('[data-media-archive]',host);archive.hidden=!files.some(item=>item.removedAt);archive.textContent=showRemoved?'Скрыть архив':'Архив файлов';
        qa('[data-media-open]',host).forEach(button=>button.onclick=()=>{const item=files.find(f=>f.id===button.dataset.mediaOpen);showPreview(item,fileURL(context,block,item),alive);});
        qa('[data-media-state]',host).forEach(button=>button.onclick=async()=>{
          if(busy||!alive())return;const item=files.find(f=>f.id===button.dataset.mediaState);button.disabled=true;
          try{const changed=await call('/'+item.id,{method:'PATCH',body:JSON.stringify({removed:!item.removedAt,expectedUpdatedAt:item.updatedAt})});if(alive()){files=files.map(f=>f.id===item.id?changed:f);error='';draw();}}
          catch(err){if(alive()){error=err.message;draw();}}
        });
        qa('[data-media-pending-remove]',host).forEach(button=>button.onclick=async()=>{
          if(busy||!alive())return;busy=true;const next={...draft,files:draft.files.filter(item=>item.requestKey!==button.dataset.mediaPendingRemove)};draw();
          try{await locked(scope,async()=>{const latest=await drafts.get(scope)||draft;const next={...latest,files:latest.files.filter(item=>item.requestKey!==button.dataset.mediaPendingRemove)};await drafts.put(next);draft=next;});error='';}catch(err){error=err.message;}finally{busy=false;draw();}
        });
        q('[data-media-retry]',host)?.addEventListener('click',pump);
      };
      async function pump(){
        if(busy||storageError||!alive())return;busy=true;error='';draw();
        try{await locked(scope,async()=>{
          draft=await drafts.get(scope)||draft;
          while(draft.files.length&&alive()){
            const item=draft.files[0],body=new FormData();body.append('file',item.blob,item.name);body.append('requestKey',item.requestKey);
            const uploaded=await call('',{method:'POST',body});
            requireMediaUploadReceipt(uploaded,item);
            // Persist receipt removal before the next upload. A failed local commit
            // retains the same request key and server replay cannot create a copy.
            const next={...draft,files:draft.files.filter(f=>f.requestKey!==item.requestKey)};
            await drafts.put(next);draft=next;
            if(alive()){files=files.some(f=>f.id===uploaded.id)?files.map(f=>f.id===uploaded.id?uploaded:f):[...files,uploaded];draw();}
          }
          // A previous render may have finished an upload while this render
          // waited for the same draft lock. Refresh metadata after acquiring it.
          if(alive()){const result=await call();if(Array.isArray(result))files=result;}
        });}catch(err){error=err.message||'Не удалось отправить файл. Он остался на этом устройстве.';}
        finally{busy=false;draw();}
      }
      const ready=(async()=>{
        try{draft=await drafts.get(scope)||draft;}catch(err){storageError=true;error='Файлы пока нельзя сохранить на устройстве: '+err.message;}
        try{const result=await call();if(!Array.isArray(result))throw new Error('Не удалось прочитать список файлов. Откройте страницу ещё раз.');if(alive())files=result;}catch(err){error=err.message;}
        if(alive()){draw();if(draft.files.length&&!storageError)void pump();}
      })();
      async function add(selected){
        if(!selected.length)return;await ready;if(!alive()||busy||storageError)return;
        busy=true;draw();
        try{await locked(scope,async()=>{
          const latest=await drafts.get(scope)||draft;
          validateNoteFiles(selected,latest.files.length);
          const next={key:scope,files:[...latest.files,...selected.map(file=>({name:file.name,blob:file,requestKey:crypto.randomUUID().replaceAll('-','')}))]};
          await drafts.put(next);draft=next;error='';
        });
        }catch(err){error=err.message;}
        finally{busy=false;draw();}
        if(!error&&alive())void pump();
      }
      q('[data-media-choose]',host).onclick=()=>q('[data-media-picker]',host).click();
      q('[data-media-picker]',host).onchange=event=>{void add([...event.target.files]);event.target.value='';};
      q('[data-media-archive]',host).onclick=()=>{showRemoved=!showRemoved;draw();};
      host.addEventListener('paste',event=>{const selected=[...(event.clipboardData?.files||[])];if(selected.length){event.preventDefault();event.stopPropagation();void add(selected);}});
      host.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();host.classList.add('receiving-files');}});
      host.addEventListener('dragleave',()=>host.classList.remove('receiving-files'));
      host.addEventListener('drop',event=>{const selected=[...(event.dataTransfer?.files||[])];host.classList.remove('receiving-files');if(selected.length){event.preventDefault();event.stopPropagation();void add(selected);}});
    }
  }
  return {mount,showPreview};
}
