export function helpContext(view, tab, personalWorkspace) {
  if (view === 'personal' || personalWorkspace) {
    const topics = {
      inbox: ['Разберите входящие', 'Записывайте мысль или ссылку без дополнительных полей. Позже оставьте её в заметках, свяжите с материалами или нажмите «Сделать делом». Исходная запись сохранится.'],
      notes: ['Сохраните контекст', 'Заметка хранит текст, списки и файлы. Через «Связать» её можно прикрепить к личному делу. Команда не видит личные заметки; публикация создаёт отдельную копию после вашего подтверждения.'],
      plans: ['От записи к делу', 'Создайте дело, выберите дату, если она известна, и добавьте материалы через связи. Дата работы и крайний срок — разные поля. Для повторения откройте дополнительные параметры.'],
      habits: ['Отмечайте свой ритм', 'Выберите привычку, откройте нужный день и сохраните факт. В настройках есть выполнение, отказ от действия и ограничение количества. Пропуск, пауза и срыв учитываются по-разному.'],
      life: ['Выберите свой горизонт', 'Карта показывает недели или месяцы относительно указанной даты рождения. Это личный инструмент планирования. Дата рождения не нужна для заметок, дел и работы в команде.'],
    };
    const [title,text]=topics[tab]||['Начните с одной записи','Нажмите «Записать», сохраните мысль и откройте «Входящие». Там её можно превратить в связанное дело. Личное пространство доступно без команды; позже можно добавить отдельный проект для совместной работы.'];
    return {kind:'personal',title,text};
  }
  const topics={
    work:['Работайте с очередью','Выберите доску и нужное состояние. Карточка хранит следующий шаг, материалы и результат. Через «Настройки → Текущая страница» можно изменить поля и этапы текущей доски, а через меню карточки — связи и родителя.'],
    chat:['Сохраняйте контекст разговора','В диалоге можно прикрепить материал или карточку. Выбранная команда определяет доступ к общим диалогам; личные данные автоматически сюда не попадают.'],
    graph:['Различайте связи и вложенность','Родитель задаёт место карточки в иерархии. Связь описывает отношение между двумя материалами. Смена родителя не создаёт новую карточку и не стирает её историю.'],
  };
  const [title,text]=topics[view]||['Начните с рабочего процесса','Создайте доску для задачи, исследования или своего процесса. Участники и права относятся к выбранной команде. Личные заметки доступны только их владельцу.'];
  return {kind:'team',title,text};
}

export function createFirstUseUI({state,api,escapeHTML:esc,icon,activeWorkspace,canConfigureWorkspace,openModal,closeDialog,actions,toast}) {
  const q=(s,root=document)=>root.querySelector(s);
  const request=(owner,body)=>api('/api/me/journey',{...(body?{method:'PATCH',body:JSON.stringify(body)}:{}),headers:{'X-Outbox-Owner':String(owner)}});
  async function open(){
    const owner=state.me?.id;if(!owner)return;
    const context=helpContext(state.view,state.personalTab,activeWorkspace()?.kind==='personal');
    const dialog=q('#onboarding-dialog'),root=q('#onboarding-dialog-content');
    root.className='context-help';
    const buttons=context.kind==='personal'?[['capture','Записать'],['inbox','Открыть входящие'],['teams','Команды и проекты']]:(canConfigureWorkspace()?[['board','Создать доску'],['page','Создать страницу']]:[]);
    root.innerHTML=`<header><div><span class="record-kind">${context.kind==='personal'?'Только для вас':'Выбранная команда'}</span><h2>${esc(context.title)}</h2></div><button type="button" class="icon-button" data-help-close aria-label="Закрыть">${icon('x')}</button></header><p>${esc(context.text)}</p><div class="context-help-actions">${buttons.map(([key,label])=>`<button type="button" class="secondary" data-help-action="${key}">${esc(label)}</button>`).join('')}</div><details><summary>Как настроить пространство и найти материалы</summary><p>Поиск в верхней панели открывает найденную запись. Под заголовком результата указан источник. Личный поиск не раскрывает ваши материалы другим участникам.</p><p>${context.kind==='personal'?'Проекты, цели, привычки и карта времени — отдельные инструменты. Их можно открыть по мере необходимости во вкладках личного пространства.':'В «Настройки → Интерфейс» меняются ваши меню и оформление. В «Настройки → Пространство» находятся общие разделы и страницы. Новая страница задаёт источник и представление; поля и этапы текущей доски доступны в «Настройки → Текущая страница». В меню карточки можно сменить родителя, сохранив её содержимое и историю.'}</p></details><label class="check context-help-setting"><input type="checkbox" data-help-enabled disabled><span>Показывать подсказки при первом действии</span></label><p class="muted" data-help-setting-status>Загружаем настройку аккаунта…</p>`;
    const alive=()=>owner===state.me?.id&&root.isConnected&&dialog.open&&q('[data-help-enabled]',root)===toggle;
    const toggle=q('[data-help-enabled]',root),status=q('[data-help-setting-status]',root);
    q('[data-help-close]',root).onclick=()=>closeDialog(dialog);
    root.querySelectorAll('[data-help-action]').forEach(button=>button.onclick=async()=>{if(owner===state.me?.id&&await closeDialog(dialog))actions[button.dataset.helpAction]?.();});
    async function load(){try{const prefs=await request(owner);if(!alive())return;toggle.checked=prefs.tipsEnabled;toggle.disabled=false;status.textContent='Настройка действует на всех ваших устройствах.';}catch(error){if(alive()){status.textContent=error.message;const retry=document.createElement('button');retry.type='button';retry.className='text-button';retry.textContent='Повторить';retry.onclick=load;status.append(retry);}}}
    toggle.onchange=async()=>{const desired=toggle.checked;toggle.disabled=true;try{const prefs=await request(owner,{tipsEnabled:desired});if(alive()){toggle.checked=prefs.tipsEnabled;status.textContent='Настройка сохранена для аккаунта.';}}catch(error){if(alive()){toggle.checked=!desired;status.textContent=error.message;}}finally{if(alive())toggle.disabled=false;}};
    openModal(dialog);void load();
  }
  const tips={
    constructor:'Начните с названия и источника. Поля и представление можно изменить позже; настройки новой страницы не переписывают карточки.',
    relationships:'Связь сохраняет оба материала отдельно. Выберите существующий материал и укажите, как он относится к исходному.',
    publication:'В проект попадёт отдельная копия выбранного содержания. Проверьте проект, доступ участников и файлы перед подтверждением.',
  };
  async function tip(id,root){
    const owner=state.me?.id;if(!owner||!root||!tips[id])return;
    try{
      const prefs=await request(owner);
      if(owner!==state.me?.id||!root.isConnected||!prefs.tipsEnabled||prefs.dismissed.includes(id)||root.querySelector('[data-context-tip]'))return;
      const box=document.createElement('aside');box.className='context-tip';box.dataset.contextTip=id;
      box.innerHTML=`<p>${esc(tips[id])}</p><button type="button" class="text-button">Понятно</button>`;
      root.prepend(box);box.querySelector('button').onclick=async event=>{event.currentTarget.disabled=true;try{await request(owner,{dismiss:id});box.remove();}catch(error){if(owner===state.me?.id&&box.isConnected){event.target.disabled=false;toast(error.message,true);}}};
    }catch(_){/* Help never blocks the action or replaces a user's draft. */}
  }
  return {open,tip};
}
