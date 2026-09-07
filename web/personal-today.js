export function todayHiddenBlocks(data, day, waitingHasContent, remindersHaveContent) {
  const groups = todayPlanGroups(data.plans || [], day);
  const hidden = ['summary'];
  if (!day || (!groups.events.length && !day.timeKnown)) hidden.push('day-time');
  if (!groups.overdue.length && !day?.projectAttention?.total) hidden.push('day-attention');
  if (!groups.today.length && !groups.completed.length && !groups.upcoming.length) hidden.push('plans');
  if (!day?.projectWork?.total) hidden.push('day-project-work');
  if (!waitingHasContent) hidden.push('day-waiting');
  if (!remindersHaveContent) hidden.push('day-reminders');
  if (!(data.habits || []).some(h => !h.archivedAt && !h.paused)) hidden.push('habits');
  if (!data.settings?.birthDate) hidden.push('life');
  if (!(data.notes || []).length) hidden.push('notes');
  return hidden;
}

export function useProgressiveToday(layout, editing) {
  return !editing && !Object.keys(layout || {}).length;
}

export function todayPlanGroups(plans,summary){
  const map=new Map([...(summary?.recurrences||[]),...plans].map(item=>[item.id,item]));
  const group=key=>(summary?.[key]||[]).map(id=>map.get(id)).filter(Boolean);
  return {today:group('today'),events:group('events'),overdue:group('overdue'),upcoming:group('upcoming'),completed:group('completed'),focus:summary?.focus.title?{...(map.get(summary.focus.planId)||{}),id:summary.focus.planId,title:summary.focus.title,status:summary.focus.status}:map.get(summary?.focus.planId)||null};
}

export function createPersonalTodayUI({state,api,escapeHTML:esc,icon,renderPersonal,renderPlanRow,formatMinutes,openPlan,openRecurrence,openProject,togglePlan,openDay,openModal,closeDialog,bindDraft,clearDraft,flushDrafts,toast}){
  const q=(selector,root=document)=>root.querySelector(selector);
  let cached=null,request=null,generation=0;
  const zone=()=>Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC';
  const current=()=>cached?.owner===state.me?.id?cached.value:null;
  const hasNoProjectContext=()=>{const value=current();return !!value&&!(value.projectWork?.total||value.projectAttention?.total);};
  const read=(owner,path,options={})=>api(path,{...options,headers:{'X-Outbox-Owner':String(owner)}});
  function invalidate(){generation++;cached=null;request=null;}
  async function load(){
    const owner=state.me?.id,version=generation;if(!owner||request?.owner===owner)return;
    const entry=request={owner,version};
    try{
      const value=await read(owner,`/api/personal/day?timezone=${encodeURIComponent(zone())}`);
      if(owner!==state.me?.id||version!==generation)return;
      cached={owner,value};
    }catch(error){if(owner===state.me?.id&&version===generation)cached={owner,error:error.message};}
    finally{if(request===entry)request=null;if(owner===state.me?.id&&version===generation&&state.view==='personal'&&state.personalTab==='today'&&!state.pageLayoutDraft&&!state.layoutDraft)renderPersonal();}
  }
  const timeLabel=(instant,tz)=>new Intl.DateTimeFormat('ru',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(new Date(instant));
  const forecastRow=plan=>`<button type="button" class="today-forecast" data-today-open="${esc(plan.id)}"><span>${icon('rotate')}</span><span><strong>${esc(plan.title)}</strong><small>${esc(new Date(plan.occurrenceDate+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'}))} · Повторение по серии</small></span>${icon('chevronRight')}</button>`;
  const planRow=(plan,links)=>plan.calendarKind==='recurrence'?forecastRow(plan):renderPlanRow(plan,links);
  function status(){return cached?.owner===state.me?.id&&cached.error?`<p class="form-error">${esc(cached.error)}</p><button type="button" class="text-button" data-today-retry>Повторить</button>`:'<p class="muted">Загружаем расписание дня…</p>';}
  function renderBlocks(data){
    const value=current(),groups=todayPlanGroups(data.plans,value),focus=groups.focus;
    const hasPlans=data.plans.some(plan=>plan.status==='planned');
    const inboxCount=data.notes.filter(note=>note.inInbox).length;
    const projectNext=value?.projectWork?.items?.[0]||value?.projectAttention?.items?.[0];
    const nextStep=hasPlans?'Выберите одно личное дело, которому хотите уделить внимание. Его дата и срок сохранятся.':inboxCount?'Во входящих есть записи. Решите, что оставить заметкой, а что превратить в дело.':projectNext?'Откройте назначенную вам работу. Она остаётся в своём проекте; личные записи видны только вам.':'Можно добавить следующее личное дело без срока и других обязательных параметров.';
    const projectRow=item=>`<button type="button" class="today-project-row" data-today-project="${esc(item.id)}" data-today-project-workspace="${esc(item.workspaceId)}"><span><small>${esc(item.reason)} · ${esc(item.workspace)}</small><strong>${esc(item.title)}</strong></span>${icon('chevronRight')}</button>`;
    const selectedDate=value?new Intl.DateTimeFormat('ru',{day:'numeric',month:'long',weekday:'short',timeZone:'UTC'}).format(new Date(value.date+'T12:00:00Z')):'Сегодня';
    const focusBlock=`<section class="personal-section today-focus"><div class="section-heading"><div><p class="eyebrow">${esc(selectedDate)}</p><h2>${focus||hasPlans?'Главное':'Следующий шаг'}</h2></div><button type="button" class="text-button" ${hasPlans||focus?'data-today-focus':inboxCount?'data-personal-tab-jump="inbox"':projectNext?`data-today-project="${esc(projectNext.id)}" data-today-project-workspace="${esc(projectNext.workspaceId)}"`:'data-personal-create="plan"'} ${value?'':'disabled'}>${focus?'Выбрать другое':hasPlans?'Выбрать':inboxCount?'Разобрать':projectNext?'Открыть работу':'Создать дело'}</button></div>${value?(focus?`<button type="button" class="today-focus-source" data-today-open="${esc(focus.id)}"><strong>${esc(focus.title)}</strong><span>${focus.status==='done'?'Выполнено':'Выбрано вами на этот день'}</span></button>${focus.status==='planned'?`<button type="button" class="secondary" data-today-complete="${esc(focus.id)}">${icon('check')} Выполнено</button>`:''}`:`<p class="muted">${esc(nextStep)}</p>`) : status()}${value?`<details class="today-tools"><summary>Планирование дня</summary><div><button type="button" class="text-button" data-today-calendar>Открыть день</button><button type="button" class="text-button" data-today-settings>Границы дня</button></div></details>`:''}</section>`;
    const schedule=`<section class="personal-section today-schedule"><div class="section-heading"><div><p class="eyebrow">Расписание</p><h2>По времени</h2></div><button type="button" class="text-button" data-today-calendar ${value?'':'disabled'}>Открыть день</button></div>${value?`<div class="personal-list">${groups.events.slice(0,6).map(plan=>`<button type="button" class="today-event" data-today-open="${esc(plan.id)}"><time>${plan.startsAt?esc(timeLabel(plan.startsAt,value.settings.timezone)):'Весь день'}</time><span class="today-event-title"><strong>${esc(plan.title)}</strong>${plan.calendarKind==='recurrence'?'<small>Повторение по серии</small>':''}</span></button>`).join('')||'<p class="muted">Событий на сегодня нет.</p>'}</div>${groups.events.length>6?`<button type="button" class="text-button" data-today-calendar>Все события · ${groups.events.length}</button>`:''}${value.workBusyCount?`<button type="button" class="text-button" data-today-calendar>Рабочие интервалы · ${value.workBusyCount} · Открыть день</button>`:''}<div class="today-capacity"><div><h3>${value.timeKnown?`Свободно до конца дня · ${formatMinutes(value.remainingFreeMinutes)}`:'Свободное время неизвестно'}</h3><button type="button" class="text-button" data-today-settings>Границы дня</button></div>${value.timeKnown?`<p class="today-windows">${value.remainingFree.map(window=>`<span>${esc(timeLabel(window.start,value.settings.timezone))}–${esc(timeLabel(window.end,value.settings.timezone))}</span>`).join('')||'До конца заданного дня свободных промежутков нет.'}</p><p class="muted">${esc(value.settings.timezone)} · ${esc(value.settings.start)}–${esc(value.settings.end)}. Учтены личные события, повторения и рабочие интервалы, даже если работа скрыта в календаре. Дела без времени не вычитаются.</p>`:`<p class="muted">${esc(value.timeReason)}</p>`}</div>`:status()}</section>`;
    const attentionTotal=groups.overdue.length+(value?.projectAttention?.total||0);
    const attention=`<section class="personal-section today-attention"><div class="section-heading"><h2>Требует внимания</h2><span class="panel-note">${attentionTotal}</span></div>${value?`<div class="personal-list">${groups.overdue.slice(0,6).map(plan=>`<div class="today-attention-row"><small>Срок личного дела прошёл · ${esc(new Intl.DateTimeFormat('ru',{timeZone:value.settings.timezone,day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(plan.dueAt)))}</small>${planRow(plan,data.links)}</div>`).join('')}${(value.projectAttention?.items||[]).map(projectRow).join('')||(!groups.overdue.length?'<p class="muted">Просрочек, ожидающей вас приёмки и критических рисков нет.</p>':'')}</div>${groups.overdue.length>6?'<button type="button" class="text-button" data-personal-tab-jump="plans">Открыть все личные дела</button>':''}${value.projectAttention?.hasMore?`<p class="muted">Показаны первые ${value.projectAttention.items.length} проектных сигналов из ${value.projectAttention.total}.</p>`:''}`:status()}</section>`;
    return focusBlock+schedule+attention;
  }
  function renderPlans(data){
    const value=current(),groups=todayPlanGroups(data.plans,value);
    const projectRow=item=>`<button type="button" class="today-project-row" data-today-project="${esc(item.id)}" data-today-project-workspace="${esc(item.workspaceId)}"><span><small>${esc(item.reason)} · ${esc(item.workspace)}</small><strong>${esc(item.title)}</strong></span>${icon('chevronRight')}</button>`;
    const personal=`<section class="personal-section today-plans"><div class="section-heading"><h2>Дела на сегодня</h2><button type="button" class="text-button" data-personal-tab-jump="plans">Все дела</button></div>${value?`<div class="personal-list">${groups.today.slice(0,6).map(plan=>planRow(plan,data.links)).join('')||'<p class="muted">На сегодня дела не назначены.</p>'}</div>${groups.today.length>6?`<button type="button" class="text-button" data-today-calendar>Весь день · ${groups.today.length}</button>`:''}${groups.completed.length?`<details class="today-completed"><summary>Завершено в расписании дня · ${groups.completed.length}</summary>${groups.completed.slice(0,6).map(plan=>planRow(plan,data.links)).join('')}</details>`:''}${groups.upcoming.length?`<details class="today-upcoming"><summary>Позже · ${groups.upcoming.length}</summary><p class="muted">Повторения рассчитаны на 7 дней вперёд.</p>${groups.upcoming.slice(0,4).map(plan=>planRow(plan,data.links)).join('')}<button type="button" class="text-button" data-personal-tab-jump="plans">Все дела</button></details>`:''}`:status()}</section>`;
    const projects=`<section class="personal-section today-project-work"><div class="section-heading"><div><p class="eyebrow">Доступные стартапы</p><h2>Моя работа в проектах</h2></div><span class="panel-note">${value?.projectWork?.total||0}</span></div>${value?`<div class="personal-list">${(value.projectWork?.items||[]).map(projectRow).join('')||'<p class="muted">На сегодня нет назначенной вам проектной работы.</p>'}</div>${value.projectWork?.hasMore?`<p class="muted">Показаны первые ${value.projectWork.items.length} карточек из ${value.projectWork.total}.</p>`:''}`:status()}</section>`;
    return personal+projects;
  }
  async function openFocus(){
    const owner=state.me.id,value=current();if(!value)return;
    const dialog=q('#workspace-dialog'),content=q('#workspace-dialog-content');
    if(dialog.open&&!flushDrafts(dialog))return;
    content.innerHTML=`<div class="workspace-editor-shell today-settings-dialog"><header><h2>Главное дело дня</h2><button type="button" class="icon-button" data-today-close aria-label="Закрыть">${icon('x')}</button></header><form><input type="hidden" name="planId" value="${esc(value.focus.planId)}"><input type="hidden" name="version" value="${esc(value.focus.updatedAt)}"><label>Найти личное дело<input name="query" type="search" autocomplete="off" placeholder="Название"></label><div class="today-focus-choices" data-focus-choices></div><p class="muted">Выбор действует на ${esc(value.date)} и не переносит срок дела.</p><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Сохранить выбор</button><button type="button" class="text-button" data-focus-clear>Без главного дела</button></div></form></div>`;
    const form=q('form',content),alive=()=>owner===state.me?.id&&form.isConnected&&dialog.open;
    bindDraft(form,`personal:${owner}:focus:${value.date}`);
    q('[data-today-close]',content).onclick=()=>closeDialog(dialog);
    function list(){const search=form.elements.query.value.trim().toLocaleLowerCase(),items=(state.personal?.plans||[]).filter(p=>p.status==='planned'&&p.title.toLocaleLowerCase().includes(search));const root=q('[data-focus-choices]',form);root.innerHTML=items.slice(0,60).map(p=>`<button type="button" data-focus-id="${esc(p.id)}" aria-pressed="${form.elements.planId.value===p.id}"><span>${esc(p.title)}</span>${form.elements.planId.value===p.id?icon('check'):''}</button>`).join('')||(items.length?'':'<p class="muted">Подходящих незавершённых дел нет.</p>');if(items.length>60)root.insertAdjacentHTML('beforeend','<p class="muted">Показаны первые 60. Уточните название.</p>');root.querySelectorAll('[data-focus-id]').forEach(button=>button.onclick=()=>{form.elements.planId.value=button.dataset.focusId;form.dispatchEvent(new Event('input',{bubbles:true}));list();});}
    form.elements.query.oninput=list;q('[data-focus-clear]',form).onclick=()=>{form.elements.planId.value='';form.dispatchEvent(new Event('input',{bubbles:true}));list();};list();
    bindSave(form,dialog,owner,()=>read(owner,`/api/personal/day/${value.date}/focus`,{method:'PUT',body:JSON.stringify({planId:form.elements.planId.value,expectedUpdatedAt:form.elements.version.value})}),alive,'focus',value.date);
    openModal(dialog);
  }
  function openSettings(){
    const owner=state.me.id,value=current();if(!value)return;
    const dialog=q('#workspace-dialog'),content=q('#workspace-dialog-content');if(dialog.open&&!flushDrafts(dialog))return;
    const zones=[...new Set([value.settings.timezone,...(Intl.supportedValuesOf?Intl.supportedValuesOf('timeZone'):['UTC','Europe/Moscow'])])];
    content.innerHTML=`<div class="workspace-editor-shell today-settings-dialog"><header><h2>Границы дня</h2><button type="button" class="icon-button" data-today-close aria-label="Закрыть">${icon('x')}</button></header><form><input type="hidden" name="version" value="${esc(value.settings.updatedAt)}"><label>Часовой пояс<select name="timezone">${zones.map(zone=>`<option ${zone===value.settings.timezone?'selected':''}>${esc(zone)}</option>`).join('')}</select></label><div class="form-grid two"><label>Начало<input type="time" name="start" value="${esc(value.settings.start)}"></label><label>Конец<input type="time" name="end" value="${esc(value.settings.end)}"></label></div><p class="muted">Если конец раньше начала, день продолжается после полуночи. Оставьте оба времени пустыми, чтобы не рассчитывать свободное время. Настройка личная и действует на всех ваших устройствах.</p><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Сохранить</button></div></form></div>`;
    const form=q('form',content),alive=()=>owner===state.me?.id&&form.isConnected&&dialog.open;bindDraft(form,`personal:${owner}:day-settings`);q('[data-today-close]',content).onclick=()=>closeDialog(dialog);
    bindSave(form,dialog,owner,()=>read(owner,'/api/personal/day/settings',{method:'PUT',body:JSON.stringify({timezone:form.elements.timezone.value,start:form.elements.start.value,end:form.elements.end.value,expectedUpdatedAt:form.elements.version.value})}),alive,'settings',value.date);openModal(dialog);
  }
  function bindSave(form,dialog,owner,save,alive,kind,date){
    let busy=false;
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!alive())return;busy=true;
      const button=q('[type=submit]',form),error=q('[role=alert]',form);button.disabled=true;form.inert=true;error.hidden=true;
      try{
        if(!flushDrafts(dialog))throw new Error('Не удалось сохранить черновик. Поля остаются в форме.');
        await save();if(!alive())return;
        clearDraft(form);await closeDialog(dialog);invalidate();await load();if(owner===state.me?.id)toast('Сохранено');
      }catch(failure){
        if(!alive())return;error.textContent=failure.message;error.hidden=false;
        if(failure.status===409){
          const review=document.createElement('button');review.type='button';review.className='text-button';review.textContent='Показать текущий выбор';error.append(review);
          review.onclick=async()=>{review.disabled=true;try{
            const latest=await read(owner,`/api/personal/day?date=${date}&timezone=${encodeURIComponent(zone())}`);if(!alive())return;
            const actual=latest[kind],description=kind==='focus'?actual.title||'Главное дело не выбрано':`${actual.timezone} · ${actual.start||'Начало не задано'}–${actual.end||'Конец не задан'}`;
            error.textContent=`Сейчас сохранено: ${description}. Ваши поля остались в форме.`;
            const apply=document.createElement('button');apply.type='button';apply.className='text-button';apply.textContent='Применить мой выбор к этой версии';error.append(apply);
            apply.onclick=()=>{form.elements.version.value=actual.updatedAt;form.requestSubmit();};
          }catch(errorValue){if(alive()){review.disabled=false;toast(errorValue.message,true);}}};
        }
      }finally{busy=false;form.inert=false;if(form.isConnected)button.disabled=false;}
    };
  }
  function bind(){
    const root=q('.today-focus');if(!root)return;
    if(!cached||cached.owner!==state.me?.id)void load();
    document.querySelectorAll('[data-today-retry]').forEach(button=>button.onclick=()=>{invalidate();void load();});
    document.querySelectorAll('[data-today-open]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.todayOpen,forecast=current()?.recurrences?.find(item=>item.id===id);
      if(forecast)return openRecurrence(forecast);
      if(!id.startsWith('recurrence:'))openPlan(id);
    });
    document.querySelectorAll('[data-today-project]').forEach(button=>button.onclick=()=>openProject(button.dataset.todayProject,button.dataset.todayProjectWorkspace));
    document.querySelectorAll('[data-today-complete]').forEach(button=>button.onclick=()=>togglePlan(button.dataset.todayComplete));
    document.querySelectorAll('[data-today-calendar]').forEach(button=>button.onclick=()=>current()&&openDay(current().date,'personal'));
    q('[data-today-focus]')?.addEventListener('click',openFocus);document.querySelectorAll('[data-today-settings]').forEach(button=>button.addEventListener('click',openSettings));
  }
  setInterval(()=>{if(state.view==='personal'&&state.personalTab==='today'&&!state.pageLayoutDraft&&!state.layoutDraft&&q('.today-focus')){invalidate();void load();}},60000);
  return {renderBlocks,renderPlans,bind,invalidate,hasNoProjectContext,hiddenBlocks:(data,waiting,reminders)=>todayHiddenBlocks(data,current(),waiting,reminders)};
}
