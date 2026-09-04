export function createWorkSelection() {
  let key = '', enabled = false;
  const items = new Map();
  return {
    items,
    scope(next) { if (key !== next) { key = next; enabled = false; items.clear(); } },
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; items.clear(); },
    set(record, selected) {
      if (!selected) { items.delete(record.id); return true; }
      if (!items.has(record.id) && items.size >= 100) return false;
      if (!items.has(record.id)) items.set(record.id, { id: record.id, expectedUpdatedAt: record.updatedAt });
      return true;
    },
  };
}

export function createBulkWorkUI({ state, api, escapeHTML: esc, icon, renderWorkList, renderCollections, currentWorkWindow, savedPageLayout, captureProjectContext, isProjectContextCurrent, syncProjectChanges, openModal, closeDialog, enhanceSelects, toast, priorityLabels, workstreamLabels, statusLabels }) {
  const selection = createWorkSelection();
  let lastDraft = null;
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const visible = node => !!node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden';
  const rerender = () => { if (state.view === 'work') renderWorkList(); else if (state.view === 'collections') renderCollections(); };
  const labels = { ownerId: 'Ответственный', status: 'Состояние', priority: 'Приоритет', workstream: 'Направление', stageId: 'Этап доски' };
  const valueLabel = (key, value) => key === 'ownerId' ? state.users.find(user => user.id === value)?.displayName || state.users.find(user => user.id === value)?.username || 'Участник проекта' : key === 'status' ? statusLabels[value] || value : key === 'priority' ? priorityLabels[value] || value : key === 'workstream' ? workstreamLabels[value] || value : state.collections.flatMap(item => item.stages).find(stage => stage.id === value)?.name || 'Без этапа';
  function rowChanges(row) {
    if (!row.before || !row.after) return '';
    return Object.keys(labels).filter(key => row.before[key] !== row.after[key]).map(key => `${labels[key]}: ${valueLabel(key,row.before[key])} → ${valueLabel(key,row.after[key])}`).join(' · ');
  }
  function resultRows(receipt) {
    const states = { ready: 'Будет изменено', rejected: 'Пропущено', unchanged: 'Уже установлено', applied: 'Изменено', undone: 'Отменено', undo_rejected: 'Не отменено' };
    return `<ol class="bulk-result-list">${receipt.items.map(row => `<li><strong>${esc(row.title || 'Недоступная карточка')}</strong><span>${esc(rowChanges(row))}</span><small class="${row.error ? 'bulk-error' : 'muted'}">${esc(states[row.state] || row.state)}${row.error ? `: ${esc(row.error)}` : ''}</small></li>`).join('')}</ol>`;
  }
  function mount() {
    const root = q('#main-content');
    if (!['work','collections'].includes(state.view)) { selection.scope(''); return; }
    const scope = JSON.stringify([currentWorkWindow().key, savedPageLayout().hiddenFields || [], state.projectContextEpoch]);
    selection.scope(scope);
    if (state.view === 'work' && state.workViewMode === 'calendar') return;
    const bar = document.createElement('section'); bar.className = 'bulk-work-toolbar'; bar.setAttribute('aria-label','Массовые действия');
    bar.innerHTML = selection.enabled
      ? `<strong data-bulk-count role="status"></strong><button type="button" class="text-button" data-bulk-shown>Выбрать показанные</button><button type="button" class="secondary" data-bulk-edit>Изменить выбранные</button><button type="button" class="text-button" data-bulk-toggle>Снять выбор</button>`
      : `<button type="button" class="text-button" data-bulk-toggle>${icon('checkSquare')} Выбрать карточки</button><button type="button" class="text-button" data-bulk-last>${icon('history')} Последняя операция</button>`;
    q(state.view === 'work' ? '.work-board-toolbar' : '.collection-filters',root).append(bar);
    q('[data-bulk-toggle]',bar).onclick = () => { selection.toggle(); rerender(); };
    if (!selection.enabled) { q('[data-bulk-last]',bar).onclick = openLast; return; }
    const boxes = [];
    const update = () => {
      q('[data-bulk-count]',bar).textContent = `Выбрано ${selection.items.size} из 100`;
      q('[data-bulk-edit]',bar).disabled = !selection.items.size;
      for (const box of boxes) { box.checked = selection.items.has(box.dataset.bulkSelect); box.closest('.bulk-selectable').classList.toggle('bulk-selected',box.checked); }
    };
    // Only rendered records receive a checkbox; hidden columns are excluded
    // again at selection time after the page layout observer has run.
    qa('.work-row, [data-kanban-record], [data-collection-card]',root).forEach(node => {
      const id = node.dataset.openRecord || node.dataset.kanbanRecord || node.dataset.collectionCard;
      const record = state.records.find(item => item.id === id); if (!record) return;
      let shell = node;
      if (node.matches('.work-row')) { shell = document.createElement('div'); shell.className = 'bulk-work-row'; node.before(shell); shell.append(node); }
      shell.classList.add('bulk-selectable'); shell.draggable = false;
      const label = document.createElement('label'); label.className = 'bulk-record-check';
      label.innerHTML = `<input type="checkbox" data-bulk-select="${esc(id)}" aria-label="Выбрать: ${esc(record.title)}"><span>Выбрать</span>`;
      shell.prepend(label);
      const box = q('input',label); boxes.push(box);
      label.addEventListener('click',event => event.stopPropagation());
      box.addEventListener('change',() => { if (!selection.set(record,box.checked)) toast('За один раз можно выбрать до 100 карточек',true); update(); });
    });
    const pruneHidden = () => { for (const box of boxes) if (!visible(box)) selection.items.delete(box.dataset.bulkSelect); update(); };
    q('[data-bulk-shown]',bar).onclick = () => {
      pruneHidden();
      for (const box of boxes.filter(visible)) {
        const record = state.records.find(item => item.id === box.dataset.bulkSelect);
        if (!selection.set(record,true)) { toast('Выбрано первые 100 показанных карточек'); break; }
      }
      update();
    };
    q('[data-bulk-edit]',bar).onclick = () => { pruneHidden(); if (selection.items.size) openEditor(); };
    update();
  }
  function modal(title) {
    const dialog = q('#workspace-dialog'), content = q('#workspace-dialog-content');
    content.innerHTML = `<div class="workspace-editor-shell bulk-editor"><header><h2>${esc(title)}</h2><button type="button" class="icon-button" data-bulk-close aria-label="Закрыть">${icon('x')}</button></header><div data-bulk-body></div></div>`;
    q('[data-bulk-close]',content).onclick = () => closeDialog(dialog);
    openModal(dialog);
    return { dialog, content, body: q('[data-bulk-body]',content) };
  }
  async function openLast() {
    const context = captureProjectContext();
    try {
      const receipt = await api('/api/record-batches/latest',{headers:{'X-Workspace-ID':context.workspace}});
      if (!isProjectContextCurrent(context)) return;
      if (!receipt) return toast('Массовых операций в этом проекте пока нет');
      showReceipt(receipt,context);
    } catch (error) { if(isProjectContextCurrent(context)) toast(error.message,true); }
  }
  function showReceipt(receipt, context, surface = modal('Результат массового действия')) {
    const {body,content,dialog} = surface;
    const applied = receipt.items.filter(row => row.state === 'applied').length;
    const changed = receipt.items.filter(row => ['applied','undone'].includes(row.state)).length;
    const failed = receipt.items.filter(row => ['rejected','undo_rejected'].includes(row.state)).length;
    body.innerHTML = `<p role="status">${receipt.undone ? 'Отменено' : 'Изменено'}: ${changed}. Пропущено: ${failed}.</p>${resultRows(receipt)}<p class="muted">${receipt.undone ? 'Отмена записана в историю. Карточки с последующими правками сохранены.' : 'Отмена вернёт прежние значения, если карточки с тех пор не менялись.'}</p><p data-bulk-error class="bulk-error" role="alert"></p><div class="form-actions">${applied && !receipt.undone ? `<button type="button" class="secondary" data-bulk-undo>${icon('undo')} Отменить изменения (${applied})</button>` : ''}<button type="button" class="secondary" data-bulk-done>Готово</button></div>`;
    q('[data-bulk-done]',body).onclick=()=>closeDialog(dialog);
    q('[data-bulk-undo]',body)?.addEventListener('click',async event=>{
      if (!isProjectContextCurrent(context)) return;
      const button=event.currentTarget; button.disabled=true;
      try {
        const result=await api(`/api/record-batches/${receipt.id}/undo`,{method:'POST',headers:{'X-Workspace-ID':context.workspace,'X-Outbox-Owner':String(context.user)},body:'{}'});
        if (!isProjectContextCurrent(context)) return;
        for(const row of result.items) state.detailCache.delete(row.id);
        showReceipt(result,context,surface);
        await syncProjectChanges(); if(isProjectContextCurrent(context)) rerender();
      } catch(error) { if (isProjectContextCurrent(context) && content.isConnected) { q('[data-bulk-error]',body).textContent=error.message; button.disabled=false; } }
    });
  }
  function openEditor() {
    const context = captureProjectContext(), items = [...selection.items.values()].map(item=>({...item}));
    const surface = modal('Изменить выбранные карточки'), {body,dialog,content}=surface;
    const options = entries => '<option value="">Не менять</option>'+entries.map(([value,label])=>`<option value="${esc(String(value))}">${esc(label)}</option>`).join('');
    body.innerHTML=`<p>Выбрано карточек: ${items.length}</p><form data-bulk-form><div class="form-grid two"><label>Ответственный<select name="ownerId">${options(state.users.map(user=>[user.id,user.displayName||user.username]))}</select></label><label>Приоритет<select name="priority">${options(Object.entries(priorityLabels))}</select></label><label>Направление<select name="workstream">${options(Object.entries(workstreamLabels))}</select></label><label>Состояние<select name="status">${options(['inbox','draft','planned','in_progress','blocked','postponed','cancelled','main','rejected','review'].map(key=>[key,statusLabels[key]]))}</select></label></div><p class="muted">Завершение и переходы с подтверждением оформляются в самой карточке. Совместимость выбранных состояний проверим перед применением.</p><label>Причина изменения<textarea name="reason" rows="2" maxlength="2000" required placeholder="Например: распределили работу на неделю"></textarea></label><p data-bulk-error class="bulk-error" role="alert"></p><button class="primary" type="submit">Предпросмотр изменений</button></form><div data-bulk-preview></div>`;
    const form=q('form',body), fields=['ownerId','priority','workstream','status','reason'];
    const draftKey=JSON.stringify([context.user,context.workspace]);
    if(lastDraft?.key===draftKey) for(const key of fields) form.elements[key].value=lastDraft.values[key]||'';
    let payload=null, preview=null, busy=false;
    const remember=()=>{ lastDraft={key:draftKey,values:Object.fromEntries(fields.map(key=>[key,form.elements[key].value]))}; };
    const invalidate=()=>{remember(); payload=null; preview=null; q('[data-bulk-preview]',body).innerHTML='';};
    form.addEventListener('input',invalidate); form.addEventListener('change',invalidate);
    enhanceSelects(form);
    form.addEventListener('submit',async event=>{
      event.preventDefault(); if(busy || !isProjectContextCurrent(context))return;
      remember();
      const patch={}; for(const key of fields.filter(key=>key!=='reason')) if(form.elements[key].value) patch[key]=key==='ownerId'?Number(form.elements[key].value):form.elements[key].value;
      if(!Object.keys(patch).length) { q('[data-bulk-error]',body).textContent='Выберите хотя бы одно изменение'; return; }
      busy=true; const submit=q('[type="submit"]',form); submit.disabled=true;
      const draft=JSON.stringify(lastDraft);
      try {
        const candidate={id:crypto.randomUUID(),items,patch,reason:form.elements.reason.value};
        const result=await api('/api/record-batches/preview',{method:'POST',headers:{'X-Workspace-ID':context.workspace,'X-Outbox-Owner':String(context.user)},body:JSON.stringify(candidate)});
        if(!isProjectContextCurrent(context) || !dialog.open || !form.isConnected || draft!==JSON.stringify(lastDraft))return;
        preview=result;
        const ready=new Set(result.items.filter(row=>row.state==='ready').map(row=>row.id));
        payload={...candidate,items:items.filter(item=>ready.has(item.id))};
        q('[data-bulk-error]',body).textContent='';
        q('[data-bulk-preview]',body).innerHTML=`<h3>Предпросмотр</h3>${resultRows(result)}<p class="muted">Будет изменено: ${ready.size}. Права и версии проверим повторно.</p><button type="button" class="primary" data-bulk-apply ${ready.size?'':'disabled'}>Применить к ${ready.size} карточкам</button>`;
        q('[data-bulk-apply]',body).onclick=apply;
      }catch(error){ if(form.isConnected && isProjectContextCurrent(context))q('[data-bulk-error]',body).textContent=error.message; }
      finally{busy=false;submit.disabled=false;}
    });
    async function apply(){
      if(busy || !payload || !isProjectContextCurrent(context))return;
      busy=true; const button=q('[data-bulk-apply]',body); button.disabled=true;
      // Freeze this exact payload across retry after an uncertain network result.
      const controls=qa('input,select,textarea,button',form); controls.forEach(node=>node.disabled=true);
      try {
        const result=await api('/api/record-batches/apply',{method:'POST',headers:{'X-Workspace-ID':context.workspace,'X-Outbox-Owner':String(context.user)},body:JSON.stringify(payload)});
        if(!isProjectContextCurrent(context))return;
        // Keep preview rejections visible although they were never submitted.
        const submitted=new Set(payload.items.map(item=>item.id));
        const display={...result,items:[...result.items,...preview.items.filter(item=>!submitted.has(item.id))]};
        selection.items.clear(); lastDraft=null;
        for(const row of result.items)state.detailCache.delete(row.id);
        if(dialog.open && form.isConnected)showReceipt(display,context,surface);
        await syncProjectChanges(); if(isProjectContextCurrent(context))rerender();
      }catch(error){
        if(form.isConnected && isProjectContextCurrent(context)){
          q('[data-bulk-error]',body).textContent=`${error.message.replace(/[.\s]+$/,'')}. Повторите отправку или откройте «Последняя операция» после восстановления связи.`;
          button.textContent='Повторить отправку';button.disabled=false;
        }
      }finally{busy=false;}
    }
  }
  return { mount };
}
