export function workCalendarEntries(work) {
 return work.map(item=>({...item,recordId:item.id,id:`work:${item.id}`,calendarKind:'work',status:item.status==='completed'?'done':'planned'}));
}

export function createPersonalCalendarUI({state,api,esc,icon,rerender,openModal,closeDialog,toast,openSource,openPlan,formatDate,bindDraft,clearDraft}) {
 let key='',data=null,error='',pending=false,request=0,timer,range;
 const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
 const params=()=>new URLSearchParams({...range,timezone:zone()}).toString();
 const visible=()=>document.visibilityState==='visible'&&['calendar','day'].includes(state.view)&&state.calendarScope==='personal';
 document.addEventListener?.('visibilitychange',()=>{if(visible()&&key&&!pending)void load();});
 function invalidate(){key='';data=null;error='';pending=false;request++;clearTimeout(timer);}
 function ensure(from,to,force=false){
  const next=`${state.me?.id}:${from}:${to}:${zone()}`;
  if(next!==key){key=next;range={from,to};data=null;error='';pending=false;request++;}
  if(!pending&&(force||!data&&!error))void load();
  return data;
 }
 async function load(){
  const expected=key,owner=state.me?.id,sequence=++request,previous=JSON.stringify(data),previousError=error;
  pending=true;error='';clearTimeout(timer);
  try{const result=await api('/api/personal/calendar?'+params());if(expected!==key||owner!==state.me?.id||sequence!==request)return;data=result;}
  catch(failure){if(expected!==key||owner!==state.me?.id||sequence!==request)return;error=failure.message;data=null;}
  finally{if(expected===key&&owner===state.me?.id&&sequence===request){pending=false;if(previous!==JSON.stringify(data)||previousError!==error)rerender();timer=setTimeout(()=>{if(visible())void load();},15000);}}
 }
 function entryLabel(item){return `${item.title}${item.workspace?' · '+item.workspace:''}`;}
 function banner(){
  if(error)return `<div class="calendar-conflict-banner is-error" role="status"><span>Не удалось проверить пересечения: ${esc(error)}</span><button type="button" class="secondary" data-calendar-retry>Повторить</button></div>`;
  if(!data)return `<p class="muted" role="status">Проверяем личные планы и вашу работу во всех проектах…</p>`;
  const unresolved=data.conflicts.filter(item=>!item.confirmed).length,confirmed=data.conflicts.length-unresolved;
  if(!data.conflicts.length)return '';
  return `<div class="calendar-conflict-banner ${unresolved?'needs-attention':''}" role="status"><div><strong>${unresolved?`Пересечения по времени: ${unresolved}`:`Подтверждённые пересечения: ${confirmed}`}</strong><small>Учитывается и скрытая рабочая занятость.${unresolved&&confirmed?` Подтверждено: ${confirmed}.`:''}</small></div><button type="button" class="secondary" data-calendar-conflicts>Проверить пересечения</button></div>`;
 }
 function bind(root){
  root.querySelector('[data-calendar-retry]')?.addEventListener('click',()=>{void load();});
  root.querySelector('[data-calendar-conflicts]')?.addEventListener('click',openConflicts);
  root.querySelector('[data-calendar-work-plan]')?.addEventListener('click',()=>openWork());
 }
 async function openConflicts(){
  const owner=state.me?.id,expected=key;
  const dialog=document.querySelector('#workspace-dialog'),root=document.querySelector('#workspace-dialog-content');
  if(dialog.open)return;
  const snapshot=data;if(!snapshot)return;
  root.innerHTML=`<div class="workspace-editor-shell calendar-conflict-dialog"><header><div><h2>Пересечения по времени</h2><p>Личные планы и ваша работа во всех доступных проектах. Подтверждение сохраняется только для текущего времени этих записей.</p></div><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><div class="calendar-conflict-list">${snapshot.conflicts.map(conflict=>`<article><strong>${esc(formatDate(conflict.start,true))} — ${esc(formatDate(conflict.end,true))}</strong>${conflict.items.map((item,index)=>`<button type="button" class="calendar-conflict-source" data-source="${esc(conflict.id)}" data-source-index="${index}"><span>${item.kind==='work'?'Рабочая задача':'Личный план'}</span><strong>${esc(entryLabel(item))}</strong><small>${esc(formatDate(item.start,true))} — ${esc(formatDate(item.end,true))}</small></button>`).join('')}<button type="button" class="${conflict.confirmed?'secondary':'primary'}" data-confirm="${esc(conflict.id)}">${conflict.confirmed?'Отменить подтверждение':'Это не ошибка'}</button><p class="form-error" data-error="${esc(conflict.id)}" role="alert" hidden></p></article>`).join('')}</div></div>`;
  root.querySelector('[data-close]').onclick=()=>closeDialog(dialog);
  root.querySelectorAll('[data-source]').forEach(button=>button.onclick=async()=>{
   const conflict=snapshot.conflicts.find(item=>item.id===button.dataset.source),item=conflict.items[Number(button.dataset.sourceIndex)];
   if(!await closeDialog(dialog)||owner!==state.me?.id)return;
   if(item.kind==='work')await openWork(item.id);else openPlan(item.id);
  });
  root.querySelectorAll('[data-confirm]').forEach(button=>button.onclick=async()=>{
   if(button.disabled||owner!==state.me?.id||expected!==key||!dialog.open)return;button.disabled=true;
   const conflict=snapshot.conflicts.find(item=>item.id===button.dataset.confirm),errorNode=root.querySelector(`[data-error="${conflict.id}"]`);
   try{await api('/api/personal/calendar/confirmations?'+params(),{method:'PUT',body:JSON.stringify({id:conflict.id,confirmed:!conflict.confirmed})});
    if(owner!==state.me?.id||expected!==key||!dialog.open)return;
    conflict.confirmed=!conflict.confirmed;button.textContent=conflict.confirmed?'Отменить подтверждение':'Это не ошибка';button.className=conflict.confirmed?'secondary':'primary';errorNode.hidden=true;void load();
   }catch(failure){if(dialog.open&&owner===state.me?.id){errorNode.textContent=failure.message;errorNode.hidden=false;}}
   finally{button.disabled=false;}
  });
  openModal(dialog);
 }
 async function openWork(id=''){
  const owner=state.me?.id,expected=key,dialog=document.querySelector('#workspace-dialog'),root=document.querySelector('#workspace-dialog-content');
  if(dialog.open||!data)return;
  const items=data.work.filter(item=>id?item.id===id:item.status!=='completed');
  if(!items.length){toast('Нет доступной работы, назначенной вам');return;}
  const stamp=value=>{if(!value)return '';const date=new Date(value);return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);};
  let current=id?items[0]:null;
  root.innerHTML=`<div class="workspace-editor-shell calendar-work-dialog"><header><div><h2>${id?'Время рабочей задачи':'Запланировать рабочую задачу'}</h2><p>Этот блок виден только вам. Командный срок и права карточки сохраняются.</p></div><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><form><label>Задача<select name="record" required ${id?'disabled':''}><option value="">Выберите задачу</option>${items.map(item=>`<option value="${esc(item.id)}" ${item.id===id?'selected':''}>${esc(entryLabel(item))}</option>`).join('')}</select></label><p data-deadline class="muted"></p><label>Начало<input type="datetime-local" name="start" required></label><label>Окончание<input type="datetime-local" name="end" required></label><p>Пересечения проверяются и при скрытых рабочих задачах. Срок без временного блока не считается занятостью.</p><p class="form-error" role="alert" hidden></p><div class="form-actions"><button class="primary" type="submit">Сохранить время</button><button type="button" class="secondary" data-remove>Убрать временной блок</button><button type="button" class="text-button" data-source-record>Открыть карточку</button></div></form></div>`;
  const form=root.querySelector('form'),errorNode=root.querySelector('[role=alert]');
  const alive=()=>owner===state.me?.id&&expected===key&&dialog.open;
  function refresh(keepDraft=false){
   if(!keepDraft){form.elements.start.value=stamp(current?.startsAt);form.elements.end.value=stamp(current?.endsAt);}
   root.querySelector('[data-deadline]').textContent=current?.dueAt?'Командный срок: '+formatDate(current.dueAt,true):'Командный срок не задан';
   root.querySelector('[data-remove]').hidden=!current?.startsAt;
   root.querySelector('[data-source-record]').hidden=!current;
   for(const element of [form.elements.start,form.elements.end,form.querySelector('[type=submit]'),root.querySelector('[data-remove]')])element.disabled=current?.status==='completed';
  }
  form.elements.record.onchange=()=>{current=items.find(item=>item.id===form.elements.record.value)||null;refresh();};
  root.querySelector('[data-close]').onclick=()=>closeDialog(dialog);
  root.querySelector('[data-source-record]').onclick=async()=>{if(current&&await closeDialog(dialog)&&owner===state.me?.id)openSource({sourceKind:'record',sourceId:current.id,workspaceId:current.workspaceId});};
  let busy=false;
  async function save(clear=false){
   if(busy||!current||!alive())return;
   const start=new Date(form.elements.start.value),end=new Date(form.elements.end.value);
   if(!clear&&(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start)){errorNode.textContent='Окончание должно быть позже начала';errorNode.hidden=false;form.elements.end.focus();return;}
   busy=true;form.querySelector('[type=submit]').disabled=true;errorNode.hidden=true;
   try{await api('/api/personal/calendar/work/'+encodeURIComponent(current.id),{method:'PUT',body:JSON.stringify({startsAt:clear?'':start.toISOString(),endsAt:clear?'':end.toISOString(),expectedUpdatedAt:current.updatedAt})});
    if(!alive())return;clearDraft(form);await closeDialog(dialog);await load();toast(clear?'Временной блок убран':'Время сохранено');
   }catch(failure){if(alive()){errorNode.textContent=failure.message;errorNode.hidden=false;}}
   finally{busy=false;form.querySelector('[type=submit]').disabled=false;}
  }
  form.onsubmit=event=>{event.preventDefault();void save();};root.querySelector('[data-remove]').onclick=()=>save(true);
  refresh();bindDraft(form,`personal-calendar-work:${owner}:${id||'new'}`);current=items.find(item=>item.id===form.elements.record.value)||current;refresh(true);openModal(dialog);
 }
 return {ensure,invalidate,entries:()=>workCalendarEntries(data?.work||[]),banner,bind,openWork};
}
