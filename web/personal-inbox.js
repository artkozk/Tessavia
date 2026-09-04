export function captureEntry(body,requestKey) {
  const text=String(body||'').trim();
  if(!text)throw new Error('Запишите текст перед сохранением.');
  return {kind:'capture',payload:{body:text,requestKey},title:text.split('\n')[0].slice(0,120)};
}

export function createPersonalInboxUI({state,api,outbox,escapeHTML:esc,icon,renderMarkdown,openModal,closeDialog,flushDrafts,bindDraft,clearDraft,loadDraft,draftMatches,toast,toastAction,loadPersonal,openInbox,openPlan}) {
  const q=(selector,root=document)=>root.querySelector(selector),pending=new Map();
  const read=(owner,path,options={})=>api(path,{...options,headers:{'X-Outbox-Owner':String(owner)}});
  window.addEventListener('tessavie-outbox-change',()=>void bindList());
  function openCapture(){
    const dialog=q('#personal-dialog');if(dialog.open)return;
    const owner=state.me.id,scope=`personal:${owner}:capture`;
    q('#create-menu').hidden=true;q('.personal-create-menu[open]')?.removeAttribute('open');
    q('#personal-dialog-content').innerHTML=`<div class="dialog-header"><div><span class="record-kind">${icon('lock')} Только для вас</span><h2>Записать</h2></div><button type="button" class="icon-button" data-capture-close aria-label="Закрыть">${icon('x')}</button></div><form class="dialog-form capture-form"><input type="hidden" name="requestKey" value="${crypto.randomUUID().replaceAll('-','')}"><textarea name="body" aria-label="Текст входящего" placeholder="Мысль, ссылка или то, что нужно сделать…" rows="6" maxlength="100000" required autofocus></textarea><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">${icon('check')} Сохранить</button><button type="button" class="text-button" data-capture-inbox>Открыть входящие</button></div></form>`;
    const form=q('form',dialog),input=form.elements.body,error=q('[role=alert]',form);bindDraft(form,scope);
    q('[data-capture-close]',dialog).onclick=()=>closeDialog(dialog);
    q('[data-capture-inbox]',dialog).onclick=async()=>{if(await closeDialog(dialog))openInbox();};
    let busy=false;input.addEventListener('input',()=>{form.elements.requestKey.value=crypto.randomUUID().replaceAll('-','');});
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||owner!==state.me?.id)return;
      const body=input.value.trim(),key=form.elements.requestKey.value;if(!body){input.focus();return;}
      busy=true;input.readOnly=true;const button=q('[type=submit]',form);button.disabled=true;error.hidden=true;
      try{
        if(!flushDrafts(dialog))throw new Error('Не удалось сохранить черновик на устройстве. Текст остаётся в форме.');
        await outbox().addCapture(body,key,owner);
        if(owner!==state.me?.id)return;
        if(form.isConnected)flushDrafts(dialog);
        if(draftMatches(loadDraft(scope),key,body))clearDraft(form);
        pending.set(key,owner);
        if(form.isConnected&&dialog.open)await closeDialog(dialog);
        toastAction('Сохранено на устройстве · ожидает отправки','Очередь',()=>outbox().open());
        void outbox().pump();if(state.view==='personal'&&state.personalTab==='inbox')void bindList();
      }catch(failure){if(form.isConnected&&owner===state.me?.id){error.textContent=failure.message;error.hidden=false;}}
      finally{busy=false;input.readOnly=false;button.disabled=false;}
    };
    input.onkeydown=event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();form.requestSubmit();}};
    openModal(dialog);input.focus({preventScroll:true});
  }
  async function bindList(){
    const root=q('[data-inbox-local]'),owner=state.me?.id;if(!root||!owner)return;
    try{
      const items=await outbox().pendingCaptures(owner);if(!root.isConnected||owner!==state.me?.id)return;
      root.hidden=!items.length;root.innerHTML=`<h3>Сохранено на этом устройстве · ${items.length}</h3>${items.slice(0,5).map(item=>`<button type="button" class="inbox-pending-row"><strong>${esc(item.title)}</strong><small>${esc(item.error||'Ожидает подтверждения сервера')}</small></button>`).join('')}${items.length>5?'<button type="button" class="text-button">Вся очередь</button>':''}`;
      root.querySelectorAll('button').forEach(button=>button.onclick=()=>outbox().open());
    }catch(failure){if(root.isConnected&&owner===state.me?.id){root.hidden=false;root.textContent=failure.message;}}
  }
  async function openTriage(id){
    const dialog=q('#workspace-dialog'),owner=state.me.id;
    if(dialog.open&&!flushDrafts(dialog)){toast('Не удалось сохранить черновик',true);return;}
    q('#workspace-dialog-content').innerHTML=`<div class="workspace-editor-shell inbox-triage-dialog"><header><h2>Сделать делом</h2><button type="button" class="icon-button" data-triage-close aria-label="Закрыть">${icon('x')}</button></header><div data-triage-body><p>Открываем исходную запись…</p></div></div>`;
    const root=q('[data-triage-body]',dialog),alive=()=>owner===state.me?.id&&root.isConnected&&dialog.open;
    q('[data-triage-close]',dialog).onclick=()=>closeDialog(dialog);openModal(dialog);
    let source,queued;try{[source,queued]=await Promise.all([read(owner,`/api/personal/notes/${id}`),outbox().pendingTriage(id,owner)]);if(!alive())return;}catch(failure){if(alive())root.innerHTML=`<p role="alert">${esc(failure.message)}</p>`;return;}
    root.innerHTML=`<p class="muted">Личное дело останется связано с исходной записью. Она сохранится в заметках вместе с файлами и историей.</p><form class="inbox-triage-form"><input type="hidden" name="version" value="${esc(source.updatedAt)}"><input type="hidden" name="requestKey" value="${crypto.randomUUID().replaceAll('-','')}"><label>Что сделать<input name="title" maxlength="240" required value="${esc(source.title)}" autofocus></label><label>Когда займусь, если уже известно<input type="date" name="date"></label><details><summary>Пояснение к делу</summary><label>Следующий шаг<textarea name="notes" rows="3" maxlength="100000"></textarea></label></details><details class="inbox-triage-source"><summary>Исходная запись</summary><h3>${esc(source.title)}</h3><div class="markdown-body">${renderMarkdown(source.body)}</div></details><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Создать связанное дело</button><button type="button" class="text-button" data-triage-cancel>Отмена</button></div></form>`;
    const form=q('form',root),scope=`personal:${owner}:triage:${id}`,error=q('[role=alert]',form);bindDraft(form,scope);let busy=false;
    // An uncertain write may already exist on the server. Resolve it before
    // accepting a new action, even if this dialog was reopened after a crash.
    const unresolved=queued.filter(item=>item.status!=='blocked');
    if(unresolved.length){
      form.inert=true;const notice=document.createElement('div');notice.innerHTML='<p>Создание дела уже находится в очереди. Дождитесь подтверждения предыдущей попытки.</p><button type="button" class="secondary">Открыть очередь</button>';root.prepend(notice);notice.querySelector('button').onclick=()=>outbox().open();
    }else if(queued.length||form.elements.version.value!==source.updatedAt){
      const notice=document.createElement('div');notice.className='context-tip';notice.innerHTML=`<p>Предыдущий разбор не подтверждён или исходная запись изменилась. Ниже открыта её текущая сохранённая версия.</p><button type="button" class="text-button">Использовать эту версию</button>`;root.prepend(notice);
      q('.inbox-triage-source',form).open=true;q('[type=submit]',form).disabled=true;
      notice.querySelector('button').onclick=async event=>{event.currentTarget.disabled=true;try{for(const item of queued)await outbox().stop(item.id);if(!alive())return;form.elements.version.value=source.updatedAt;form.elements.requestKey.value=crypto.randomUUID().replaceAll('-','');if(!flushDrafts(dialog))throw new Error('Не удалось сохранить новый выбор. Исходный текст остаётся в форме.');notice.remove();q('[type=submit]',form).disabled=false;}catch(failure){if(alive()){error.textContent=failure.message;error.hidden=false;event.target.disabled=false;}}};
    }
    q('[data-triage-cancel]',root).onclick=()=>closeDialog(dialog);
    form.addEventListener('input',()=>{form.elements.requestKey.value=crypto.randomUUID().replaceAll('-','');});
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!alive()||!form.reportValidity())return;busy=true;const button=q('[type=submit]',form);button.disabled=true;error.hidden=true;
      const key=form.elements.requestKey.value;
      try{
        if(!flushDrafts(dialog))throw new Error('Не удалось сохранить выбор на устройстве. Текст остаётся в форме.');
        const payload={title:form.elements.title.value.trim(),notes:form.elements.notes.value.trim(),date:form.elements.date.value,expectedUpdatedAt:form.elements.version.value,requestKey:key};
        await outbox().addTriage(id,payload,owner);
        if(owner!==state.me?.id)return;
        // A different copy of this form may have been opened while IndexedDB committed.
        if(form.isConnected)flushDrafts(dialog);
        if(!loadDraft(scope)||loadDraft(scope).values?.requestKey===key)clearDraft(form);
        pending.set(key,owner);
        if(form.isConnected&&dialog.open)await closeDialog(dialog);
        toastAction('Дело сохранено на устройстве · ожидает отправки','Очередь',()=>outbox().open());void outbox().pump();
      }catch(failure){if(alive()){error.textContent=failure.message;error.hidden=false;}}
      finally{busy=false;button.disabled=false;}
    };
  }
  function confirmed(item,result){
    if(item.owner!==state.me?.id)return;
    if(pending.get(item.payload?.requestKey)===item.owner){pending.delete(item.payload.requestKey);
      if(item.kind==='capture')toastAction('Сохранено в личных входящих','Открыть',openInbox);
      if(item.kind==='note-to-plan')toastAction('Связанное дело создано','Открыть',()=>openPlan(result.id));
    }
    void bindList();
  }
  return {openCapture,openTriage,bindList,confirmed};
}
