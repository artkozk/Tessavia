export function parseNoteTags(value) {
  const seen=new Set();return String(value||'').split(/[,;\n]/).map(tag=>tag.trim().replace(/^#/,'').trim()).filter(tag=>{
    const key=tag.toLocaleLowerCase();if(!tag||seen.has(key))return false;seen.add(key);return true;
  });
}
export function filterPersonalNotes(notes,{query='',folder='',tag='',pinned=false}={}) {
  const text=query.trim().toLocaleLowerCase();
  return notes.filter(note=>(!folder||(folder==='none'?!note.folderId:note.folderId===folder))&&(!tag||(note.tags||[]).some(value=>value.toLocaleLowerCase()===tag.toLocaleLowerCase()))&&(!pinned||note.pinned)&&(!text||[note.title,note.body,note.folderName,...(note.tags||[])].join(' ').toLocaleLowerCase().includes(text)));
}

// Keep only a receipt key locally, never template contents. An uncertain POST
// can then be retried after reload without creating a second note.
export function createNoteShortcutKeys(storage,uuid=()=>crypto.randomUUID().replaceAll('-','')) {
  const key=(owner,template,date)=>`tessavie-note-shortcut:${owner}:${template}:${date}`;
  return {
    get(owner,template,date){const name=key(owner,template,date),existing=storage.getItem(name);if(existing)return existing;const value=uuid();storage.setItem(name,value);return value;},
    confirmed(owner,template,date){storage.removeItem(key(owner,template,date));},
  };
}

export function createNoteLibraryUI({state,api,escapeHTML:esc,icon,renderNoteCard,renderPersonal,loadPersonal,openPersonalEditor,localISODate,openModal,closeDialog,enhanceSelects,bindDraft,clearDraft,flushDrafts,askChoice,toast}){
  const q=(selector,root=document)=>root.querySelector(selector),qa=(selector,root=document)=>[...root.querySelectorAll(selector)];
  let account=null,filters={query:'',folder:'',tag:'',pinned:false},limit=24;
  const resetOwner=()=>{if(account!==state.me?.id){account=state.me?.id;filters={query:'',folder:'',tag:'',pinned:false};limit=24;}};
  const folders=()=>state.personal?.noteFolders||[],templates=()=>state.personal?.noteTemplates||[];
  const folderOptions=(selected='')=>`<option value="">Без папки</option>${folders().map(folder=>`<option value="${esc(folder.id)}" ${folder.id===selected?'selected':''}>${esc(folder.name)}</option>`).join('')}`;
  function fields(note){return `<details class="note-organization" ${note?.folderId||note?.tags?.length?'open':''}><summary>${icon('folder')} Папка и метки</summary><div class="form-grid two"><label>Папка<select name="folderId">${folderOptions(note?.folderId)}</select></label><label>Метки<input name="noteTags" maxlength="1000" value="${esc((note?.tags||[]).join(', '))}" placeholder="Через запятую"></label></div></details>${note?.dailyDate?`<p class="muted">Заметка дня · ${esc(note.dailyDate)}</p>`:''}`;}
  function render(notes,links){
    resetOwner();if(filters.folder&&filters.folder!=='none'&&!folders().some(folder=>folder.id===filters.folder))filters.folder='';
    const tags=[...new Map(notes.flatMap(note=>note.tags||[]).map(tag=>[tag.toLocaleLowerCase(),tag])).values()].sort((a,b)=>a.localeCompare(b));
    if(filters.tag&&!tags.some(tag=>tag.toLocaleLowerCase()===filters.tag.toLocaleLowerCase()))filters.tag='';
    const found=filterPersonalNotes(notes,filters);
    return `<section class="personal-section note-library"><div class="section-heading"><div><p class="eyebrow">Личная память</p><h2>Заметки <small>${found.length}</small></h2></div><button type="button" class="text-button" data-note-new>${icon('plus')} Заметка</button></div><div class="note-library-actions"><button type="button" class="secondary" data-note-daily>${icon('calendar')} Заметка дня</button><button type="button" class="text-button" data-note-templates>${icon('fileText')} Шаблоны</button><button type="button" class="text-button" data-note-folders>${icon('folder')} Папки</button></div><div class="note-library-filters"><label class="note-library-search"><span class="sr-only">Поиск заметок</span><input type="search" data-note-query aria-label="Поиск заметок" value="${esc(filters.query)}" placeholder="Поиск по тексту, папке или метке"></label><label><span class="sr-only">Фильтр по папке</span><select data-note-folder aria-label="Фильтр по папке"><option value="">Все папки</option><option value="none" ${filters.folder==='none'?'selected':''}>Без папки</option>${folders().map(folder=>`<option value="${esc(folder.id)}" ${filters.folder===folder.id?'selected':''}>${esc(folder.name)}</option>`).join('')}</select></label><label><span class="sr-only">Фильтр по метке</span><select data-note-tag aria-label="Фильтр по метке"><option value="">Все метки</option>${tags.map(tag=>`<option value="${esc(tag)}" ${filters.tag===tag?'selected':''}>${esc(tag)}</option>`).join('')}</select></label><button type="button" class="text-button" data-note-pinned aria-pressed="${filters.pinned}">${icon('bookmark')} Закреплённые</button></div><div class="personal-note-grid">${found.slice(0,limit).map(note=>renderNoteCard(note,links)).join('')||'<p class="muted">Заметок в этой выборке нет. Измените фильтр или создайте заметку.</p>'}</div>${found.length>limit?`<button type="button" class="text-button" data-note-more>Показать ещё ${Math.min(24,found.length-limit)} · ${limit} из ${found.length}</button>`:''}</section>`;
  }
  function bind(){
    const root=q('.note-library');if(!root)return;
    q('[data-note-new]',root).onclick=()=>openPersonalEditor('note');
    q('[data-note-query]',root).oninput=event=>{filters.query=event.target.value;limit=24;const owner=state.me.id;clearTimeout(state.noteLibraryTimer);state.noteLibraryTimer=setTimeout(()=>{if(owner!==state.me?.id||state.personalTab!=='notes'||state.view!=='personal')return;renderPersonal();const input=q('[data-note-query]');input?.focus();},160);};
    q('[data-note-folder]',root).onchange=event=>{filters.folder=event.target.value;limit=24;renderPersonal();};
    q('[data-note-tag]',root).onchange=event=>{filters.tag=event.target.value;limit=24;renderPersonal();};
    q('[data-note-pinned]',root).onclick=()=>{filters.pinned=!filters.pinned;limit=24;renderPersonal();};
    q('[data-note-more]',root)?.addEventListener('click',()=>{limit+=24;renderPersonal();});
    q('[data-note-daily]',root).onclick=event=>createShortcut('',localISODate(),event.currentTarget);
    q('[data-note-folders]',root).onclick=openFolders;
    q('[data-note-templates]',root).onclick=openTemplates;
  }
  function surface(title){
    const dialog=q('#workspace-dialog'),content=q('#workspace-dialog-content');
    if(dialog.open&&!flushDrafts(dialog)){toast('Не удалось сохранить черновик на устройстве',true);return null;}
    content.innerHTML=`<div class="workspace-editor-shell note-library-dialog"><header><h2>${esc(title)}</h2><button type="button" class="icon-button" data-note-close aria-label="Закрыть">${icon('x')}</button></header><div data-note-manager></div></div>`;
    q('[data-note-close]',content).onclick=()=>closeDialog(dialog);openModal(dialog);
    return{dialog,content,body:q('[data-note-manager]',content),owner:state.me.id};
  }
  const current=ui=>ui.owner===state.me?.id&&ui.body.isConnected&&ui.dialog.open;
  const request=(ui,path,options={})=>api(path,{...options,headers:{'X-Outbox-Owner':String(ui.owner)}});
  function refreshFolderInputs(){
    qa('#personal-editor-form select[name="folderId"]').forEach(select=>{const value=select.value;select.innerHTML=folderOptions(value);select.dispatchEvent(new Event('change',{bubbles:true}));});
    enhanceSelects(q('#personal-dialog'));
  }
  function openFolders(){
    const ui=surface('Папки заметок');if(!ui)return;
    const draw=(editing=null)=>{
      if(!current(ui))return;
      if(!flushDrafts(ui.dialog)){toast('Не удалось сохранить черновик на устройстве',true);return;}
      ui.body.innerHTML=`<p class="muted">Удаление папки сохранит её заметки в «Без папки».</p><div class="note-manager-list">${folders().map(folder=>`<div class="note-manager-row"><span><strong>${esc(folder.name)}</strong><small>${folder.count} заметок</small></span><button type="button" class="icon-button" data-folder-rename="${esc(folder.id)}" aria-label="Переименовать ${esc(folder.name)}">${icon('edit')}</button><button type="button" class="icon-button" data-folder-archive="${esc(folder.id)}" aria-label="Удалить ${esc(folder.name)}">${icon('trash')}</button></div>`).join('')||'<p class="muted">Папок пока нет.</p>'}</div><form data-folder-form><input type="hidden" name="id" value="${esc(editing?.id||'')}"><input type="hidden" name="expectedUpdatedAt" value="${esc(editing?.updatedAt||'')}"><label>${editing?'Переименовать папку':'Новая папка'}<input name="name" aria-label="Название папки" maxlength="80" required value="${esc(editing?.name||'')}"></label><div class="form-actions"><button type="submit" class="primary">Сохранить папку</button>${editing?'<button type="button" class="text-button" data-folder-new>Новая папка</button>':''}</div><p role="alert" data-note-error class="form-error"></p></form>`;
      const form=q('form',ui.body);bindDraft(form,`personal:${ui.owner}:note-folder:${editing?.id||'new'}`);
      q('[data-folder-new]',form)?.addEventListener('click',()=>draw());
      qa('[data-folder-rename]',ui.body).forEach(button=>button.onclick=()=>{const item=folders().find(folder=>folder.id===button.dataset.folderRename);draw(item);q('[name="name"]',ui.body)?.focus();});
      form.onsubmit=async event=>{
        event.preventDefault();const button=q('[type="submit"]',form);if(button.disabled)return;button.disabled=true;
        try{await request(ui,`/api/personal/note-folders${form.elements.id.value?'/'+form.elements.id.value:''}`,{method:form.elements.id.value?'PATCH':'POST',body:JSON.stringify({name:form.elements.name.value,expectedUpdatedAt:form.elements.expectedUpdatedAt.value})});if(!current(ui))return;clearDraft(form);await loadPersonal({force:true});if(!current(ui))return;refreshFolderInputs();draw();}
        catch(error){if(current(ui))q('[data-note-error]',form).textContent=error.message;}finally{button.disabled=false;}
      };
      qa('[data-folder-archive]',ui.body).forEach(button=>button.onclick=async()=>{
        const folder=folders().find(item=>item.id===button.dataset.folderArchive);
        const answer=await askChoice({title:'Удалить папку?',label:`«${folder.name}»: заметки (${folder.count}) и шаблоны сохранятся без папки.`,choices:[{value:'archive',label:'Удалить папку, сохранить заметки'}]});
        if(answer!=='archive'||!current(ui))return;button.disabled=true;
        try{await request(ui,`/api/personal/note-folders/${folder.id}`,{method:'DELETE',body:JSON.stringify({expectedUpdatedAt:folder.updatedAt})});await loadPersonal({force:true});if(current(ui)){refreshFolderInputs();draw();}}
        catch(error){if(current(ui)){q('[data-note-error]',form).textContent=error.message;button.disabled=false;}}
      });
    };draw();
  }
  function openTemplates(){
    const ui=surface('Шаблоны заметок');if(!ui)return;
    ui.body.innerHTML=`<p class="muted">Каждое применение создаёт отдельную личную заметку. Старые записи остаются без изменений.</p><button type="button" class="secondary" data-template-new>${icon('plus')} Новый шаблон</button><div class="note-manager-list">${templates().map(item=>`<div class="note-manager-row"><button type="button" class="text-button note-template-use" data-template-use="${esc(item.id)}"><strong>${esc(item.name)}</strong><small>Создать заметку</small></button><button type="button" class="icon-button" data-template-edit="${esc(item.id)}" aria-label="Изменить ${esc(item.name)}">${icon('edit')}</button><button type="button" class="icon-button" data-template-archive="${esc(item.id)}" aria-label="Удалить ${esc(item.name)}">${icon('trash')}</button></div>`).join('')||'<p class="muted">Можно сохранить текущую заметку как шаблон из её редактора.</p>'}</div><p role="alert" data-note-error class="form-error"></p>`;
    q('[data-template-new]',ui.body).onclick=()=>editTemplate();
    qa('[data-template-use]',ui.body).forEach(button=>button.onclick=()=>createShortcut(button.dataset.templateUse,localISODate(),button,ui));
    qa('[data-template-edit]',ui.body).forEach(button=>button.onclick=async()=>{button.disabled=true;try{const item=await request(ui,`/api/personal/note-templates/${button.dataset.templateEdit}`);if(current(ui))editTemplate(item);}catch(error){if(current(ui)){q('[data-note-error]',ui.body).textContent=error.message;button.disabled=false;}}});
    qa('[data-template-archive]',ui.body).forEach(button=>button.onclick=async()=>{
      const item=templates().find(item=>item.id===button.dataset.templateArchive);
      const answer=await askChoice({title:'Удалить шаблон?',label:`«${item.name}»: созданные из него заметки сохранятся.`,choices:[{value:'archive',label:'Удалить шаблон'}]});if(answer!=='archive'||!current(ui))return;
      button.disabled=true;try{await request(ui,`/api/personal/note-templates/${item.id}`,{method:'DELETE',body:JSON.stringify({expectedUpdatedAt:item.updatedAt})});await loadPersonal({force:true});if(current(ui))openTemplates();}catch(error){if(current(ui)){q('[data-note-error]',ui.body).textContent=error.message;button.disabled=false;}}
    });
  }
  function editTemplate(item={}){
    const ui=surface(item.id?'Изменить шаблон':'Новый шаблон');if(!ui)return;
    ui.body.innerHTML=`<form data-template-form><input type="hidden" name="expectedUpdatedAt" value="${esc(item.updatedAt||'')}"><label>Название шаблона<input name="name" maxlength="80" value="${esc(item.name||'')}" required></label><label>Заголовок заметки<input name="title" value="${esc(item.title||'')}"></label><label>Текст шаблона<textarea name="body" rows="8" maxlength="100000">${esc(item.body||'')}</textarea></label><p class="muted">Можно использовать Markdown. {{date}} заменится датой создания.</p><div class="form-grid two"><label>Папка<select name="folderId">${folderOptions(item.folderId)}</select></label><label>Метки<input name="noteTags" value="${esc((item.tags||[]).join(', '))}" placeholder="Через запятую"></label></div><p role="alert" data-note-error class="form-error"></p><div class="form-actions"><button type="submit" class="primary">Сохранить шаблон</button></div></form>`;
    const form=q('form',ui.body);bindDraft(form,`personal:${ui.owner}:note-template:${item.id||(item.sourceID?'from:'+item.sourceID:'new')}`);enhanceSelects(form);
    form.onsubmit=async event=>{
      event.preventDefault();const button=q('[type="submit"]',form);if(button.disabled)return;button.disabled=true;
      const values=new FormData(form),payload={name:values.get('name'),title:values.get('title'),body:values.get('body'),folderId:values.get('folderId'),tags:parseNoteTags(values.get('noteTags')),expectedUpdatedAt:values.get('expectedUpdatedAt')||''};
      try{await request(ui,`/api/personal/note-templates${item.id?'/'+item.id:''}`,{method:item.id?'PATCH':'POST',body:JSON.stringify(payload)});if(!current(ui))return;clearDraft(form);await loadPersonal({force:true});if(current(ui)){await closeDialog(ui.dialog);toast('Шаблон сохранён');}}
      catch(error){if(current(ui))q('[data-note-error]',form).textContent=error.message;}finally{button.disabled=false;}
    };
  }
  async function createShortcut(template,date,button,ui=null){
    if(button.disabled)return;resetOwner();const owner=state.me.id;button.disabled=true;
    try{
      let keys,requestKey;
      if(template){try{keys=createNoteShortcutKeys(localStorage);requestKey=keys.get(owner,template,date);}catch(_){throw new Error('Не удалось сохранить ключ создания на устройстве. Проверьте доступ к хранилищу браузера.');}}
      const note=await api(template?`/api/personal/note-templates/${template}/instantiate`:'/api/personal/notes/daily',{method:'POST',headers:{'X-Outbox-Owner':String(owner)},body:JSON.stringify({date,...(template?{requestKey}:{})})});
      if(template){try{keys.confirmed(owner,template,date);}catch(_){/* Retaining the key is safer than duplicating the note. */}}
      if(owner!==state.me?.id)return;
      const mayOpen=()=>owner===state.me?.id&&(ui?current(ui):state.view==='personal'&&state.personalTab==='notes')&&!q('#personal-dialog').open;
      const wasHere=mayOpen();await loadPersonal({force:true});if(!wasHere||!mayOpen())return;
      if(ui&&!await closeDialog(ui.dialog))return;
      openPersonalEditor('note',note.id);
    }catch(error){if(owner===state.me?.id){if(ui&&current(ui))q('[data-note-error]',ui.body).textContent=error.message;else toast(error.message,true);}}
    finally{if(button.isConnected)button.disabled=false;}
  }
  function bindEditor(form,snapshot){
    const button=document.createElement('button');button.type='button';button.className='text-button';button.textContent='Сохранить как шаблон';
    q('.personal-editor-actions',form).append(button);
    button.onclick=()=>{if(!flushDrafts(q('#personal-dialog'))){toast('Не удалось сохранить черновик на устройстве',true);return;}const item=snapshot();editTemplate({...item,name:item.title,folderId:form.elements.folderId.value,tags:parseNoteTags(form.elements.noteTags.value)});};
  }
  return{render,bind,fields,bindEditor};
}
