export function createHabitReminderUI({state,api,escapeHTML:esc,icon,openModal,closeDialog,bindDraft,clearDraft,flushDrafts,loadPersonal,toast}){
  const q=(selector,root=document)=>root.querySelector(selector);let generation=0;
  async function open(id){
    const owner=state.me?.id;if(!owner)return;
    const dialog=q('#personal-dialog'),content=q('#personal-dialog-content');if(dialog.open&&!flushDrafts(dialog))return;
    const request=++generation,read=(options={})=>api(`/api/personal/habits/${id}/reminder`,{...options,headers:{'X-Outbox-Owner':String(owner)}});
    let surface=null;
    const alive=()=>owner===state.me?.id&&request===generation&&dialog.open&&content.firstElementChild===surface;
    content.innerHTML=`<div class="today-settings-dialog personal-reminder-dialog"><header><h2>Напоминание привычки</h2><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><p role="status">Загружаем настройку…</p></div>`;
    surface=content.firstElementChild;
    q('[data-close]',content).onclick=()=>closeDialog(dialog);openModal(dialog);
    try{
      const pref=await read();if(!alive())return;
      content.innerHTML=`<div class="today-settings-dialog personal-reminder-dialog"><header><h2>Напоминание привычки</h2><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><p class="reminder-plan-title">${esc(pref.title)}</p><form><input type="hidden" name="revision" value="${pref.revision}"><input type="hidden" name="habitRevision" value="${pref.habitRevision}"><label>Напоминать в<input type="time" name="time" value="${esc(pref.time)}"></label><p class="muted">${esc(pref.timezone)} · только в плановые дни, пока результат не отмечен. Тихие часы учитываются из настроек уведомлений.</p><button type="button" class="text-button" data-clear>Без напоминаний</button><p class="muted">Сохранённое пустое время выключает сигналы. Новый выбор действует сразу и не меняет цель или статистику. Напоминание придёт во входящие сайта при закрытой вкладке. Push на устройство не отправляется.</p><p class="muted">Достигнутая цель недели или месяца приостанавливает сигналы до следующего периода. «Позже сегодня» в трекере откладывает сигнал на час.</p><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Сохранить напоминание</button></div></form></div>`;
      surface=content.firstElementChild;
      const form=q('form',content),error=q('[role=alert]',form);let busy=false;
      const current=()=>alive()&&form.isConnected;bindDraft(form,`personal:${owner}:habit-reminder:${id}`);
      q('[data-close]',content).onclick=()=>closeDialog(dialog);
      q('[data-clear]',form).onclick=()=>{form.elements.time.value='';form.dispatchEvent(new Event('input',{bubbles:true}));};
      form.onsubmit=async event=>{
        event.preventDefault();if(!current()||busy)return;busy=true;form.inert=true;error.hidden=true;
        try{
          if(!flushDrafts(dialog))throw new Error('Не удалось сохранить черновик. Поля остаются в форме.');
          await read({method:'PUT',body:JSON.stringify({time:form.elements.time.value,expectedRevision:Number(form.elements.revision.value),expectedHabitRevision:Number(form.elements.habitRevision.value)})});
          if(!current())return;clearDraft(form);await closeDialog(dialog);await loadPersonal({force:true});if(owner===state.me?.id)toast('Напоминание привычки сохранено');
        }catch(failure){
          if(!current())return;error.textContent=failure.message;error.hidden=false;
          if(failure.status===409){
            const review=document.createElement('button');review.type='button';review.className='text-button';review.textContent='Показать текущую настройку';error.append(review);
            review.onclick=async()=>{review.disabled=true;try{
              const latest=await read();if(!current())return;
              error.textContent=`Сейчас: ${latest.title}, ${latest.time?`${latest.time} · ${latest.timezone}`:'без напоминаний'}. Ваше время сохранено в форме.`;
              const apply=document.createElement('button');apply.type='button';apply.className='text-button';apply.textContent='Применить к текущей версии';error.append(apply);
              apply.onclick=()=>{form.elements.revision.value=latest.revision;form.elements.habitRevision.value=latest.habitRevision;form.requestSubmit();};
            }catch(problem){if(current()){toast(problem.message,true);review.disabled=false;}}};
          }
        }finally{busy=false;form.inert=false;}
      };
    }catch(error){if(alive()){const status=q('[role=status]',content);if(status)status.textContent=error.message;toast(error.message,true);}}
  }
  return {open};
}
