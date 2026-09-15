export function validateNoteFiles(files,current=0){
  if(files.length+current>20)throw new Error('За один раз можно добавить до 20 файлов.');
  for(const file of files){if(!file.size||file.size>15*1024*1024)throw new Error('Каждый файл должен содержать от 1 байта до 15 МБ.');}
}

// File drafts are separate from text localStorage and survive closing/reloading
// a new note. A successful queue transaction owns the Blobs before removal here.
export function createNoteFileDraftStore(indexedDB=globalThis.indexedDB){
  let opening;
  const database=()=>opening ||= new Promise((resolve,reject)=>{
    if(!indexedDB)return reject(new Error('Браузер не предоставляет хранилище файлов.'));
    const req=indexedDB.open('tessavie-note-file-drafts-v1',1);
    req.onupgradeneeded=()=>req.result.createObjectStore('drafts',{keyPath:'key'});
    req.onsuccess=()=>{req.result.onversionchange=()=>req.result.close();resolve(req.result);};
    req.onerror=()=>{opening=null;reject(req.error);};req.onblocked=()=>reject(new Error('Закройте прежнюю вкладку, чтобы открыть хранилище файлов.'));
  });
  const run=async(mode,action)=>{const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts',mode);let result;tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(tx.error||new Error('Файлы не сохранены на устройстве.'));action(tx.objectStore('drafts'),value=>{result=value;});});};
  return{get:key=>run('readonly',(store,done)=>{store.get(key).onsuccess=event=>done(event.target.result||null);}),put:item=>run('readwrite',store=>store.put(item)),remove:key=>run('readwrite',store=>store.delete(key))};
}

export function createNoteMediaUI({state,api,outbox,escapeHTML:esc,icon,renderMarkdown,openModal,closeDialog,flushDrafts,loadPersonal,openPersonalEditor,toast,askChoice}){
  const q=(s,root=document)=>root.querySelector(s),qa=(s,root=document)=>[...root.querySelectorAll(s)];
  const drafts=createNoteFileDraftStore(),editors=new Map();
  const bytes=n=>n>=1024*1024?`${(n/1024/1024).toFixed(1)} МБ`:`${Math.max(1,Math.round(n/1024))} КБ`;
  const date=value=>new Date(value).toLocaleString('ru-RU');
  const video=item=>['video/mp4','video/webm'].includes(item.contentType);
  const fileURL=item=>`/api/personal/note-attachments/${encodeURIComponent(item.id)}/file`;
  const read=(owner,path,options={})=>api(path,{...options,headers:{'X-Outbox-Owner':String(owner)}});
  function surface(title){
    const dialog=q('#workspace-dialog');if(dialog.open&&!flushDrafts(dialog)){toast('Не удалось сохранить черновик на устройстве',true);return null;}
    const content=q('#workspace-dialog-content');content.innerHTML=`<div class="workspace-editor-shell note-media-dialog"><header><h2>${esc(title)}</h2><button type="button" class="icon-button" data-media-close aria-label="Закрыть">${icon('x')}</button></header><div data-media-body></div></div>`;
    q('[data-media-close]',content).onclick=()=>closeDialog(dialog);openModal(dialog);
    return{dialog,body:q('[data-media-body]',content),owner:state.me.id};
  }
  const current=ui=>ui&&ui.owner===state.me?.id&&ui.body.isConnected&&ui.dialog.open;
  function error(ui,message,retry){if(!current(ui))return;ui.body.innerHTML=`<p role="alert">${esc(message)}</p><button type="button" class="secondary" data-media-retry>Повторить</button>`;q('[data-media-retry]',ui.body).onclick=retry;}
  function previewFile(item){
    const ui=surface(item.name);if(!ui)return;
    ui.body.innerHTML=`${item.preview?`<img class="note-file-preview" src="${fileURL(item)}" alt="${esc(item.name)}">`:video(item)?`<video class="note-file-preview" src="${fileURL(item)}" controls playsinline preload="metadata" aria-label="${esc(item.name)}"></video>`:'<p class="muted">Этот файл открывается в приложении для его формата.</p>'}<p class="muted">${bytes(item.size)}</p><a class="secondary" href="${fileURL(item)}?download=1" download>${icon('arrowDown')} Скачать файл</a><p data-media-error role="alert"></p>`;
    q('img,video',ui.body)?.addEventListener('error',()=>{if(current(ui))q('[data-media-error]',ui.body).textContent='Не удалось загрузить изображение. Проверьте соединение и откройте файл снова.';});
  }
  function fileRows(files,{readonly=false}={}){
    return files.map(item=>`<div class="note-file-row"><button type="button" class="text-button" data-file-open="${esc(item.id)}">${item.preview?`<img class="note-file-thumbnail" src="${fileURL(item)}" loading="lazy" alt="">`:icon(video(item)?'play':'fileText')}<span><strong>${esc(item.name)}</strong><small>${bytes(item.size)}${item.removedAt?' · Удалённое вложение':''}</small></span></button><a class="icon-button" aria-label="Скачать ${esc(item.name)}" href="${fileURL(item)}?download=1" download>${icon('arrowDown')}</a>${readonly?'':`<button type="button" class="icon-button" data-file-state="${esc(item.id)}" aria-label="${item.removedAt?'Восстановить':'Удалить'} ${esc(item.name)}">${icon(item.removedAt?'rotate':'trash')}</button>`}</div>`).join('');
  }
  function bindFilePreview(root,files){qa('[data-file-open]',root).forEach(button=>button.onclick=()=>previewFile(files.find(file=>file.id===button.dataset.fileOpen)));}
  function bindEditor(form,note){
    for(const [old] of editors)if(!old.isConnected)editors.delete(old);
    const root=document.createElement('section');root.className='note-files';root.innerHTML=`<div class="note-files-heading"><strong>Файлы</strong><button type="button" class="text-button" data-file-choose>${icon('plus')} Добавить файлы</button><input type="file" multiple hidden data-note-files aria-label="Выбрать файлы для заметки"></div><p class="muted note-files-hint">До 15 МБ на файл. Можно вставить фото или перетащить файлы в заметку.</p><div data-note-file-list></div><p data-file-error role="alert"></p>`;
    q('.personal-editor-actions',form).before(root);
    const editor={root,form,note,owner:state.me.id,scope:form.dataset.workingDraftScope,files:[],pending:[],draft:null,showRemoved:false,version:0,busy:false};editors.set(form,editor);
    const alive=()=>editor.owner===state.me?.id&&form.isConnected;
    const draw=()=>{
      if(!alive())return;const files=editor.files.filter(item=>editor.showRemoved||!item.removedAt),list=q('[data-note-file-list]',root);
      list.innerHTML=fileRows(files)+`${editor.files.some(item=>item.removedAt)?`<button class="text-button" type="button" data-files-removed>${editor.showRemoved?'Скрыть удалённые':'Удалённые вложения'}</button>`:''}`+(editor.draft?.files||[]).map((item,index)=>`<div class="note-file-row"><span><strong>${esc(item.name)}</strong><small>${bytes(item.blob.size)} · В черновике</small></span><button type="button" class="icon-button" data-draft-file-remove="${index}" aria-label="Убрать ${esc(item.name)}">${icon('x')}</button></div>`).join('')+editor.pending.map(item=>`<div class="note-file-pending" data-upload-id="${esc(item.id)}"><strong>${esc(item.fileName)}</strong><small>${esc(item.error||({sending:'Отправляется',blocked:'Требует действия',paused:'Повторы остановлены'}[item.status]||'В очереди отправки'))}</small><progress max="100" value="0" aria-label="Загрузка ${esc(item.fileName)}"></progress><button type="button" class="text-button" data-file-queue>Открыть очередь</button></div>`).join('');
      bindFilePreview(list,files);q('[data-files-removed]',list)?.addEventListener('click',()=>{editor.showRemoved=!editor.showRemoved;draw();});
      qa('[data-file-queue]',list).forEach(button=>button.onclick=()=>outbox().open());
      qa('[data-draft-file-remove]',list).forEach(button=>button.onclick=async()=>{if(editor.busy)return;editor.busy=true;try{const next={...editor.draft,files:editor.draft.files.filter((_,i)=>i!==Number(button.dataset.draftFileRemove))};await drafts.put(next);if(alive()){editor.draft=next;draw();}}catch(e){if(alive())q('[data-file-error]',root).textContent=e.message;}finally{editor.busy=false;}});
      qa('[data-file-state]',list).forEach(button=>button.onclick=async()=>{
        const file=files.find(item=>item.id===button.dataset.fileState);button.disabled=true;
        try{await read(editor.owner,`/api/personal/note-attachments/${file.id}`,{method:'PATCH',body:JSON.stringify({removed:!file.removedAt,expectedUpdatedAt:file.updatedAt})});await refresh();}catch(e){if(alive()){q('[data-file-error]',root).textContent=e.message;button.disabled=false;}}
      });
    };
    const refreshPending=async()=>{const version=++editor.version;try{const items=await outbox().pendingNoteFiles(editor.owner);if(alive()&&version===editor.version){editor.pending=items.filter(item=>note?item.note===note.id:item.noteRequestKey===editor.draft?.requestKey);draw();}}catch(e){if(alive())q('[data-file-error]',root).textContent=e.message;}};
    const refresh=async()=>{try{if(note){const files=await read(editor.owner,`/api/personal/notes/${note.id}/attachments`);if(!alive())return;editor.files=files;}await refreshPending();}catch(e){if(alive())q('[data-file-error]',root).textContent=e.message;}};
    editor.refresh=refresh;editor.refreshPending=refreshPending;
    editor.ready=(async()=>{if(!note){try{editor.draft=await drafts.get(editor.scope);}catch(e){editor.draftError=e;if(alive())q('[data-file-error]',root).textContent=e.message;}}if(alive())await refresh();})();
    const add=async files=>{
      if(!files.length)return;if(editor.busy){q('[data-file-error]',root).textContent='Дождитесь сохранения файлов, затем добавьте следующую порцию.';return;}editor.busy=true;
      q('[data-file-choose]',root).disabled=true;
      try{
        await editor.ready;if(!alive())return;
        validateNoteFiles(files,note?0:editor.draft?.files.length||0);
        if(note){await outbox().addNoteFiles(files,{note:note.id,owner:editor.owner,title:note.title});void outbox().pump();await refreshPending();}
        else{
          const draft=editor.draft||{key:editor.scope,requestKey:crypto.randomUUID().replaceAll('-',''),files:[]};
          const next={...draft,files:[...draft.files,...files.map(file=>({name:file.name,blob:file}))]};
          await drafts.put(next);if(alive()){editor.draft=next;editor.draftError=null;draw();}
        }
        if(alive())q('[data-file-error]',root).textContent='';
      }catch(e){if(alive())q('[data-file-error]',root).textContent=e.message;}finally{editor.busy=false;if(alive())q('[data-file-choose]',root).disabled=false;}
    };
    q('[data-file-choose]',root).onclick=()=>q('[data-note-files]',root).click();q('[data-note-files]',root).onchange=event=>{void add([...event.target.files]);event.target.value='';};
    form.addEventListener('paste',event=>{const files=[...(event.clipboardData?.files||[])];if(files.length){event.preventDefault();event.stopImmediatePropagation();void add(files);}},true);
    form.addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files')){event.preventDefault();root.classList.add('receiving-files');}});
    form.addEventListener('dragleave',()=>root.classList.remove('receiving-files'));
    form.addEventListener('drop',event=>{const files=[...(event.dataTransfer?.files||[])];if(files.length){event.preventDefault();event.stopImmediatePropagation();root.classList.remove('receiving-files');void add(files);}},true);
    if(note){const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='История версий';q('.personal-editor-actions',form).append(button);button.onclick=()=>openHistory(note,form);}
    return {
      async creation(){await editor.ready;if(editor.busy)throw new Error('Дождитесь сохранения выбранных файлов на устройстве.');if(editor.draftError)throw editor.draftError;return{files:editor.draft?.files||[],requestKey:editor.draft?.requestKey};},
      async clear(){if(editor.draft)await drafts.remove(editor.scope);},
    };
  }
  async function openHistory(note,form=null){
    if(form&&!flushDrafts(q('#personal-dialog'))){toast('Не удалось сохранить черновик',true);return;}
    const ui=surface('История заметки');if(!ui)return;ui.body.innerHTML='<p class="muted">Загружаем сохранения…</p>';
    let items=[],before=0;
    const load=async()=>{try{const page=await read(ui.owner,`/api/personal/notes/${note.id}/versions${before?'?before='+before:''}`);if(!current(ui))return;items.push(...page.items);before=page.nextBefore;draw();}catch(e){error(ui,e.message,load);}};
    const draw=()=>{
      if(!current(ui))return;const labels={baseline:'Начальная версия',created:'Создание',saved:'Сохранение',archived:'В архив',unarchived:'Из архива',restored:'Восстановление версии'};
      ui.body.innerHTML=`<p class="muted">Сохранения на сервере. При восстановлении текущая версия останется в истории; файлы и связи сохранятся.</p><div class="note-history-list">${items.map(item=>`<button class="note-history-row" type="button" data-version="${item.id}"><strong>${esc(item.title)}</strong><small>${esc(date(item.savedAt))} · ${esc(labels[item.action]||'Сохранение')}</small></button>`).join('')}</div>${before?'<button type="button" class="text-button" data-more-history>Раньше</button>':''}`;
      q('[data-more-history]',ui.body)?.addEventListener('click',event=>{event.currentTarget.disabled=true;void load();});
      qa('[data-version]',ui.body).forEach(button=>button.onclick=()=>showVersion(button.dataset.version));
    };
    const showVersion=async id=>{
      try{
        const version=await read(ui.owner,`/api/personal/notes/${note.id}/versions/${id}`);if(!current(ui))return;
        const dirty=form?.isConnected&&form.classList.contains('has-unsaved-draft');
        ui.body.innerHTML=`<button type="button" class="text-button" data-history-back>← Все версии</button><p class="muted">${esc(date(version.savedAt))}</p><h3>${esc(version.note.title)}</h3><div class="markdown-body note-version-text">${renderMarkdown(version.note.body)}</div><p class="muted">Восстановятся текст, папка, метки, закрепление и дата в календаре. Файлы, связи и принадлежность к заметке дня сохранятся.</p>${dirty?'<p role="status">В редакторе есть несохранённый текст. Сохраните заметку перед восстановлением версии.</p>':''}<div class="form-actions"><button type="button" class="primary" data-version-restore ${dirty||note.archivedAt?'disabled':''}>Восстановить эту версию</button></div>${note.archivedAt?'<p class="muted">Сначала верните заметку из архива.</p>':''}<p data-media-error role="alert"></p>`;
        q('[data-history-back]',ui.body).onclick=draw;
        q('[data-version-restore]',ui.body).onclick=async event=>{
          if(form?.isConnected&&form.classList.contains('has-unsaved-draft'))return;
          const answer=await askChoice({title:'Восстановить версию?',label:'Текущая сохранённая версия останется в истории. Файлы и связи сохранятся.',choices:[{value:'restore',label:'Восстановить версию'}]});if(answer!=='restore'||!current(ui))return;
          event.target.disabled=true;
          try{await read(ui.owner,`/api/personal/notes/${note.id}/versions/${id}/restore`,{method:'POST',body:JSON.stringify({expectedUpdatedAt:note.updatedAt})});if(!current(ui))return;await closeDialog(ui.dialog);if(form?.isConnected)await closeDialog(q('#personal-dialog'));await loadPersonal({force:true});if(ui.owner===state.me?.id){openPersonalEditor('note',note.id);toast('Версия восстановлена. Прежний текст остался в истории.');}}
          catch(e){if(current(ui)){q('[data-media-error]',ui.body).textContent=e.message;event.target.disabled=false;}}
        };
      }catch(e){error(ui,e.message,()=>showVersion(id));}
    };await load();
  }
  async function openArchive(){
    const ui=surface('Архив заметок');if(!ui)return;ui.body.innerHTML='<p class="muted">Загружаем архив…</p>';let items=[],total=0;
    const load=async()=>{try{const page=await read(ui.owner,`/api/personal/notes/archive?offset=${items.length}`);if(!current(ui))return;items.push(...page.items);total=page.total;draw();}catch(e){error(ui,e.message,load);}};
    const draw=()=>{if(!current(ui))return;ui.body.innerHTML=`<p class="muted">Заметки, файлы и история сохраняются. Автоматической очистки архива нет.</p><div class="note-history-list">${items.map(item=>`<button type="button" class="note-history-row" data-archived-note="${esc(item.id)}"><strong>${esc(item.title)}</strong><small>${esc(date(item.archivedAt))}</small></button>`).join('')||'<p>Архив пуст.</p>'}</div>${items.length<total?'<button class="text-button" type="button" data-archive-more>Показать ещё</button>':''}`;q('[data-archive-more]',ui.body)?.addEventListener('click',event=>{event.currentTarget.disabled=true;void load();});qa('[data-archived-note]',ui.body).forEach(button=>button.onclick=()=>showNote(button.dataset.archivedNote));};
    const showNote=async id=>{
      try{
        const [note,files]=await Promise.all([read(ui.owner,`/api/personal/notes/${id}`),read(ui.owner,`/api/personal/notes/${id}/attachments`)]);if(!current(ui))return;
        ui.body.innerHTML=`<button type="button" class="text-button" data-archive-back>← Архив</button><h3>${esc(note.title)}</h3><div class="markdown-body note-version-text">${renderMarkdown(note.body)}</div>${fileRows(files,{readonly:true})}<div class="form-actions"><button class="primary" type="button" data-note-restore>Вернуть из архива</button><button class="text-button" type="button" data-archive-history>История версий</button></div><p data-media-error role="alert"></p>`;
        bindFilePreview(ui.body,files);q('[data-archive-back]',ui.body).onclick=draw;q('[data-archive-history]',ui.body).onclick=()=>openHistory(note);
        q('[data-note-restore]',ui.body).onclick=async event=>{
          const restore=async asOrdinary=>read(ui.owner,`/api/personal/notes/${id}/restore`,{method:'POST',body:JSON.stringify({expectedUpdatedAt:note.updatedAt,asOrdinary})});event.target.disabled=true;
          try{
            try{await restore(false);}catch(e){if(e.code!=='daily_note_exists')throw e;const answer=await askChoice({title:'На этот день уже есть заметка',label:'Существующая заметка дня сохранится. Вернуть эту запись как обычную заметку?',choices:[{value:'ordinary',label:'Вернуть обычной заметкой'}]});if(answer!=='ordinary'||!current(ui)){event.target.disabled=false;return;}await restore(true);}
            if(!current(ui))return;await closeDialog(ui.dialog);await loadPersonal({force:true});if(ui.owner===state.me?.id){openPersonalEditor('note',id);toast('Заметка восстановлена');}
          }catch(e){if(current(ui)){q('[data-media-error]',ui.body).textContent=e.message;event.target.disabled=false;}}
        };
      }catch(e){error(ui,e.message,()=>showNote(id));}
    };await load();
  }
  window.addEventListener('tessavie-outbox-change',()=>{for(const [form,editor] of editors){if(!form.isConnected)editors.delete(form);else if(editor.owner===state.me?.id)void editor.refreshPending();}});
  window.addEventListener('tessavie-note-file-progress',event=>{for(const [form,editor] of editors){if(!form.isConnected||editor.owner!==event.detail.owner)continue;const progress=q(`[data-upload-id="${CSS.escape(event.detail.id)}"] progress`,editor.root);if(progress)progress.value=event.detail.percent;}});
  return{bindEditor,openArchive,confirmed(item,result){for(const [form,editor] of editors)if(form.isConnected&&editor.owner===item.owner&&editor.note?.id===(item.note||result?.noteId))void editor.refresh();}};
}
