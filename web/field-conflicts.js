function comparable(field, value) {
  if (field.fieldType === 'checkbox') return !!value;
  if (field.fieldType === 'multi_select') return [...new Set(value || [])].sort();
  if (value === undefined || value === null || value === '') return null;
  if (field.fieldType === 'datetime') { const time = Date.parse(value); return Number.isFinite(time) ? time : value; }
  return value;
}
export function planFieldMerge(fields, baseline, mine, current) {
  const same = (field, a, b) => JSON.stringify(comparable(field, a)) === JSON.stringify(comparable(field, b));
  return fields.map(field => {
    const changed = !baseline || !same(field, baseline[field.id], mine[field.id]);
    const remoteChanged = !baseline || !same(field, baseline[field.id], current[field.id]);
    const conflict = changed && remoteChanged && !same(field, mine[field.id], current[field.id]);
    return { field, changed, conflict, mine: mine[field.id], current: current[field.id], value: changed && !conflict ? mine[field.id] : current[field.id] };
  });
}
export async function reviewFieldConflict({form, fields, collectionId, recordId, workspace, state, api, readValues, fieldInput, display, escapeHTML: e, enhance, bindMulti, toast}) {
  const alive = () => form.isConnected && state.activeWorkspaceId === workspace;
  const request = path => api(path, {headers:{'X-Workspace-ID':workspace}});
  const latest = (await request(`/api/records/${recordId}`)).record;
  if (!alive()) return;
  const mine = readValues(form, fields), snapshot = JSON.stringify(mine);
  let baseline = null;
  try { baseline = JSON.parse(form.elements.fieldEditBaseline.value || 'null'); } catch {}
  const plan = planFieldMerge(fields, baseline, mine, latest.customFields || {});
  form.querySelector('[data-field-conflict]')?.remove();
  const panel = document.createElement('section');
  panel.className = 'field-conflict-review';
  panel.dataset.fieldConflict = '';
  panel.setAttribute('aria-label', 'Сравнение изменений полей');
  const shown = plan.filter(row => row.changed);
  panel.innerHTML = `<h3>Карточка изменилась</h3><p>Ваш ввод остаётся в форме. Чужие изменения в нетронутых полях останутся. Для спорных полей выберите, какое значение использовать.</p>${!baseline?'<p>У старого черновика нет исходной версии: каждое отличие требует вашего выбора.</p>':''}${shown.map(row=>`<article><strong>${e(row.field.name)}</strong><p>Сейчас: ${e(display(row.field,row.current)||'Не указано')}</p><p>Ваше: ${e(display(row.field,row.mine)||'Не указано')}</p>${row.conflict?`<label class="checkbox-field"><input type="checkbox" data-field-choice="${row.field.id}"> Использовать моё значение</label>`:'<small>Ваше изменение можно перенести без конфликта.</small>'}</article>`).join('')||'<p>Отличий от исходных значений нет.</p>'}<button type="button" class="secondary" data-field-merge>Перенести выбранное в форму</button><p class="muted">После сравнения проверьте форму и сохраните её обычной кнопкой.</p>`;
  form.prepend(panel);
  panel.scrollIntoView({block:'nearest'});
  panel.querySelector('[data-field-merge]').onclick = async () => {
    if (!alive()) return;
    if (JSON.stringify(readValues(form, fields)) !== snapshot) {
      toast('Ввод изменился. Сравнение обновляется');
      try { await reviewFieldConflict({form,fields,collectionId,recordId,workspace,state,api,readValues,fieldInput,display,escapeHTML:e,enhance,bindMulti,toast}); } catch(error) { toast(error.message,true); }
      return;
    }
    const chosen = {};
    for (const row of plan) chosen[row.field.id] = row.conflict && panel.querySelector(`[data-field-choice="${row.field.id}"]`)?.checked ? row.mine : row.value;
    const fieldGrid = form.querySelector('.collection-custom-fields .form-grid');
    if (!fieldGrid) return;
    fieldGrid.innerHTML = fields.map(field=>fieldInput(field,chosen[field.id])).join('');
    form.elements.expectedUpdatedAt.value = latest.updatedAt;
    form.elements.fieldEditBaseline.value = JSON.stringify(latest.customFields || {});
    bindMulti(form); enhance(form);
    panel.remove();
    form.dispatchEvent(new Event('input',{bubbles:true}));
    toast('Сравнение перенесено в форму. Проверьте поля и сохраните');
  };
}
