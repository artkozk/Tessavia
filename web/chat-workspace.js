export function chatDraftKey(owner,workspace,thread) {
  return `tessavie:chat-draft:${owner}:${workspace}:${thread}`;
}
export function chooseConversation(storage,owner,workspace,threads,current='') {
  const key=`tessavie:chat-selection:${owner}:${workspace}`;
  let saved='';
  try { saved=storage.getItem(key)||''; } catch (_) {}
  const allowed=id=>threads.some(thread=>thread.id===id);
  const selected=allowed(current)?current:allowed(saved)?saved:threads[0]?.id||'';
  try { if(selected)storage.setItem(key,selected);else storage.removeItem(key); } catch (_) {}
  return selected;
}
export function readConversationDraft(storage,key) {
  try {const value=JSON.parse(storage.getItem(key)||'{}');return {body:String(value.body||''),reply:String(value.reply||''),linked:String(value.linked||''),nonce:String(value.nonce||''),edit:typeof value.edit?.id==='string'?{id:value.edit.id,body:String(value.edit.body||'')}:null};}
  catch (_) {return {body:'',reply:'',linked:'',nonce:''};}
}
export function writeConversationDraft(storage,key,draft) {
  if(!draft.body&&!draft.reply&&!draft.linked&&!draft.edit)storage.removeItem(key);
  else storage.setItem(key,JSON.stringify(draft));
}
export function mergeChatHistory(previous,incoming) {
  const messages=new Map(previous.map(item=>[item.id,item]));
  incoming.forEach(item=>messages.set(item.id,item));
  return [...messages.values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
}

export function createChatWorkspaceUI({state,api,esc,icon,openModal,closeDialog,toast,activate}) {
  async function openNew() {
    const owner=state.me.id,workspace=state.activeWorkspaceId;
    const dialog=document.querySelector('#workspace-dialog'),root=document.querySelector('#workspace-dialog-content');
    if(dialog.open)return;
    try {
      const fresh=await api('/api/users',{headers:{'X-Workspace-ID':workspace}});
      if(owner!==state.me?.id||workspace!==state.activeWorkspaceId||dialog.open)return;
      state.users=fresh;
    } catch(error) { toast(error.message,true);return; }
    const users=state.users.filter(user=>user.id!==owner);
    root.innerHTML=`<div class="workspace-editor-shell chat-create-dialog"><header><div><h2>Новый разговор</h2><p class="muted">Участники выбранного проекта. Личный диалог виден только двоим.</p></div><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><form><div class="segmented chat-create-kinds" aria-label="Тип разговора">${[['direct','Личный диалог'],['group','Группа'],['record','По карточке']].map(([key,label])=>`<label class="segment"><input type="radio" name="kind" value="${key}" ${key==='direct'?'checked':''}>${label}</label>`).join('')}</div><label data-group-title hidden>Название группы<input name="title" maxlength="100" autocomplete="off" placeholder="Например, Обсуждение макета"></label><label>Найти участника или карточку<input name="search" type="search" autocomplete="off" placeholder="Имя или название"></label><div class="chat-create-choices" data-choices></div><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Открыть диалог</button><button type="button" class="secondary" data-cancel>Отмена</button></div></form></div>`;
    const form=root.querySelector('form'),choices=root.querySelector('[data-choices]'),error=root.querySelector('[role=alert]');
    const selected=new Set();let recordID='',busy=false;
    const alive=()=>owner===state.me?.id&&workspace===state.activeWorkspaceId&&form.isConnected&&dialog.open;
    function renderChoices(){
      const kind=form.elements.kind.value,query=form.elements.search.value.toLocaleLowerCase();
      root.querySelector('[data-group-title]').hidden=kind!=='group';
      form.elements.title.required=kind==='group';
      form.querySelector('[type=submit]').textContent=kind==='group'?'Создать группу':kind==='record'?'Открыть обсуждение':'Открыть диалог';
      const items=kind==='record'?state.records.filter(item=>!['archived','cancelled'].includes(item.status)).map(item=>({id:item.id,title:item.title,detail:'Карточка проекта'})):users.map(user=>({id:user.id,title:user.displayName||user.username,detail:'@'+user.username}));
      const filtered=items.filter(item=>(item.title+' '+item.detail).toLocaleLowerCase().includes(query));
      choices.innerHTML=filtered.map(item=>`<label class="chat-create-choice"><input type="${kind==='group'?'checkbox':'radio'}" name="participant" value="${esc(String(item.id))}" ${kind==='record'?(recordID===item.id?'checked':''):(selected.has(item.id)?'checked':'')}><span><strong>${esc(item.title)}</strong><small>${esc(item.detail)}</small></span></label>`).join('')||`<p class="muted">${kind==='record'?'Подходящих карточек нет.':'Участников не найдено. Пригласите коллегу в проект в разделе «Команды».'}</p>`;
      choices.querySelectorAll('input').forEach(input=>input.onchange=()=>{if(kind==='record'){recordID=input.value;return;}if(kind==='direct')selected.clear();if(input.checked)selected.add(Number(input.value));else selected.delete(Number(input.value));});
    }
    form.querySelectorAll('[name=kind]').forEach(input=>input.onchange=()=>{selected.clear();recordID='';renderChoices();});
    form.elements.search.oninput=renderChoices;
    root.querySelector('[data-close]').onclick=root.querySelector('[data-cancel]').onclick=()=>closeDialog(dialog);
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!alive())return;
      const kind=form.elements.kind.value;
      if(kind==='record'&&!recordID||kind!=='record'&&!selected.size){error.textContent=kind==='record'?'Выберите карточку.':'Выберите участника.';error.hidden=false;return;}
      const payload=kind==='record'?{recordId:recordID}:kind==='direct'?{kind,partnerId:[...selected][0]}:{kind,title:form.elements.title.value,memberIds:[...selected]};
      busy=true;error.hidden=true;form.querySelector('[type=submit]').disabled=true;
      try{
        const result=await api('/api/chat/threads',{method:'POST',headers:{'X-Workspace-ID':workspace},body:JSON.stringify(payload)});
        if(!alive())return;
        const threads=await api('/api/chat/threads',{headers:{'X-Workspace-ID':workspace}});
        if(!alive())return;state.chatThreads=threads;await closeDialog(dialog);activate(result.id);
      }catch(failure){if(alive()){error.textContent=failure.message;error.hidden=false;}}
      finally{busy=false;if(form.isConnected)form.querySelector('[type=submit]').disabled=false;}
    };
    renderChoices();openModal(dialog);form.elements.search.focus();
  }
  return {openNew};
}
export function pendingConversationItems(items,messages,{owner,workspace,thread}) {
  const ids=new Set(messages.map(item=>item.id)),nonces=new Set(messages.filter(item=>item.authorId===owner&&item.clientNonce).map(item=>item.clientNonce));
  return items.filter(item=>item.owner===owner&&item.workspace===workspace&&item.thread===thread&&['message','attachment'].includes(item.kind)&&item.status!=='confirmed'&&!ids.has(item.resultID)&&!nonces.has(item.id)).sort((a,b)=>a.createdAt-b.createdAt||(a.sequence||0)-(b.sequence||0)||a.id.localeCompare(b.id));
}
