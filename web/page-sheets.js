const sheetScale = 1000000n;
const sheetLimit = 1000000000000n * sheetScale;
export const sheetOperations = { add: 'Прибавить', subtract: 'Вычесть', multiply: 'Умножить на', divide: 'Разделить на', min: 'Не больше', max: 'Не меньше' };
export const sheetKinds = { input: 'Ввод числа', constant: 'Постоянное число', formula: 'Формула' };

export function parseSheetNumber(raw) {
  const text = String(raw ?? '').trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  if (!/^[+-]?\d+(?:\.\d{1,6})?$/.test(text)) throw new Error('Введите число: до 6 знаков после запятой.');
  const negative = text.startsWith('-'), [whole, fraction = ''] = text.replace(/^[+-]/, '').split('.');
  const value = (BigInt(whole) * sheetScale + BigInt(fraction.padEnd(6, '0'))) * (negative ? -1n : 1n);
  if (value < -sheetLimit || value > sheetLimit) throw new Error('Число должно быть в пределах ±1 000 000 000 000.');
  return value;
}
function roundedDivide(numerator, denominator) {
  if (denominator === 0n) throw new Error('Деление на ноль.');
  const negative = (numerator < 0n) !== (denominator < 0n), n = numerator < 0n ? -numerator : numerator, d = denominator < 0n ? -denominator : denominator;
  const quotient = n / d + (n % d * 2n >= d ? 1n : 0n);
  return negative ? -quotient : quotient;
}
export function sheetDecimal(value) {
  const n = value < 0n ? -value : value, tail = String(n % sheetScale).padStart(6, '0').replace(/0+$/, '');
  return `${value < 0n ? '-' : ''}${n / sheetScale}${tail ? '.' + tail : ''}`;
}
export function formatSheetNumber(value, precision = 2) {
  const digits = Math.min(6, Math.max(0, Number.isInteger(precision) ? precision : 2)), scale = 10n ** BigInt(digits);
  const rounded = roundedDivide(value, sheetScale / scale), n = rounded < 0n ? -rounded : rounded;
  const tail = digits ? String(n % scale).padStart(digits, '0').replace(/0+$/, '') : '';
  return `${rounded < 0n ? '−' : ''}${(n / scale).toLocaleString('ru-RU')}${tail ? ',' + tail : ''}`;
}
export function evaluateSheet(sheet, inputs = {}) {
  const rows = sheet?.rows || [], results = new Map(), active = new Set();
  const read = operand => {
    if (!operand || (!!operand.rowId) === (operand.value !== undefined)) throw new Error('Выберите строку или постоянное число.');
    if (operand.rowId) {
      const result = visit(operand.rowId);
      if (result.error) throw new Error(`«${rows.find(row => row.id === operand.rowId)?.label || 'Недоступная строка'}»: ${result.error}`);
      return result.value;
    }
    return parseSheetNumber(operand.value);
  };
  const visit = id => {
    if (results.has(id)) return results.get(id);
    if (active.has(id)) return { error: 'Циклическая ссылка. Измените формулу.' };
    const row = rows.find(item => item.id === id);
    if (!row) return { error: 'Строка удалена или недоступна.' };
    active.add(id);
    let result;
    try {
      let value;
      if (row.kind === 'input') {
        if (inputs[id] === undefined || String(inputs[id]).trim() === '') throw new Error('Введите исходное число.');
        value = parseSheetNumber(inputs[id]);
      } else if (row.kind === 'constant') value = parseSheetNumber(row.value);
      else if (row.kind === 'formula') {
        value = read(row.start);
        if ((row.steps?.length || 0) > 12) throw new Error('В формуле допускается до 12 шагов.');
        for (const step of row.steps || []) {
          const other = read(step);
          switch (step.operation) {
            case 'add': value += other; break;
            case 'subtract': value -= other; break;
            case 'multiply': value = roundedDivide(value * other, sheetScale); break;
            case 'divide': value = roundedDivide(value * sheetScale, other); break;
            case 'min': value = value < other ? value : other; break;
            case 'max': value = value > other ? value : other; break;
            default: throw new Error('Неизвестная операция.');
          }
          if (value < -sheetLimit || value > sheetLimit) throw new Error('Результат выходит за пределы ±1 000 000 000 000.');
        }
      } else throw new Error('Выберите тип строки.');
      result = { value };
    } catch (error) { result = { error: String(error.message).slice(0,600) }; }
    active.delete(id); results.set(id, result); return result;
  };
  for (const row of rows) visit(row.id);
  return results;
}
export function initialSheet(uid) {
  const input = uid();
  return { rows: [{ id: input, label: 'Значение', kind: 'input', precision: 2 }, { id: uid(), label: 'Результат', kind: 'formula', precision: 2, start: { rowId: input }, steps: [{ operation: 'multiply', value: '1' }] }] };
}
export function normalizeSheetNumbers(definition) {
  const normalized=structuredClone(definition);
  for(const block of normalized.blocks||[])for(const row of block.sheet?.rows||[]) {
    try {
      if(row.kind==='input' && row.value!==undefined)throw new Error('Личные числа ввода не входят в схему страницы.');
      if(row.kind==='constant')row.value=sheetDecimal(parseSheetNumber(row.value));
      if(row.kind==='formula')for(const operand of [row.start,...(row.steps||[])]) {
        if(operand?.value!==undefined)operand.value=sheetDecimal(parseSheetNumber(operand.value));
      }
    }catch(error){throw new Error(`Строка «${row.label||'Без названия'}»: ${error.message}`);}
  }
  return normalized;
}
export function sheetMarkup(block, e, preview = false) {
  const rows = block.sheet?.rows || [];
  return `<div class="app-sheet" data-app-sheet="${e(block.id)}"><p class="app-sheet-caption">${preview ? 'Схема листа. После установки каждый вводит свои числа.' : 'Ваши числа видны только вам. Схема и постоянные числа заданы автором страницы.'}</p><div class="app-sheet-rows">${rows.map(row => `<div class="app-sheet-row" data-sheet-row="${e(row.id)}"><div><label data-app-element="sheetLabel sheetLabel:${e(row.id)}" for="sheet-${e(block.id)}-${e(row.id)}">${e(row.label)}</label><small data-app-element="sheetUnit sheetUnit:${e(row.id)}">${e(row.unit || '')}</small></div><div>${row.kind === 'input' ? `<input id="sheet-${e(block.id)}-${e(row.id)}" data-sheet-input="${e(row.id)}" data-app-element="sheetValue sheetValue:${e(row.id)}" aria-label="${e(row.label)}" inputmode="decimal" autocomplete="off" placeholder="Введите число" ${preview ? 'disabled' : ''}>` : `<output id="sheet-${e(block.id)}-${e(row.id)}" data-sheet-result="${e(row.id)}" data-app-element="sheetValue sheetValue:${e(row.id)}">—</output>`}<small class="app-sheet-error" data-sheet-error="${e(row.id)}" hidden></small></div></div>`).join('') || '<p class="muted">Добавьте строки в конструкторе.</p>'}</div>${preview ? '' : `<div class="app-sheet-controls"><button type="button" class="primary" data-sheet-save disabled>Сохранить числа</button><button type="button" class="text-button" data-sheet-undo disabled>Отменить ввод</button><span class="muted" data-sheet-status role="status"></span></div><div class="app-sheet-conflict" data-sheet-conflict hidden></div>`}</div>`;
}
export function sheetConfig(block, e) {
  const rows = block.sheet?.rows || [];
  const operand = (value, own, attrs) => `<div class="form-grid two"><label>Взять число<select data-sheet-operand-mode ${attrs}><option value="constant" ${!value?.rowId ? 'selected' : ''}>Постоянное число</option><option value="row" ${value?.rowId ? 'selected' : ''}>Из строки листа</option></select></label>${value?.rowId ? `<label>Строка<select data-sheet-operand-row ${attrs}>${!rows.some(row => row.id === value.rowId) ? `<option value="${e(value.rowId)}" selected>Недоступная строка</option>` : ''}${rows.filter(row => row.id !== own).map(row => `<option value="${e(row.id)}" ${row.id === value.rowId ? 'selected' : ''}>${e(row.label || 'Без названия')}</option>`).join('')}</select></label>` : `<label>Число<input data-sheet-operand-value ${attrs} inputmode="decimal" value="${e(value?.value ?? '')}" required></label>`}</div>`;
  return `<section class="app-sheet-config"><h4>Строки расчётного листа</h4><p class="muted">Ввод — личные числа пользователя. Постоянное число и формула входят в набор. Формулы могут ссылаться на результаты других строк.</p>${rows.map((row,index) => `<article data-sheet-edit-row="${e(row.id)}"><div class="section-heading"><strong>Строка ${index+1}</strong><div class="form-actions"><button type="button" class="text-button" data-sheet-move="-1" ${!index?'disabled':''} aria-label="Строка ${index+1} выше">Выше</button><button type="button" class="text-button" data-sheet-move="1" ${index===rows.length-1?'disabled':''} aria-label="Строка ${index+1} ниже">Ниже</button><button type="button" class="text-button" data-sheet-row-remove ${rows.length<=1?'disabled title="В расчётном листе должна оставаться хотя бы одна строка"':''} aria-label="Убрать строку ${index+1}">Убрать</button></div></div><div class="form-grid two"><label>Подпись<input data-sheet-row-property="label" value="${e(row.label)}" maxlength="160" required></label><label>Тип строки<select data-sheet-row-property="kind">${Object.entries(sheetKinds).map(([kind,label]) => `<option value="${kind}" ${kind===row.kind?'selected':''}>${label}</option>`).join('')}</select></label><label>Единица или пояснение<input data-sheet-row-property="unit" value="${e(row.unit||'')}" maxlength="32" placeholder="₽, часы, главы…"></label><label>Знаков после запятой<input data-sheet-row-property="precision" type="number" min="0" max="6" step="1" value="${row.precision??2}" required></label></div>${row.kind==='constant'?`<label>Постоянное число<input data-sheet-row-property="value" inputmode="decimal" value="${e(row.value??'')}" required></label>`:''}${row.kind==='formula'?`<div class="app-sheet-formula"><strong>Начальное значение</strong>${operand(row.start,row.id,'data-sheet-start')} ${(row.steps||[]).map((step,i)=>`<div class="app-sheet-step" data-sheet-step="${i}"><div class="section-heading"><strong>Шаг ${i+1}</strong><button type="button" class="text-button" data-sheet-step-remove>Убрать шаг</button></div><label>Операция<select data-sheet-step-operation>${Object.entries(sheetOperations).map(([op,label])=>`<option value="${op}" ${step.operation===op?'selected':''}>${label}</option>`).join('')}</select></label>${operand(step,row.id,'')}</div>`).join('')}<button type="button" class="secondary" data-sheet-step-add ${(row.steps?.length||0)>=12?'disabled':''}>Добавить шаг</button></div>`:''}</article>`).join('')}<button type="button" class="secondary" data-sheet-row-add ${rows.length>=40?'disabled':''}>Добавить строку</button><p class="muted">Десятичная арифметика: до 6 знаков на каждом шаге; точность строки управляет отображением. Если убрать используемую строку, исправьте ссылки перед сохранением.</p><div data-sheet-config-preview></div></section>`;
}
export function bindSheetConfig(root, block, { uid, persist, draw, e, previewInputs }) {
  const config = root.querySelector('.app-sheet-config'); if (!config) return;
  const rows = block.sheet.rows, refresh = () => { persist(); draw(); };
  const rowFor = node => rows.find(row => row.id === node.closest('[data-sheet-edit-row]').dataset.sheetEditRow);
  const operandFor = node => node.hasAttribute('data-sheet-start') ? rowFor(node).start : rowFor(node).steps[Number(node.closest('[data-sheet-step]').dataset.sheetStep)];
  config.addEventListener('input', event => {
    const node=event.target;
    if(node.hasAttribute('data-sheet-row-property') && node.tagName==='INPUT') {
      const row=rowFor(node),key=node.dataset.sheetRowProperty;
      row[key]=key==='precision'?Number(node.value):node.value;
      if(key==='label') {
        const label=preview.querySelector(`[data-sheet-row="${row.id}"] label`),input=preview.querySelector(`[data-sheet-input="${row.id}"]`);
        if(label)label.textContent=row.label;
        if(input)input.setAttribute('aria-label',row.label);
        config.querySelectorAll('[data-sheet-operand-row] option').forEach(option=>{
          if(option.value!==row.id)return;
          const text=row.label||'Без названия';option.textContent=text;
          const select=option.closest('select'),control=select?.closest('.custom-select');
          const menuLabel=control?.querySelector(`.custom-select-option[data-value="${row.id}"] span`);
          if(menuLabel)menuLabel.textContent=text;
          if(select?.value===row.id){const selectedLabel=control?.querySelector('.custom-select-trigger span');if(selectedLabel)selectedLabel.textContent=text;}
        });
      }
      if(key==='unit') {
        const unit=preview.querySelector(`[data-app-element~="sheetUnit:${row.id}"]`);
        if(unit)unit.textContent=row.unit;
      }
      persist();
    }
    if(node.hasAttribute('data-sheet-operand-value')) {operandFor(node).value=node.value;persist();}
  });
  config.addEventListener('change', event => {
    const node=event.target;
    if(node.dataset.sheetRowProperty==='value'||node.hasAttribute('data-sheet-operand-value')) {
      try {const value=sheetDecimal(parseSheetNumber(node.value));node.setCustomValidity('');node.value=value;if(node.dataset.sheetRowProperty==='value')rowFor(node).value=value;else operandFor(node).value=value;persist();}
      catch(error){node.setCustomValidity(error.message);}
    }
    if(node.dataset.sheetRowProperty==='kind') {const row=rowFor(node);row.kind=node.value;delete row.value;delete row.start;delete row.steps;if(row.kind==='constant')row.value='0';if(row.kind==='formula'){const source=rows.find(other=>other.id!==row.id);row.start=source?{rowId:source.id}:{value:'0'};row.steps=[];}refresh();}
    if(node.hasAttribute('data-sheet-operand-mode')) {const op=operandFor(node);delete op.rowId;delete op.value;if(node.value==='row'){const other=rows.find(row=>row.id!==rowFor(node).id);op.rowId=other?.id||'missing';}else op.value='0';refresh();}
    if(node.hasAttribute('data-sheet-operand-row')) {operandFor(node).rowId=node.value;persist();}
    if(node.hasAttribute('data-sheet-step-operation')) {operandFor(node).operation=node.value;persist();}
  });
  config.querySelector('[data-sheet-row-add]').onclick=()=>{if(rows.length>=40)return;rows.push({id:uid(),label:`Число ${rows.length+1}`,kind:'input',precision:2});refresh();};
  config.querySelectorAll('[data-sheet-row-remove]').forEach(button=>button.onclick=()=>{if(rows.length<=1)return;rows.splice(rows.indexOf(rowFor(button)),1);refresh();});
  config.querySelectorAll('[data-sheet-move]').forEach(button=>button.onclick=()=>{const i=rows.indexOf(rowFor(button)),j=i+Number(button.dataset.sheetMove);if(j>=0&&j<rows.length){[rows[i],rows[j]]=[rows[j],rows[i]];refresh();}});
  config.querySelectorAll('[data-sheet-step-add]').forEach(button=>button.onclick=()=>{const row=rowFor(button);row.steps||=[];if(row.steps.length>=12)return;row.steps.push({operation:'add',value:'0'});refresh();});
  config.querySelectorAll('[data-sheet-step-remove]').forEach(button=>button.onclick=()=>{rowFor(button).steps.splice(Number(button.closest('[data-sheet-step]').dataset.sheetStep),1);refresh();});
  const preview=config.querySelector('[data-sheet-config-preview]');
  preview.innerHTML=`<details class="app-sheet-try"><summary>Проверить расчёт</summary><p class="muted">Проверочные числа не сохраняются в страницу или набор.</p>${sheetMarkup(block,e,false)}</details>`;
  const draft=previewInputs[block.id]||={};
  const paint=()=>{const results=evaluateSheet(block.sheet,draft);for(const row of rows){const value=results.get(row.id),out=preview.querySelector(`[data-sheet-result="${row.id}"]`),error=preview.querySelector(`[data-sheet-error="${row.id}"]`);if(out)out.textContent=value.error?'—':formatSheetNumber(value.value,row.precision);error.hidden=!value.error;error.textContent=value.error||'';}};
  preview.querySelector('.app-sheet-controls').remove();preview.querySelector('[data-sheet-conflict]').remove();
  preview.querySelectorAll('[data-sheet-input]').forEach(input=>{input.value=draft[input.dataset.sheetInput]||'';input.oninput=()=>{draft[input.dataset.sheetInput]=input.value;paint();};});paint();
  config.addEventListener('input',paint);config.addEventListener('change',paint);
}

export function createPageSheetUI({ state, api, escapeHTML:e, toast }) {
  let ownerSeen=null,epoch=0;const drafts=new Map();
  function reset(){drafts.clear();ownerSeen=null;epoch+=1;}
  function mount(root,definition,current,{valid,reload}) {
    if(ownerSeen!==state.me?.id){reset();ownerSeen=state.me?.id;}
    const owner=state.me?.id,workspace=current.workspace,pageId=current.page.id,turn=epoch;
    for(const block of definition.blocks.filter(block=>block.kind==='sheet')) {
      const host=root.querySelector(`[data-app-sheet="${block.id}"]`);if(!host)continue;
      const key=`${owner}:${workspace}:${pageId}:${block.id}`,server=current.sheets?.[block.id]||{values:{},revision:0};
      let draft=drafts.get(key);
      if(!draft || (!draft.dirty&&!draft.saving&&server.revision>=draft.revision)) {draft={values:{...server.values},saved:{...server.values},revision:server.revision,schemaRevision:current.revision,dirty:false,saving:false};drafts.set(key,draft);}
      draft.current=current;
      if(draft.revision>server.revision){current.sheets||={};current.sheets[block.id]={values:{...draft.saved},revision:draft.revision};}
      const alive=()=>turn===epoch&&owner===state.me?.id&&valid(current.page,workspace)&&host.isConnected;
      const button=host.querySelector('[data-sheet-save]'),undo=host.querySelector('[data-sheet-undo]'),status=host.querySelector('[data-sheet-status]'),conflict=host.querySelector('[data-sheet-conflict]');
      const inputRows=block.sheet.rows.filter(row=>row.kind==='input');
      const paint=()=>{const results=evaluateSheet(block.sheet,draft.values);for(const row of block.sheet.rows){const result=results.get(row.id),out=host.querySelector(`[data-sheet-result="${row.id}"]`),error=host.querySelector(`[data-sheet-error="${row.id}"]`);if(out)out.textContent=result.error?'—':formatSheetNumber(result.value,row.precision);error.hidden=!result.error;error.textContent=result.error||'';}
        button.disabled=!draft.dirty||draft.saving||draft.review;undo.disabled=!draft.dirty||draft.saving;status.textContent=draft.saving?'Сохраняем…':draft.dirty?'Есть несохранённый ввод':'Числа сохранены';};
      const fill=()=>host.querySelectorAll('[data-sheet-input]').forEach(input=>{input.value=draft.values[input.dataset.sheetInput]??'';input.disabled=draft.saving;});
      const review=(fresh)=>{
        if(!alive())return;draft.review=true;draft.reviewFresh=fresh;conflict.hidden=false;
        const changedSchema=fresh.revision!==draft.schemaRevision,latest=fresh.sheets?.[block.id]||{values:{},revision:0};
        conflict.innerHTML=`<p>${changedSchema?'Структура листа изменилась. Ваш ввод сохранён в этой вкладке. Обновите страницу и проверьте новые строки.':'Числа изменились в другой вкладке. Сравните сохранённые значения со своим вводом.'}</p><dl>${inputRows.map(row=>`<div><dt>${e(row.label)}</dt><dd>Сохранено: ${e(latest.values[row.id]??'пусто')} · Ваш ввод: ${e(draft.values[row.id]??'пусто')}</dd></div>`).join('')}</dl><button type="button" class="secondary" data-sheet-accept>${changedSchema?'Обновить структуру':'Продолжить с моим вводом'}</button>`;
        conflict.querySelector('[data-sheet-accept]').onclick=async()=>{delete draft.reviewFresh;if(changedSchema){draft.schemaRevision=fresh.revision;draft.revision=latest.revision;draft.saved={...latest.values};draft.review=false;draft.schemaNotice=true;await reload();}else{draft.saved={...latest.values};draft.revision=latest.revision;draft.review=false;conflict.hidden=true;paint();}};paint();
      };
      fill();host.querySelectorAll('[data-sheet-input]').forEach(input=>input.oninput=()=>{draft.values[input.dataset.sheetInput]=input.value;draft.dirty=true;paint();});
      undo.onclick=()=>{draft.values={...draft.saved};draft.dirty=false;draft.review=false;delete draft.reviewFresh;conflict.hidden=true;fill();paint();};
      draft.refresh=()=>{if(alive()){fill();paint();}};
      if(draft.schemaNotice){conflict.hidden=false;const missing=Object.keys(draft.values).filter(id=>!inputRows.some(row=>row.id===id)&&draft.values[id]!=='');conflict.innerHTML=`<p>Структура обновлена. Проверьте ввод перед сохранением.${missing.length?' Некоторые старые строки отсутствуют; их значения: '+missing.map(id=>e(draft.values[id])).join(', ')+'.':''}</p>`;delete draft.schemaNotice;}
      button.onclick=async()=>{
        if(draft.saving||!alive())return;
        const values={};
        try{for(const row of inputRows)if(String(draft.values[row.id]??'').trim()!=='')values[row.id]=sheetDecimal(parseSheetNumber(draft.values[row.id]));}
        catch(error){toast(error.message,true);return;}
        draft.saving=true;fill();paint();
        try{
          const result=await api(`/api/workspace/pages/${pageId}/app/sheets/${block.id}`,{method:'PUT',headers:{'X-Workspace-ID':workspace,'X-Outbox-Owner':String(owner)},body:JSON.stringify({values,expectedRevision:draft.schemaRevision,expectedValuesRevision:draft.revision})});
          if(turn!==epoch||owner!==state.me?.id)return;draft.values={...result.values};draft.saved={...result.values};draft.revision=result.revision;draft.dirty=false;draft.review=false;delete draft.reviewFresh;current.sheets||={};current.sheets[block.id]=result;draft.current.sheets||={};draft.current.sheets[block.id]=result;if(alive()){conflict.hidden=true;toast('Числа сохранены');}
        }catch(error){if(alive()){conflict.hidden=false;conflict.innerHTML=`<p role="alert">${e(error.message||'Не удалось сохранить. Ваш ввод остался в листе.')}</p>${error.status===409?'<button type="button" class="secondary" data-sheet-refresh>Сверить изменения</button>':''}`;conflict.querySelector('[data-sheet-refresh]')?.addEventListener('click',async event=>{const refreshButton=event.currentTarget;refreshButton.disabled=true;try{const fresh=await api(`/api/workspace/pages/${pageId}/app`,{headers:{'X-Workspace-ID':workspace}});review(fresh);}catch(cause){if(alive()){toast(cause.message,true);refreshButton.disabled=false;}}});}}
        finally{draft.saving=false;draft.refresh?.();}
      };paint();
      if(draft.reviewFresh)review(draft.reviewFresh);else if(draft.schemaRevision!==current.revision)review(current);
    }
  }
  return {mount,reset};
}
