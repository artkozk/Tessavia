export function reminderLocalInput(value) {
  if(!value)return '';
  const date=new Date(value);if(Number.isNaN(date.getTime()))return '';
  return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
}
export function reminderInstant(value) {
  const date=new Date(value);
  if(!value||Number.isNaN(date.getTime())||reminderLocalInput(date)!==value)throw new Error('Это местное время недоступно. Проверьте дату и переход часов.');
  return date.toISOString();
}

export function createPersonalRemindersUI({state,api,escapeHTML:esc,icon,openModal,closeDialog,bindDraft,clearDraft,flushDrafts,toast,renderPersonal,openSource,openHabit,openPlans,refreshNotifications}) {
  const q=(selector,root=document)=>root.querySelector(selector);
  const read=(owner,path,options={})=>api(path,{...options,headers:{'X-Outbox-Owner':String(owner)}});
  const time=value=>new Intl.DateTimeFormat('ru',{dateStyle:'medium',timeStyle:'short'}).format(new Date(value));
  let cache=null,pending=null,generation=0,formGeneration=0;
  function invalidate(){cache=null;generation++;}
  async function load(){
    const owner=state.me?.id,version=generation;if(!owner||pending?.owner===owner&&pending.version===version)return;
    const request=pending={owner,version};
    try{const value=await read(owner,'/api/personal/reminders');if(owner===state.me?.id&&generation===version)cache={owner,value};}
    catch(error){if(owner===state.me?.id&&generation===version)cache={owner,error:error.message};}
    finally{if(pending===request)pending=null;if(owner===state.me?.id&&generation===version&&state.view==='personal'&&state.personalTab==='today'&&!state.pageLayoutDraft&&!state.layoutDraft)renderPersonal();}
  }
  function render(){
    const current=cache?.owner===state.me?.id?cache:null,items=current?.value?.items||[],habits=current?.value?.habits||[];
    const habitRows=habits.map(item=>`<article class="personal-reminder-row"><button type="button" class="personal-reminder-source" data-reminder-habit="${esc(item.habitId)}"><strong>${esc(item.title)}</strong><small>Привычка · ${esc(time(item.createdAt))}</small></button><div class="personal-reminder-actions"><button type="button" class="icon-button" data-reminder-read="${esc(item.notificationId)}" aria-label="Прочитать напоминание: ${esc(item.title)}">${icon('check')}</button></div></article>`).join('');
    return `<section class="personal-section today-reminders"><div class="section-heading"><div><p class="eyebrow">Вернуться к делу</p><h2>Личные напоминания</h2></div><button type="button" class="text-button" data-reminder-plans>Все дела</button></div>${current?.error?`<p class="form-error">${esc(current.error)}</p><button type="button" class="text-button" data-reminder-retry>Повторить</button>`:current?.value?`${current.value.enabled?'':'<p class="muted">Доставка напоминаний личных дел выключена в настройках уведомлений.</p>'}<div class="personal-reminder-list">${items.slice(0,6).map(item=>`<article class="personal-reminder-row"><button type="button" class="personal-reminder-source" data-reminder-source="${esc(item.planId)}"><strong>${esc(item.title)}</strong><small>${item.notificationId?'Получено':'Назначено'} · ${esc(time(item.remindAt))}</small></button><div class="personal-reminder-actions"><button type="button" class="text-button" data-personal-reminder="${esc(item.planId)}">${item.notificationId?'Отложить':'Изменить время'}</button>${item.notificationId?`<button type="button" class="icon-button" data-reminder-read="${esc(item.notificationId)}" aria-label="Прочитать напоминание: ${esc(item.title)}">${icon('check')}</button>`:''}</div></article>`).join('')||(!habits.length?'<p class="muted">В личном деле нажмите «Напомнить», а в трекере привычки — «Напоминание».</p>':'')}${habitRows}</div>${current.value.habitsEnabled?'':'<p class="muted">Доставка напоминаний привычек выключена в настройках уведомлений.</p>'}${current.value.hasMoreHabits?'<p class="muted">Показаны шесть напоминаний привычек. Остальные — во входящих уведомлениях.</p>':''}${items.length>6||current.value.hasMore?'<p class="muted">Показаны шесть ближайших. Остальные напоминания доступны в своих делах.</p>':''}`:'<p class="muted">Загружаем личные напоминания…</p>'}</section>`;
  }
  function bind(){
    const root=q('.today-reminders');if(!root)return;
    if(cache?.owner!==state.me?.id)void load();
    q('[data-reminder-retry]',root)?.addEventListener('click',()=>{invalidate();void load();});
    q('[data-reminder-plans]',root).onclick=openPlans;
    root.querySelectorAll('[data-reminder-source]').forEach(button=>button.onclick=()=>openSource(button.dataset.reminderSource));
    root.querySelectorAll('[data-reminder-habit]').forEach(button=>button.onclick=()=>openHabit(button.dataset.reminderHabit));
    root.querySelectorAll('[data-personal-reminder]').forEach(button=>button.onclick=()=>open(button.dataset.personalReminder));
    root.querySelectorAll('[data-reminder-read]').forEach(button=>button.onclick=async()=>{
      const owner=state.me?.id;if(!owner||button.disabled)return;button.disabled=true;
      try{await read(owner,`/api/notifications/${button.dataset.reminderRead}/read`,{method:'POST'});if(owner!==state.me?.id)return;invalidate();await load();await refreshNotifications();}
      catch(error){if(owner===state.me?.id){toast(error.message,true);button.disabled=false;}}
    });
  }
  async function open(planId){
    const owner=state.me?.id;if(!owner)return;
    const dialog=q('#personal-dialog'),content=q('#personal-dialog-content');
    if(dialog.open&&!flushDrafts(dialog))return;
    const request=++formGeneration;
    content.innerHTML=`<div class="dialog-form today-settings-dialog personal-reminder-dialog"><header><h2>Напомнить о деле</h2><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><p role="status">Загружаем напоминание…</p></div>`;
    q('[data-close]',content).onclick=()=>closeDialog(dialog);openModal(dialog);
    const alive=()=>owner===state.me?.id&&request===formGeneration&&dialog.open;
    try{
      const item=await read(owner,`/api/personal/plans/${planId}/reminder`);if(!alive())return;
      const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
      content.innerHTML=`<div class="dialog-form today-settings-dialog personal-reminder-dialog"><header><h2>Напомнить о деле</h2><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><p class="reminder-plan-title">${esc(item.title)}</p><p class="muted" data-reminder-state>${item.cancelled?(item.revision?'Предыдущее напоминание отменено. Выберите новое время, если оно ещё нужно.':'Напоминание ещё не задано.'):`${item.notificationId?(item.readAt?'Прочитано':'Доставлено во входящие'):'Назначено'} · ${esc(time(item.remindAt))}`}</p>${item.planStatus!=='planned'?'<p class="muted">Дело завершено. Новое напоминание можно задать после возвращения в работу.</p>':''}<form><input type="hidden" name="revision" value="${item.revision}"><input type="hidden" name="planVersion" value="${esc(item.planUpdatedAt)}"><label>Когда напомнить<input type="datetime-local" name="remindAt" value="${esc(reminderLocalInput(item.cancelled?'':item.remindAt))}" required></label><p class="muted">Время на устройстве: ${esc(timezone)}. Тихие часы берутся из настроек уведомлений. Напоминание появится во входящих и на экране «Сегодня».</p><div class="personal-reminder-shortcuts"><button type="button" class="text-button" data-reminder-later="60">Через час</button><button type="button" class="text-button" data-reminder-later="1440">Через 24 часа</button></div><p class="muted">Перенос напоминания сохраняет дату и срок дела. Завершение или изменение календаря дела отменит это напоминание. Для повторяющегося дела выбор относится только к этому экземпляру.</p><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary" ${item.planStatus==='planned'?'':'disabled'}>Сохранить время</button><button type="button" class="text-button" data-reminder-cancel ${item.cancelled?'disabled':''}>Выключить напоминание</button></div></form></div>`;
      const form=q('form',content),error=q('[role=alert]',form);let busy=false;
      const current=()=>alive()&&form.isConnected;
      bindDraft(form,`personal:${owner}:plan-reminder:${planId}`);
      q('[data-close]',content).onclick=()=>closeDialog(dialog);
      form.querySelectorAll('[data-reminder-later]').forEach(button=>button.onclick=()=>{form.elements.remindAt.value=reminderLocalInput(new Date(Date.now()+Number(button.dataset.reminderLater)*60000));form.dispatchEvent(new Event('input',{bubbles:true}));});
      async function save(cancelled){
        if(busy||!current())return;busy=true;form.inert=true;error.hidden=true;
        try{
          if(!flushDrafts(dialog))throw new Error('Не удалось сохранить черновик. Поля остаются в форме.');
          const remindAt=cancelled?'':reminderInstant(form.elements.remindAt.value);
          await read(owner,`/api/personal/plans/${planId}/reminder`,{method:'PUT',body:JSON.stringify({remindAt,timezone,cancelled,expectedRevision:Number(form.elements.revision.value),expectedPlanUpdatedAt:form.elements.planVersion.value})});
          if(!current())return;clearDraft(form);await closeDialog(dialog);invalidate();await load();await refreshNotifications();if(owner===state.me?.id)toast(cancelled?'Напоминание выключено':'Время напоминания сохранено');
        }catch(failure){
          if(!current())return;error.textContent=failure.message;error.hidden=false;
          if(failure.status===409){
            const review=document.createElement('button');review.type='button';review.className='text-button';review.textContent='Показать текущую версию';error.append(review);
            review.onclick=async()=>{review.disabled=true;try{
              const latest=await read(owner,`/api/personal/plans/${planId}/reminder`);if(!current())return;
              error.textContent=`Сейчас: ${latest.title}. ${latest.planStatus==='planned'?'В работе':'Завершено'}. ${latest.cancelled?'Напоминание выключено':`Напомнить ${time(latest.remindAt)}`}. Ваше время осталось в форме.`;
              if(latest.planStatus==='planned'||cancelled){const apply=document.createElement('button');apply.type='button';apply.className='text-button';apply.textContent='Применить к текущему делу';error.append(apply);apply.onclick=()=>{form.elements.revision.value=latest.revision;form.elements.planVersion.value=latest.planUpdatedAt;void save(cancelled);};}
            }catch(problem){if(current()){toast(problem.message,true);review.disabled=false;}}};
          }
        }finally{busy=false;form.inert=false;}
      }
      form.onsubmit=event=>{event.preventDefault();void save(false);};q('[data-reminder-cancel]',form).onclick=()=>void save(true);
    }catch(error){if(alive()){const status=q('[role=status]',content);if(status)status.textContent=error.message;toast(error.message,true);}}
  }
  setInterval(()=>{if(state.view==='personal'&&state.personalTab==='today'&&!state.pageLayoutDraft&&!state.layoutDraft&&q('.today-reminders')){invalidate();void load();}},60000);
  return {render,bind,invalidate,open,hasContent:()=>cache?.owner===state.me?.id&&Boolean(cache.error||cache.value?.items?.length||cache.value?.habits?.length)};
}
