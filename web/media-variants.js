// Shared by record, note and page adapters. Storage is injected so the existing
// note/page modules can reuse this controller without circular imports.
const mediaImageTypes=new Set(['image/png','image/jpeg','image/gif','image/webp']);
const mediaVideoTypes=new Set(['video/mp4','video/webm']);
const mediaDraftLocks=new Map();
const mediaID=value=>typeof value==='string'&&/^[a-zA-Z0-9_-]{1,64}$/.test(value);
const newMediaKey=()=>crypto.randomUUID().replaceAll('-','');
export function mediaVariantsPaths(context){
 const {kind,recordId,noteId,pageId,blockId}=context;
 if(kind==='record'&&mediaID(recordId))return{variants:`/api/records/${recordId}/media-variants`,upload:`/api/records/${recordId}/attachments`};
 if(kind==='note'&&mediaID(noteId))return{variants:`/api/personal/notes/${noteId}/media-variants`,upload:`/api/personal/notes/${noteId}/attachments`};
 if(kind==='page'&&mediaID(pageId)&&mediaID(blockId)){const path=`/api/workspace/pages/${pageId}/app/media/${blockId}`;return{variants:path+'/variants',upload:path};}
 throw new Error('Материалы этого пространства недоступны.');
}
export function mediaVariantsDraftKey(context){return ['media-variants-v1',context.ownerId,context.workspaceId,context.kind,context.recordId||context.noteId||context.pageId,context.blockId||''].map(encodeURIComponent).join(':');}
export function validateVariantFiles(files,current=0){
 if(!Array.isArray(files)||!files.length||files.length+current>20)throw new Error('Выберите от 1 до 20 файлов.');
 for(const file of files)if(!file.size||file.size>15*1024*1024)throw new Error('Каждый файл должен содержать от 1 байта до 15 МБ.');
}
export function mediaVersionKind(version){return version.available===false?'':version.preview==='image'&&mediaImageTypes.has(version.contentType)?'image':version.preview==='video'&&mediaVideoTypes.has(version.contentType)?'video':'';}
export function mediaVersionSelectable(variant,version){return variant.canManage&&!variant.archived&&version.available!==false&&!version.removed;}
export function mediaVersionURL(context,variant,version){
 const path=mediaVariantsPaths(context).variants,raw=version.fileUrl;
 if(typeof raw!=='string'||!raw.startsWith('/api/')||/[\\\s]/.test(raw))throw new Error('Адрес файла недоступен. Обновите материалы.');
 const url=new URL(raw,'https://tessavie.invalid');
 if(url.origin!=='https://tessavie.invalid'||decodeURIComponent(url.pathname)!==`${path}/${variant.id}/versions/${version.id}/file`||(context.kind!=='note'&&url.searchParams.get('workspaceId')!==context.workspaceId))throw new Error('Файл относится к другому пространству. Обновите материалы.');
 return raw;
}
export function validateMediaVariants(value,context){
 if(!value||!Array.isArray(value.items)||typeof value.canCreate!=='boolean')throw new Error('Не удалось прочитать варианты. Повторите загрузку.');
 const variantIDs=new Set(),fileIDs=new Set();
 for(const item of value.items){
  if(!item||typeof item.id!=='string'||!item.id||variantIDs.has(item.id)||typeof item.name!=='string'||!Number.isInteger(item.revision)||item.revision<0||!Array.isArray(item.versions)||typeof item.canManage!=='boolean')throw new Error('Получен неполный вариант. Обновите материалы.');
  variantIDs.add(item.id);
  for(const version of item.versions){
   if(!version||typeof version.id!=='string'||!version.id||fileIDs.has(version.id)||!Number.isInteger(version.version)||version.version<1||typeof version.name!=='string'||!version.attachmentId)throw new Error('Получена неполная версия. Обновите материалы.');
   fileIDs.add(version.id);if(version.available!==false)mediaVersionURL(context,item,version);
  }
 }
 return value;
}
export function displayedMediaVersion(variant){return variant.versions.find(item=>item.id===variant.selectedVersionId)||[...variant.versions].sort((a,b)=>b.version-a.version)[0];}
export function mediaAttachmentCount(items){return new Set(items.flatMap(item=>item.versions.filter(version=>!version.removed).map(version=>version.attachmentId))).size;}
export function requireVariantUploadReceipt(value,item){
 const name=value?.name??value?.originalName,size=value?.size??value?.sizeBytes;
 if(!value?.id||typeof value.id!=='string'||name!==item.fileName||size!==item.blob.size||typeof value.contentType!=='string')throw new Error('Подтверждение файла не получено. Повторите: второй копии не будет.');
 return value.id;
}
export function mediaVariantUploadBody(item){const body=new FormData();body.append('file',item.blob,item.fileName);body.append('requestKey',item.uploadKey);return body;}
export function mediaVariantMetadataBody(item){return item.intent==='version'?{requestKey:item.requestKey,attachmentId:item.attachmentId,note:item.note,expectedRevision:item.expectedRevision}:{requestKey:item.requestKey,name:item.name.trim(),attachmentId:item.attachmentId,note:item.note};}
export function projectedMediaDraft(draft,pending){
 const files=draft.files.map(item=>({...item,...Object.fromEntries(['name','note'].filter(field=>pending.has(`file:${item.uploadKey}:${field}`)).map(field=>[field,pending.get(`file:${item.uploadKey}:${field}`).value]))}));
 const edits={...draft.edits};for(const [key,value]of pending)if(key.startsWith('variant:')){const id=key.slice(8);edits[id]={...edits[id],name:value.value};}
 return{...draft,files,edits};
}
const sizeLabel=size=>size>=1048576?`${(size/1048576).toFixed(1)} МБ`:`${Math.max(1,Math.ceil(size/1024))} КБ`;
const dateLabel=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('ru-RU',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
const versionLabel=(variant,version)=>`${variant.name} · версия ${version.version}`;
export function mediaComparisonMarkup(pairs,context,e){
 if(pairs.length!==2||pairs[0].version.id===pairs[1].version.id||pairs.some(pair=>mediaVersionKind(pair.version)!=='image'))throw new Error('Выберите два доступных изображения для сравнения.');
 return `<div class="media-compare-grid">${pairs.map(({variant,version})=>`<figure><figcaption><strong>${e(variant.name)}</strong><span>Версия ${version.version}${variant.selectedVersionId===version.id?' · выбрана':''}</span></figcaption><img src="${e(mediaVersionURL(context,variant,version))}" alt="${e(versionLabel(variant,version))}">${version.note?`<p>${e(version.note)}</p>`:''}<small>${e(dateLabel(version.createdAt))}${version.createdByName?' · '+e(version.createdByName):''}</small></figure>`).join('')}</div><p class="muted">Изображения показаны целиком в одинаковой области, без обрезки.</p><p data-media-view-error role="alert"></p>`;
}
export function mediaVariantsGalleryMarkup(items,context,e,icon,selection=new Set(),showArchived=false){
 const visible=items.filter(item=>showArchived||!item.archived);
 return visible.map(item=>{
  const version=displayedMediaVersion(item);if(!version)return '';
  const kind=mediaVersionKind(version),url=version.available===false?'':mediaVersionURL(context,item,version);
  return `<article class="media-variant-card ${item.archived?'is-archived':''}"><button type="button" class="media-variant-preview" data-variant-preview="${e(item.id)}" ${version.available===false?'disabled':''} aria-label="Открыть ${e(versionLabel(item,version))}">${kind==='image'?`<img src="${e(url)}" alt="" loading="lazy">`:`<span class="media-variant-placeholder">${icon(kind==='video'?'play':'fileText')}</span>`}<span class="media-variant-title">${e(item.name)}</span><span class="media-variant-meta">Версия ${version.version}${item.selectedVersionId?' · выбрана':''}${item.archived?' · в архиве':''}</span>${version.note?`<span class="media-variant-caption">${e(version.note)}</span>`:''}</button><div class="media-variant-actions"><button type="button" class="text-button" data-variant-history="${e(item.id)}">Версии · ${item.versions.length}</button>${item.canManage&&!item.archived?`<button type="button" class="text-button" data-variant-upload="${e(item.id)}">${icon('plus')} Новая версия</button>`:''}</div>${kind==='image'?`<label class="media-variant-compare-check"><input type="checkbox" data-variant-compare="${e(version.id)}" ${selection.has(version.id)?'checked':''}> Для сравнения</label>`:''}</article>`;
 }).join('')||'<div class="media-variants-empty"><p>Здесь появятся варианты и их версии.</p><span class="muted">Добавьте эскиз, фотографию или документ. Прежние версии сохранятся.</span></div>';
}

async function serializeMediaDraft(key,action){
 const previous=mediaDraftLocks.get(key)||Promise.resolve();
 const next=previous.catch(()=>{}).then(()=>globalThis.navigator?.locks?.request?globalThis.navigator.locks.request('tessavie-'+key,action):action());mediaDraftLocks.set(key,next);
 try{return await next;}finally{if(mediaDraftLocks.get(key)===next)mediaDraftLocks.delete(key);}
}

export function createMediaVariantsUI({state,api,escapeHTML:e,icon,openModal,requestDialogClose,toast,draftStore}){
 if(!draftStore)throw new Error('Для материалов нужно хранилище черновиков.');
 const views=new Map();let generation=0;
 const q=(selector,root)=>root.querySelector(selector),qa=(selector,root)=>[...root.querySelectorAll(selector)];
 function mount(root,context){
  if(!root)return{addFiles:async()=>{},refresh:async()=>{},dispose(){}};
  for(const [host,view]of views)if(!view.alive())views.delete(host);
  const paths=mediaVariantsPaths(context),scope=mediaVariantsDraftKey(context),epoch=generation,token={};
  let items=[],canCreate=false,draft={key:scope,files:[],edits:{}},busy=false,storageError='',error='',showArchived=false,loadSequence=0,pickerVariant='';
  const selection=new Set(),pendingText=new Map(),mutating=new Set();let textSequence=0;
  const alive=()=>epoch===generation&&views.get(root)?.token===token&&root.isConnected&&state.me?.id===context.ownerId&&state.activeWorkspaceId===context.workspaceId&&(!context.isCurrent||context.isCurrent());
  const call=(path,options={})=>api(path,{...options,headers:{...options.headers,'X-Workspace-ID':context.workspaceId,'X-Outbox-Owner':String(context.ownerId)}});
  const findPair=id=>{for(const variant of items){const version=variant.versions.find(row=>row.id===id);if(version)return{variant,version};}return null;};
  const variantPath=id=>paths.variants+'/'+encodeURIComponent(id);
  const changed=()=>{if(alive())context.onChange?.({items,canCreate,attachmentCount:mediaAttachmentCount(items)});};
  const updateDraft=async change=>serializeMediaDraft(scope,async()=>{const latest=await draftStore.get(scope)||draft;const next=change(latest);await draftStore.put(next);draft=next;return next;});
  const draftStatus=()=>{if(alive()){const status=q('[data-media-draft-status]',root);if(status)status.textContent=pendingText.size?'Сохраняем подписи на устройстве…':'Файлы и подписи сохранены на этом устройстве. Закрытие окна их не удаляет.';}};
  function rememberText(key,value,change){
   const sequence=++textSequence;pendingText.set(key,{value,sequence});draftStatus();
   return updateDraft(change).then(()=>{if(pendingText.get(key)?.sequence===sequence)pendingText.delete(key);draftStatus();}).catch(err=>{storageError='Не удалось сохранить подпись на устройстве: '+err.message;errorLine();throw err;});
  }
  root.classList.add('media-variants');
  root.innerHTML=`<div class="media-variants-toolbar"><button type="button" class="secondary" data-variant-add disabled>${icon('plus')} Добавить вариант</button><button type="button" class="secondary" data-variants-compare disabled>Сравнить изображения</button><button type="button" class="text-button" data-variants-archive hidden>Архив</button><button type="button" class="icon-button" data-variants-refresh aria-label="Обновить материалы">${icon('rotate')}</button><input type="file" hidden multiple data-variants-picker aria-label="Выбрать файлы варианта"></div><p class="media-variants-hint muted">Изображения, видео и документы · до 15 МБ. Новая версия сохраняет предыдущую.</p><div data-variants-gallery class="media-variants-grid"></div><div data-variants-queue></div><p data-variants-error role="alert"></p>`;
  function errorLine(){if(alive())q('[data-variants-error]',root).textContent=storageError||error;}
  function draw(){
   if(!alive())return;
   const shownDraft=projectedMediaDraft(draft,pendingText);
   for(const id of selection){const pair=findPair(id);if(!pair||mediaVersionKind(pair.version)!=='image'||pair.variant.archived&&!showArchived)selection.delete(id);}
   q('[data-variants-gallery]',root).innerHTML=mediaVariantsGalleryMarkup(items,context,e,icon,selection,showArchived);
   q('[data-variant-add]',root).hidden=!canCreate;q('[data-variant-add]',root).disabled=busy||!!storageError;
   const compare=q('[data-variants-compare]',root);compare.disabled=selection.size!==2;compare.textContent=selection.size?`Сравнить · ${selection.size} из 2`:'Сравнить изображения';compare.hidden=!items.some(item=>item.versions.some(version=>mediaVersionKind(version)==='image'));
   const archive=q('[data-variants-archive]',root);archive.hidden=!items.some(item=>item.archived);archive.textContent=showArchived?'Скрыть архив':'Архив';
   q('[data-variants-queue]',root).innerHTML=shownDraft.files.length?`<section class="media-variants-queue"><h4>${busy?'Отправляем материалы':'Ожидают отправки'} · ${shownDraft.files.length}</h4><p class="muted" data-media-draft-status></p>${shownDraft.files.map(item=>`<div class="media-upload-draft" data-upload-draft="${e(item.uploadKey)}"><strong>${e(item.fileName)}</strong><small>${sizeLabel(item.blob.size)}${item.attachmentId?' · файл уже на сервере, сохраняем версию':''}${item.intent==='version'?' · новая версия «'+e(items.find(v=>v.id===item.variantId)?.name||item.variantName||'Вариант')+'»':''}</small>${item.intent==='create'?`<label>Название варианта<input data-media-draft-field="name" maxlength="160" value="${e(item.name)}" ${item.frozen||busy?'disabled':''}></label>`:''}<label>Что изменилось или изображено<textarea data-media-draft-field="note" rows="2" maxlength="2000" ${item.frozen||busy?'disabled':''}>${e(item.note)}</textarea></label>${item.error?`<p role="alert">${e(item.error)}</p>`:''}<div class="media-upload-actions">${item.conflict?`<button type="button" class="secondary" data-media-review-conflict="${e(item.uploadKey)}" ${busy?'disabled':''}>Проверить изменения</button>`:''}<button type="button" class="text-button" data-media-remove-draft="${e(item.uploadKey)}" ${busy?'disabled':''}>Убрать из очереди</button></div></div>`).join('')}<button type="button" class="primary" data-media-send ${busy||storageError||!canCreate?'disabled':''}>${busy?'Отправляется…':'Загрузить выбранные'}</button></section>`:'';
   draftStatus();
   errorLine();
   qa('[data-variant-preview]',root).forEach(button=>button.onclick=()=>{const item=items.find(value=>value.id===button.dataset.variantPreview);if(item)showVersion(item,displayedMediaVersion(item));});
   qa('[data-variant-history]',root).forEach(button=>button.onclick=()=>showHistory(button.dataset.variantHistory));
   qa('[data-variant-upload]',root).forEach(button=>button.onclick=()=>chooseFiles(button.dataset.variantUpload));
   qa('[data-variant-compare]',root).forEach(input=>input.onchange=()=>toggleCompare(input.dataset.variantCompare,input.checked));
   qa('[data-media-draft-field]',root).forEach(input=>input.oninput=()=>{const key=input.closest('[data-upload-draft]').dataset.uploadDraft,value=input.value,field=input.dataset.mediaDraftField;void rememberText(`file:${key}:${field}`,value,latest=>({...latest,files:latest.files.map(row=>row.uploadKey===key&&!row.frozen?{...row,[field]:value}:row)})).catch(()=>{});});
   qa('[data-media-remove-draft]',root).forEach(button=>button.onclick=async()=>{if(!alive()||busy)return;try{await updateDraft(latest=>({...latest,files:latest.files.filter(row=>row.uploadKey!==button.dataset.mediaRemoveDraft)}));draw();}catch(err){storageError=err.message;errorLine();}});
   qa('[data-media-review-conflict]',root).forEach(button=>button.onclick=()=>reviewConflict(button.dataset.mediaReviewConflict));
   q('[data-media-send]',root)?.addEventListener('click',pump);
  }
  function toggleCompare(id,checked){
   if(!alive())return;if(checked&&selection.size>=2&&!selection.has(id))toast?.('Для сравнения выберите два изображения. Снимите одну отметку.',true);else checked?selection.add(id):selection.delete(id);
   const button=q('[data-variants-compare]',root);button.disabled=selection.size!==2;button.textContent=selection.size?`Сравнить · ${selection.size} из 2`:'Сравнить изображения';
   qa('[data-variant-compare]',root).forEach(input=>input.checked=selection.has(input.dataset.variantCompare));
  }
  async function refresh(){
   if(!alive())return;const sequence=++loadSequence;
   try{const result=validateMediaVariants(await call(paths.variants),context);if(!alive()||sequence!==loadSequence)return;items=result.items;canCreate=result.canCreate;error='';draw();changed();}
   catch(err){if(alive()&&sequence===loadSequence){items=[];canCreate=false;error=err.message;draw();}}
  }
  const ready=Promise.resolve().then(async()=>{try{await serializeMediaDraft(scope,async()=>{draft=await draftStore.get(scope)||draft;});}catch(err){storageError='Не удалось открыть сохранённые файлы: '+err.message;}await refresh();});
  async function addFiles(selected,{variantId=''}={}){
   if(!selected?.length)return;await ready;if(!alive()||busy||storageError)return;
   const variant=variantId?items.find(item=>item.id===variantId):null;
   if(!canCreate||variantId&&(!variant?.canManage||variant.archived)){error='Нет права добавлять версии в этот вариант.';errorLine();return;}
   if(variant&&selected.length!==1){error='Для новой версии выберите один файл.';errorLine();return;}
   try{await updateDraft(latest=>{validateVariantFiles([...selected],latest.files.length);return{...latest,files:[...latest.files,...[...selected].map(file=>({fileName:file.name,blob:file,uploadKey:newMediaKey(),requestKey:newMediaKey(),intent:variant?'version':'create',variantId:variant?.id||'',variantName:variant?.name||'',expectedRevision:variant?.revision??0,name:file.name.replace(/\.[^.]+$/,'').slice(0,160)||file.name.slice(0,160),note:''}))]};});error='';draw();q('[data-variants-queue]',root)?.scrollIntoView?.({block:'nearest',behavior:'smooth'});}
   catch(err){error=err.message;errorLine();}
  }
  function chooseFiles(variantId=''){if(!alive()||busy)return;pickerVariant=variantId;const picker=q('[data-variants-picker]',root);picker.multiple=!variantId;picker.click();}
  async function pump(){
   if(!alive()||busy||storageError||!canCreate)return;busy=true;error='';draw();
   try{await serializeMediaDraft(scope,async()=>{
    draft=await draftStore.get(scope)||draft;
    for(const original of [...draft.files]){
     if(!alive())break;let item=draft.files.find(row=>row.uploadKey===original.uploadKey);if(!item)continue;
     if(!item.name.trim()||[...item.name.trim()].length>160||[...item.note].length>2000){error='Укажите название до 160 символов и подпись до 2000 символов.';break;}
     item={...item,frozen:true,error:'',conflict:false};draft={...draft,files:draft.files.map(row=>row.uploadKey===item.uploadKey?item:row)};await draftStore.put(draft);draw();
     try{
      if(!item.attachmentId){const uploaded=await call(paths.upload,{method:'POST',body:mediaVariantUploadBody(item)});item={...item,attachmentId:requireVariantUploadReceipt(uploaded,item)};draft={...draft,files:draft.files.map(row=>row.uploadKey===item.uploadKey?item:row)};await draftStore.put(draft);}
      if(!alive())break;
      const target=item.intent==='version'?variantPath(item.variantId)+'/versions':paths.variants;
      const result=await call(target,{method:'POST',body:JSON.stringify(mediaVariantMetadataBody(item))});
      validateMediaVariants({items:[result],canCreate:true},context);
      if((item.intent==='version'&&result.id!==item.variantId)||!result.versions.some(version=>version.attachmentId===item.attachmentId))throw new Error('Подтверждение версии не получено. Повторите запрос.');
      const next={...draft,files:draft.files.filter(row=>row.uploadKey!==item.uploadKey)};await draftStore.put(next);draft=next;
      if(alive()){loadSequence+=1;items=items.filter(row=>row.id!==result.id&&!row.versions.some(version=>version.attachmentId===item.attachmentId));items.unshift(result);draw();changed();}
     }catch(err){
      const next={...draft,files:draft.files.map(row=>row.uploadKey===item.uploadKey?{...item,error:err.message,conflict:err.status===409&&Boolean(item.attachmentId)}:row)};
      await draftStore.put(next);draft=next;error='Не всё отправлено. Файлы сохранены для повтора.';break;
     }
    }
   });}catch(err){storageError='Не удалось сохранить очередь: '+err.message;}
   finally{busy=false;if(alive()){draw();await refresh();}}
  }
  function surface(title){
   if(!alive())return null;const box=document.querySelector('#workspace-dialog'),host=document.querySelector('#workspace-dialog-content');
   if(!box||!host||box.open){toast?.('Закройте открытое окно просмотра, чтобы открыть материалы.',true);return null;}
   host.innerHTML=`<div class="workspace-editor-shell media-variants-dialog"><header><h2>${e(title)}</h2><button type="button" class="icon-button" data-media-view-close aria-label="Закрыть">${icon('x')}</button></header><div data-media-view-body></div></div>`;
   const body=q('[data-media-view-body]',host),current=()=>alive()&&box.open&&body.isConnected;
   q('[data-media-view-close]',host).onclick=()=>requestDialogClose(box);openModal(box);return{box,body,current};
  }
  function bindImageErrors(ui){qa('img,video',ui.body).forEach(node=>node.addEventListener('error',()=>{if(ui.current()){const line=q('[data-media-view-error]',ui.body);if(line)line.textContent='Файл не удалось открыть. Возможно, доступ изменился. Закройте просмотр и обновите материалы.';}}));}
  function showVersion(variant,version){
   if(!version||version.available===false)return;const ui=surface(versionLabel(variant,version));if(!ui)return;const url=mediaVersionURL(context,variant,version),kind=mediaVersionKind(version);
   ui.body.innerHTML=`${kind==='image'?`<img class="media-version-full" src="${e(url)}" alt="${e(variant.name)}">`:kind==='video'?`<video class="media-version-full" src="${e(url)}" controls playsinline preload="metadata"></video>`:'<p class="muted">Этот формат можно скачать и открыть в приложении.</p>'}<p>${e(version.note||'')}</p><p class="muted">${e(dateLabel(version.createdAt))}${version.createdByName?' · '+e(version.createdByName):''} · ${sizeLabel(version.size)}</p><a class="secondary" href="${e(url)}${url.includes('?')?'&amp;':'?'}download=1" download>Скачать файл</a><p data-media-view-error role="alert"></p>`;bindImageErrors(ui);
  }
  function showComparison(){
   if(selection.size!==2||!alive())return;const pairs=[...selection].map(findPair);if(pairs.some(pair=>!pair))return;
   const ui=surface('Сравнение изображений');if(!ui)return;ui.body.innerHTML=mediaComparisonMarkup(pairs,context,e);bindImageErrors(ui);
  }
  async function mutateVariant(variant,changes,ui=null){
   if(!alive()||!variant.canManage||mutating.has(variant.id))return null;
   mutating.add(variant.id);
   const stored=draft.edits?.[variant.id],operation=stored?.operation;
   const body=operation||{requestKey:newMediaKey(),expectedRevision:variant.revision,...changes};
   const controls=ui?qa('[name="variantName"], .media-variant-name-form button, [data-select-version], [data-variant-archive-action], [data-media-metadata-retry]',ui.body).map(node=>({node,disabled:node.disabled})):[];
   for(const control of controls)control.node.disabled=true;
   if(ui)ui.box.dataset.settingsSaving='true';
   try{
    if(!operation)await updateDraft(latest=>({...latest,edits:{...latest.edits,[variant.id]:{...latest.edits?.[variant.id],operation:body}}}));
    if(!alive())return null;
    const result=await call(variantPath(variant.id),{method:'PATCH',body:JSON.stringify(body)});validateMediaVariants({items:[result],canCreate:true},context);
    await updateDraft(latest=>{const edits={...latest.edits};delete edits[variant.id];return{...latest,edits};});
    if(alive()){loadSequence+=1;items=items.map(item=>item.id===result.id?result:item);draw();changed();}return result;
   }catch(err){
    if([400,403,404,409].includes(err.status))await updateDraft(latest=>({...latest,edits:{...latest.edits,[variant.id]:{...latest.edits?.[variant.id],operation:null}}}));
    if(err.status===409)await refresh();
    throw err;
   }finally{mutating.delete(variant.id);for(const control of controls)if(control.node.isConnected)control.node.disabled=control.disabled;if(ui?.body.isConnected)ui.box.dataset.settingsSaving='false';}
  }
  function showHistory(id){
   let variant=items.find(item=>item.id===id);if(!variant)return;const ui=surface('Версии · '+variant.name);if(!ui)return;
   const render=()=>{
    if(!ui.current())return;variant=items.find(item=>item.id===id)||variant;const edit=projectedMediaDraft(draft,pendingText).edits?.[id],pending=edit?.operation;
    ui.body.innerHTML=`${variant.canManage?`<form class="media-variant-name-form"><label>Название варианта<input name="variantName" maxlength="160" value="${e(edit?.name??variant.name)}" ${pending?'disabled':''}></label><button type="submit" class="secondary" ${pending?'disabled':''}>Сохранить название</button></form>`:`<h3>${e(variant.name)}</h3>`}${pending?'<p role="status">Ответ на изменение не получен. Повторите тот же запрос, чтобы узнать результат.</p><button type="button" class="secondary" data-media-metadata-retry>Повторить изменение</button>':''}<p class="muted">Новая загрузка сохраняет историю. Выбор отмечается отдельно и сам не меняется после загрузки.</p><div class="media-version-history">${[...variant.versions].sort((a,b)=>b.version-a.version).map(version=>{const kind=mediaVersionKind(version),url=version.available===false?'':mediaVersionURL(context,variant,version);return `<article><div class="media-version-history-heading"><strong>Версия ${version.version}${variant.selectedVersionId===version.id?' · выбрана':''}${version.removed?' · файл в архиве':''}</strong><small>${e(dateLabel(version.createdAt))}${version.createdByName?' · '+e(version.createdByName):''}</small></div>${kind==='image'?`<img src="${e(url)}" alt="${e(version.name)}" loading="lazy">`:kind==='video'?`<video src="${e(url)}" controls playsinline preload="metadata"></video>`:''}<strong class="media-version-filename">${e(version.name)}</strong>${version.note?`<p>${e(version.note)}</p>`:''}<div class="media-version-history-actions">${version.available===false?'<span class="muted">Файл недоступен</span>':`<a class="text-button" href="${e(url)}${url.includes('?')?'&amp;':'?'}download=1" download>Скачать</a>`}${kind==='image'?`<label><input type="checkbox" data-history-compare="${e(version.id)}" ${selection.has(version.id)?'checked':''}> Для сравнения</label>`:''}${mediaVersionSelectable(variant,version)?`<button type="button" class="text-button" data-select-version="${e(version.id)}" ${pending?'disabled':''}>${variant.selectedVersionId===version.id?'Снять выбор':'Выбрать версию'}</button>`:''}</div></article>`;}).join('')}</div><div class="media-history-footer"><button type="button" class="secondary" data-history-compare-open ${selection.size!==2?'disabled':''}>Сравнить · ${selection.size} из 2</button>${variant.canManage?`<button type="button" class="text-button" data-variant-archive-action ${pending?'disabled':''}>${variant.archived?'Вернуть из архива':'В архив'}</button>`:''}</div><p data-media-view-error role="alert"></p>`;
    bindImageErrors(ui);
    const showError=err=>{if(ui.current())q('[data-media-view-error]',ui.body).textContent=err.message;};
    const apply=async changes=>{try{const changed=await mutateVariant(variant,changes,ui);if(changed&&ui.current()){variant=changed;render();}}catch(err){render();showError(err);}};
    const name=q('[name="variantName"]',ui.body);if(name){name.oninput=()=>{const value=name.value;void rememberText('variant:'+id,value,latest=>({...latest,edits:{...latest.edits,[id]:{...latest.edits?.[id],name:value}}})).catch(showError);};name.form.onsubmit=event=>{event.preventDefault();const value=name.value.trim();if(!value||[...value].length>160){showError(new Error('Укажите название до 160 символов.'));return;}void apply({name:value});};}
    q('[data-media-metadata-retry]',ui.body)?.addEventListener('click',()=>apply({}));
    qa('[data-select-version]',ui.body).forEach(button=>button.onclick=()=>apply({selectedVersionId:variant.selectedVersionId===button.dataset.selectVersion?'':button.dataset.selectVersion}));
    q('[data-variant-archive-action]',ui.body)?.addEventListener('click',()=>apply({archived:!variant.archived}));
    qa('[data-history-compare]',ui.body).forEach(input=>input.onchange=()=>{toggleCompare(input.dataset.historyCompare,input.checked);input.checked=selection.has(input.dataset.historyCompare);const compare=q('[data-history-compare-open]',ui.body);compare.disabled=selection.size!==2;compare.textContent=`Сравнить · ${selection.size} из 2`;});
    q('[data-history-compare-open]',ui.body).onclick=async()=>{if(selection.size!==2)return;if(await requestDialogClose(ui.box))showComparison();};
   };render();
  }
  async function reviewConflict(key){
   if(!alive()||busy)return;await refresh();const item=draft.files.find(row=>row.uploadKey===key);if(!item)return;
   const variant=items.find(row=>row.id===item.variantId);const ui=surface('История изменилась');if(!ui)return;
   if(!variant?.canManage||variant.archived){ui.body.innerHTML='<p>Вариант недоступен для добавления версии. Файл остаётся сохранён в очереди.</p>';return;}
   const existing=variant.versions.find(row=>row.attachmentId===item.attachmentId);
   ui.body.innerHTML=existing?`<p>Этот файл уже сохранён как версия ${existing.version}. Его не нужно загружать снова.</p><button type="button" class="primary" data-media-conflict-accept>Убрать подтверждённый файл из очереди</button>`:`<p>Вариант «${e(variant.name)}» теперь содержит ${variant.versions.length} версий. Ваш файл «${e(item.fileName)}» уже загружен и сохранён. Добавить его следующей версией?</p><button type="button" class="primary" data-media-conflict-accept>Добавить к текущей истории</button>`;
   q('[data-media-conflict-accept]',ui.body).onclick=async()=>{if(!ui.current())return;ui.box.dataset.settingsSaving='true';try{await updateDraft(latest=>({...latest,files:existing?latest.files.filter(row=>row.uploadKey!==key):latest.files.map(row=>row.uploadKey===key?{...row,expectedRevision:variant.revision,requestKey:newMediaKey(),error:'',conflict:false}:row)}));ui.box.dataset.settingsSaving='false';await requestDialogClose(ui.box);draw();if(!existing)void pump();}catch(err){ui.box.dataset.settingsSaving='false';error=err.message;errorLine();}};
  }
  q('[data-variant-add]',root).onclick=()=>chooseFiles();
  q('[data-variants-picker]',root).onchange=event=>{const files=[...event.target.files],variantId=pickerVariant;event.target.value='';pickerVariant='';void addFiles(files,{variantId});};
  q('[data-variants-archive]',root).onclick=()=>{showArchived=!showArchived;draw();};
  q('[data-variants-compare]',root).onclick=showComparison;
  q('[data-variants-refresh]',root).onclick=refresh;
  const pasted=event=>{const files=[...(event.clipboardData?.files||[])];if(files.length){event.preventDefault();event.stopPropagation();void addFiles(files);}};
  const dragged=event=>{if(event.dataTransfer?.types?.includes('Files')){event.preventDefault();root.classList.add('receiving-files');}};
  const dropped=event=>{const files=[...(event.dataTransfer?.files||[])];root.classList.remove('receiving-files');if(files.length){event.preventDefault();event.stopPropagation();void addFiles(files);}};
  const left=()=>root.classList.remove('receiving-files');
  root.addEventListener('paste',pasted);root.addEventListener('dragover',dragged);root.addEventListener('drop',dropped);root.addEventListener('dragleave',left);
  const dispose=()=>{views.delete(root);root.removeEventListener('paste',pasted);root.removeEventListener('dragover',dragged);root.removeEventListener('drop',dropped);root.removeEventListener('dragleave',left);};
  views.set(root,{token,alive,dispose});
  return{addFiles,refresh,dispose,ready};
 }
 return{mount,reset(){generation+=1;for(const view of views.values())view.dispose();views.clear();}};
}
