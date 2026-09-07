export function groupMemberActions(group, member, actor) {
  if(member.id===actor)return group.canRecoverOwner&&member.active?['transfer']:[];
  const actions=[];
  if(member.active&&member.role!=='owner'&&(group.role==='owner'||group.canRecoverOwner))actions.push('transfer');
  if(member.active&&member.role!=='owner'&&group.role==='owner')actions.push(member.role==='admin'?'member':'admin');
  if(member.role!=='owner'&&(group.role==='owner'||group.role==='admin'&&member.role==='member'))actions.push('remove');
  return actions;
}

export function createChatGroupUI({state,api,esc,icon,openModal,closeDialog,toast,refresh}) {
  async function open(thread) {
    const owner=state.me.id,workspace=state.activeWorkspaceId;
    const dialog=document.querySelector('#workspace-dialog'),root=document.querySelector('#workspace-dialog-content');
    if(dialog.open)return;
    const headers={'X-Workspace-ID':workspace},path=`/api/chat/threads/${thread}/group`;
    let group,users,busy=false;
    try {[group,users]=await Promise.all([api(path,{headers}),api('/api/users',{headers})]);}
    catch(error){toast(error.message,true);return;}
    if(owner!==state.me?.id||workspace!==state.activeWorkspaceId||dialog.open)return;
    const labels={owner:'Владелец',admin:'Администратор',member:'Участник'};
    root.innerHTML=`<div class="workspace-editor-shell chat-create-dialog chat-group-dialog"><header><div><h2>Участники и настройки</h2><p>Закрытая группа · роли действуют только в этом разговоре</p></div><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><form data-name><label>Название группы<input name="title" maxlength="100" required value="${esc(group.title)}"></label><button type="submit" class="secondary">Сохранить название</button></form><p class="form-error" role="alert" hidden></p><button type="button" class="text-button" data-reload hidden>Обновить состав и права</button><section data-recovery hidden></section><section class="chat-group-roster"><div class="chat-group-section-heading"><h3 data-count></h3><button type="button" class="text-button" data-add>${icon('plus')} Добавить</button></div><div data-picker hidden><label>Найти коллегу<input type="search" autocomplete="off" placeholder="Имя участника проекта"></label><p class="muted">Добавленный участник получит доступ ко всей истории группы.</p><div class="chat-create-choices" data-candidates></div><button type="button" class="text-button" data-cancel-add>Отмена</button></div><div data-members></div></section><section class="chat-group-confirm" data-confirm hidden aria-live="polite"></section><footer class="chat-group-footer"><p class="muted" data-leave-help></p><button type="button" class="text-button danger-text" data-leave>Выйти из группы</button></footer></div>`;
    const shell=root.firstElementChild,form=root.querySelector('[data-name]'),error=root.querySelector('[role=alert]'),confirm=root.querySelector('[data-confirm]'),picker=root.querySelector('[data-picker]');
    const alive=()=>owner===state.me?.id&&workspace===state.activeWorkspaceId&&shell.isConnected&&dialog.open;
    const canManage=()=>['owner','admin'].includes(group.role);
    function nameState(){form.querySelector('button').disabled=busy||!canManage()||form.elements.title.value.trim()===group.title;}
    function showError(failure){error.textContent=failure.message;error.hidden=false;root.querySelector('[data-reload]').hidden=false;}
    function candidates(){
      const query=picker.querySelector('input').value.toLocaleLowerCase();
      const eligible=users.filter(user=>!group.members.some(member=>member.id===user.id)&&(`${user.displayName||''} ${user.username}`).toLocaleLowerCase().includes(query));
      const list=picker.querySelector('[data-candidates]');
      list.innerHTML=eligible.map(user=>`<button type="button" class="chat-group-candidate" data-candidate="${user.id}"><span>${esc(user.displayName||user.username)}<small>@${esc(user.username)}</small></span>${icon('plus')}</button>`).join('')||'<p class="muted">Подходящих коллег нет. Приглашения в проект доступны в разделе «Команды».</p>';
      list.querySelectorAll('[data-candidate]').forEach(button=>button.onclick=()=>ask('add',users.find(user=>user.id===Number(button.dataset.candidate))));
    }
    function roster(){
      form.elements.title.readOnly=!canManage();form.querySelector('button').hidden=!canManage();
      nameState();
      root.querySelector('[data-count]').textContent=`Участники · ${group.members.filter(member=>member.active).length}`;
      root.querySelector('[data-add]').hidden=!canManage();
      if(!canManage())picker.hidden=true;
      const recovery=root.querySelector('[data-recovery]');recovery.hidden=!group.canRecoverOwner;
      recovery.innerHTML='<p class="muted">У владельца нет доступа к проекту. Назначьте нового владельца через меню активного участника.</p>';
      root.querySelector('[data-members]').innerHTML=group.members.map(member=>{
        const actions=groupMemberActions(group,member,owner);
        const actionLabels={transfer:'Передать владение',admin:'Назначить администратором',member:'Снять права администратора',remove:'Исключить из группы'};
        return `<div class="chat-group-member"><div><strong>${esc(member.username)}${member.id===owner?' · вы':''}</strong><small>${labels[member.role]}${member.active?'':' · нет доступа к проекту'}</small></div>${actions.length?`<details><summary class="icon-button" aria-label="Действия: ${esc(member.username)}">${icon('more')}</summary><div>${actions.map(action=>`<button type="button" class="text-button ${action==='remove'?'danger-text':''}" data-action="${action}" data-user="${member.id}">${actionLabels[action]}</button>`).join('')}</div></details>`:''}</div>`;
      }).join('');
      root.querySelectorAll('[data-action]').forEach(button=>button.onclick=()=>{button.closest('details').open=false;ask(button.dataset.action,group.members.find(member=>member.id===Number(button.dataset.user)));});
      root.querySelector('[data-leave]').disabled=group.role==='owner';
      root.querySelector('[data-leave-help]').textContent=group.role==='owner'?'Чтобы выйти, сначала передайте владение через меню другого участника.':'После выхода группа и её история станут недоступны. Участие в проекте сохранится.';
    }
    function ask(action,member){
      if(busy)return;
      const name=member?.username||'',messages={add:`Добавить ${name}? Этот человек увидит всю историю и файлы группы.`,remove:`Исключить ${name}? Доступ к переписке и файлам группы будет закрыт. Участие в проекте сохранится. Текущий звонок группы завершится.`,admin:`Назначить ${name} администратором? Он сможет менять название, добавлять и исключать обычных участников.`,member:`Снять права администратора у ${name}? Доступ к переписке сохранится.`,transfer:`Передать владение ${name}? Новый владелец сможет менять все роли и состав. Прежний владелец станет администратором.`,leave:'Выйти из группы? Доступ к её истории и файлам будет закрыт. Вернуться можно после добавления участником с правами управления. Текущий звонок группы завершится.'};
      confirm.innerHTML=`<p>${esc(messages[action])}</p><div class="form-actions"><button type="button" class="primary" data-accept>${action==='leave'?'Выйти':action==='remove'?'Исключить':action==='add'?'Добавить':'Подтвердить'}</button><button type="button" class="secondary" data-cancel>Отмена</button></div>`;
      confirm.hidden=false;confirm.scrollIntoView({block:'nearest'});
      confirm.querySelector('[data-cancel]').onclick=()=>{if(!busy)confirm.hidden=true;};
      confirm.querySelector('[data-accept]').onclick=()=>submit({action:['admin','member'].includes(action)?'role':action,userId:member?.id,role:['admin','member'].includes(action)?action:undefined});
      confirm.querySelector('[data-accept]').focus();
    }
    async function submit(payload){
      if(busy||!alive())return;busy=true;error.hidden=true;
      const controls=[...root.querySelectorAll('button,input')],disabled=controls.map(control=>control.disabled);controls.forEach(control=>control.disabled=true);
      try {
        await api(path,{method:'PATCH',headers,body:JSON.stringify({...payload,expectedVersion:group.version})});
        if(!alive())return;
        if(payload.action==='leave'){await closeDialog(dialog);await refresh(thread,true);return;}
        group=await api(path,{headers});if(!alive())return;
        if(payload.action==='rename')form.elements.title.value=group.title;
        confirm.hidden=true;picker.hidden=true;root.querySelector('[data-reload]').hidden=true;
        roster();await refresh(thread,false);
      }catch(failure){if(alive())showError(failure);}
      finally{busy=false;controls.forEach((control,index)=>{if(control.isConnected)control.disabled=disabled[index];});if(alive()){root.querySelector('[data-leave]').disabled=group.role==='owner';nameState();}}
    }
    form.onsubmit=event=>{event.preventDefault();submit({action:'rename',title:form.elements.title.value});};
    form.elements.title.oninput=nameState;
    root.querySelector('[data-add]').onclick=()=>{picker.hidden=!picker.hidden;if(!picker.hidden){candidates();picker.querySelector('input').focus();}};
    picker.querySelector('input').oninput=candidates;
    root.querySelector('[data-cancel-add]').onclick=()=>picker.hidden=true;
    root.querySelector('[data-leave]').onclick=()=>ask('leave');
    root.querySelector('[data-close]').onclick=()=>{if(!busy)closeDialog(dialog);};
    root.querySelector('[data-reload]').onclick=async()=>{
      if(busy||!alive())return;busy=true;
      try{const fresh=await Promise.all([api(path,{headers}),api('/api/users',{headers})]);if(!alive())return;const pristine=form.elements.title.value===group.title;[group,users]=fresh;if(pristine)form.elements.title.value=group.title;roster();candidates();confirm.hidden=true;error.hidden=true;root.querySelector('[data-reload]').hidden=true;}
      catch(failure){if(alive())showError(failure);}finally{busy=false;if(alive())nameState();}
    };
    roster();openModal(dialog);
  }
  return {open};
}
