import { mountPhonePushSettings } from './phone-notifications.js?v=20260915-team-accounting-1';

export function createReminderSettingsUI({state,api,escapeHTML:esc,icon,openModal,closeDialog,bindDraft,clearDraft,flushDrafts,toast}) {
  const q=(selector,root=document)=>root.querySelector(selector);
  let generation=0;
  async function open() {
    const dialog=q('#workspace-dialog'),content=q('#workspace-dialog-content'),owner=state.me?.id;
    if(!owner||dialog.open)return;
    const request=++generation;
    const read=(path,options={})=>api(path,{...options,headers:{'X-Outbox-Owner':String(owner)}});
    content.innerHTML=`<div class="workspace-editor-shell today-settings-dialog"><header><h2>Уведомления и напоминания</h2><button type="button" class="icon-button" data-reminder-close aria-label="Закрыть">${icon('x')}</button></header><p role="status">Загружаем ваши настройки…</p></div>`;
    q('[data-reminder-close]',content).onclick=()=>closeDialog(dialog);openModal(dialog);
    const alive=()=>owner===state.me?.id&&generation===request&&dialog.open;
    try {
      const prefs=await read('/api/me/reminders');if(!alive())return;
      const zones=[...new Set([prefs.timezone,'UTC',...(Intl.supportedValuesOf?Intl.supportedValuesOf('timeZone'):['Europe/Moscow'])])];
      content.innerHTML=`<div class="workspace-editor-shell today-settings-dialog"><header><h2>Уведомления и напоминания</h2><button type="button" class="icon-button" data-reminder-close aria-label="Закрыть">${icon('x')}</button></header><form><input type="hidden" name="version" value="${esc(prefs.updatedAt)}"><label class="check"><input type="checkbox" name="deadlineEnabled" ${prefs.deadlineEnabled?'checked':''}><span>Получать напоминания о сроках карточек</span></label><label class="check"><input type="checkbox" name="personalEnabled" ${prefs.personalEnabled?'checked':''}><span>Получать напоминания личных дел</span></label><label class="check"><input type="checkbox" name="habitsEnabled" ${prefs.habitsEnabled?'checked':''}><span>Получать напоминания привычек</span></label><p class="muted">Напоминания сохраняются во входящих Tessavie и приходят на подключённые вами устройства. Выключение останавливает новые напоминания; история остаётся.</p><label>Часовой пояс доставки<select name="timezone">${zones.map(zone=>`<option ${zone===prefs.timezone?'selected':''}>${esc(zone)}</option>`).join('')}</select></label><div class="form-grid two"><label>Тихие часы с<input type="time" name="quietStart" value="${esc(prefs.quietStart)}"></label><label>Тихие часы до<input type="time" name="quietEnd" value="${esc(prefs.quietEnd)}"></label></div><button type="button" class="text-button" data-clear-quiet>Без тихих часов</button><p class="muted">Можно задать период через полночь. После него придут только ещё актуальные напоминания. Два пустых поля означают отсутствие тихих часов.</p><details><summary>Сводки</summary><p class="muted">Одна запись с итоговыми числами без названий личных дел и карточек.</p><label class="check"><input type="checkbox" name="dailyDigestEnabled" ${prefs.dailyDigestEnabled?'checked':''}><span>Ежедневная сводка</span></label><label>Время ежедневной сводки<input type="time" name="dailyDigestTime" value="${esc(prefs.dailyDigestTime||'08:00')}" required></label><label class="check"><input type="checkbox" name="weeklyDigestEnabled" ${prefs.weeklyDigestEnabled?'checked':''}><span>Недельная сводка</span></label><div class="form-grid two"><label>День недели<select name="weeklyDigestWeekday">${[['1','Понедельник'],['2','Вторник'],['3','Среда'],['4','Четверг'],['5','Пятница'],['6','Суббота'],['7','Воскресенье']].map(([value,label])=>`<option value="${value}" ${Number(value)===Number(prefs.weeklyDigestWeekday||7)?'selected':''}>${label}</option>`).join('')}</select></label><label>Время недельной сводки<input type="time" name="weeklyDigestTime" value="${esc(prefs.weeklyDigestTime||'18:00')}" required></label></div></details><details><summary>Проекты · ${prefs.projects.length}</summary><label>Найти проект<input type="search" name="projectQuery" autocomplete="off"></label><div class="reminder-project-list">${prefs.projects.map(project=>`<label class="check" data-reminder-project="${esc(project.workspaceId)}"><input type="checkbox" name="project:${esc(project.workspaceId)}" ${project.enabled?'checked':''}><span>${esc(project.name)}</span></label>`).join('')||'<p class="muted">У вас пока нет командных проектов.</p>'}</div></details><p class="muted">Настройки личные и действуют на всех ваших устройствах. Тихие часы общие для сроков, дел, привычек и сводок. Выключенные проекты не попадают в сводки.</p><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Сохранить</button></div></form></div>`;
      const deviceSettings=document.createElement('section');deviceSettings.className='phone-push-settings';deviceSettings.setAttribute('aria-labelledby','phone-push-title');q('form',content).before(deviceSettings);
      mountPhonePushSettings({container:deviceSettings,state,read,escapeHTML:esc,alive});
      const form=q('form',content),error=q('.form-error',form),button=q('[type=submit]',form);let busy=false;
      const current=()=>alive()&&form.isConnected;
      bindDraft(form,`personal:${owner}:reminder-settings`);
      q('[data-reminder-close]',content).onclick=()=>closeDialog(dialog);
      q('[data-clear-quiet]',form).onclick=()=>{form.elements.quietStart.value='';form.elements.quietEnd.value='';form.dispatchEvent(new Event('input',{bubbles:true}));};
      form.elements.projectQuery.oninput=()=>{const query=form.elements.projectQuery.value.trim().toLocaleLowerCase();form.querySelectorAll('[data-reminder-project]').forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase().includes(query));};
      form.onsubmit=async event=>{
        event.preventDefault();if(busy||!current())return;busy=true;button.disabled=true;form.inert=true;error.hidden=true;
        try {
          if(!flushDrafts(dialog))throw new Error('Не удалось сохранить черновик. Поля остаются в форме.');
          const projects=[...form.querySelectorAll('[data-reminder-project]')].map(row=>({workspaceId:row.dataset.reminderProject,enabled:q('input',row).checked}));
          await read('/api/me/reminders',{method:'PUT',body:JSON.stringify({deadlineEnabled:form.elements.deadlineEnabled.checked,personalEnabled:form.elements.personalEnabled.checked,habitsEnabled:form.elements.habitsEnabled.checked,dailyDigestEnabled:form.elements.dailyDigestEnabled.checked,dailyDigestTime:form.elements.dailyDigestTime.value,weeklyDigestEnabled:form.elements.weeklyDigestEnabled.checked,weeklyDigestWeekday:Number(form.elements.weeklyDigestWeekday.value),weeklyDigestTime:form.elements.weeklyDigestTime.value,timezone:form.elements.timezone.value,quietStart:form.elements.quietStart.value,quietEnd:form.elements.quietEnd.value,projects,expectedUpdatedAt:form.elements.version.value})});
          if(!current())return;clearDraft(form);await closeDialog(dialog);toast('Настройки напоминаний сохранены');
        } catch(failure) {
          if(!current())return;error.textContent=failure.message;error.hidden=false;
          if([403,409].includes(failure.status)){
            const review=document.createElement('button');review.type='button';review.className='text-button';review.textContent='Показать текущие настройки';error.append(review);
            review.onclick=async()=>{
              review.disabled=true;
              try {
                const latest=await read('/api/me/reminders');if(!current())return;
                const disabled=latest.projects.filter(project=>!project.enabled).map(project=>project.name);
                error.textContent=`Сейчас сохранено: сроки карточек ${latest.deadlineEnabled?'включены':'выключены'}, личные дела ${latest.personalEnabled?'включены':'выключены'}, привычки ${latest.habitsEnabled?'включены':'выключены'}, ежедневная сводка ${latest.dailyDigestEnabled?latest.dailyDigestTime:'выключена'}, недельная ${latest.weeklyDigestEnabled?`${latest.weeklyDigestWeekday} день · ${latest.weeklyDigestTime}`:'выключена'}; ${latest.timezone}; ${latest.quietStart?`${latest.quietStart}–${latest.quietEnd}`:'без тихих часов'}. Выключенные проекты: ${disabled.join(', ')||'нет'}. Ваши поля сохранены в форме.`;
                const apply=document.createElement('button');apply.type='button';apply.className='text-button';apply.textContent=failure.status===403?'Сохранить для доступных проектов':'Применить мой выбор к этой версии';error.append(apply);
                apply.onclick=()=>{const allowed=new Set(latest.projects.map(project=>project.workspaceId));form.querySelectorAll('[data-reminder-project]').forEach(row=>{if(!allowed.has(row.dataset.reminderProject))row.remove();});form.elements.version.value=latest.updatedAt;form.requestSubmit();};
              }catch(problem){if(current()){review.disabled=false;toast(problem.message,true);}}
            };
          }
        } finally {busy=false;form.inert=false;if(form.isConnected)button.disabled=false;}
      };
    }catch(error){if(alive()){const status=q('[role=status]',content);if(status)status.textContent=error.message;toast(error.message,true);}}
  }
  return {open};
}
