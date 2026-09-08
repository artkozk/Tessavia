export const textBindingTypes=['text','long_text','number','money','date','datetime','url','email','phone','checkbox','select','multi_select'];
const bindingSlots={title:'Заголовок карточки',subtitle:'Подпись под заголовком'};
export function recordBindingText(binding,record,collection,displayField,fallback=''){
 if(!binding)return fallback;
 const field=collection?.fields?.find(f=>f.id===binding.fieldId&&textBindingTypes.includes(f.fieldType)),value=field?record.customFields?.[field.id]:null;
 const empty=value===null||value===undefined||value===''||(Array.isArray(value)&&!value.length);
 if(!field||empty)return binding.emptyText||fallback;
 const formatted=displayField(field,value);if(formatted===null||formatted===undefined||formatted==='')return binding.emptyText||fallback;
 return `${binding.prefix||''}${formatted}${binding.suffix||''}`;
}
export function recordRowText(block,record,collection,displayField){return {title:recordBindingText(block.recordBindings?.title,record,collection,displayField,record.title||'Без названия'),subtitle:recordBindingText(block.recordBindings?.subtitle,record,collection,displayField)};}
export function recordBindingConfig(block,collection,e){
 const fields=(collection?.fields||[]).filter(f=>textBindingTypes.includes(f.fieldType));
 return `<details class="app-record-binding-config"><summary>Текст карточек из данных</summary><p class="muted">Выберите, что показывать в каждой карточке списка. Название и поля исходной записи не изменятся.</p>${Object.entries(bindingSlots).map(([slot,label])=>{const b=block.recordBindings?.[slot];return `<div class="app-action-change" data-binding-slot="${slot}"><label>${label}<select data-binding-field><option value="">${slot==='title'?'Название записи':'Без подписи'}</option>${b&&!fields.some(f=>f.id===b.fieldId)?`<option value="${e(b.fieldId)}" selected disabled>Поле недоступно — выберите другое</option>`:''}${fields.map(f=>`<option value="${e(f.id)}" ${b?.fieldId===f.id?'selected':''}>${e(f.name)}</option>`).join('')}</select></label>${b?`<div class="form-grid two">${[['prefix','Текст до значения'],['suffix','Текст после значения'],['emptyText','Если значение пустое']].map(([key,name])=>`<label>${name}<input data-binding-property="${key}" maxlength="160" value="${e(b[key]||'')}"></label>`).join('')}</div><button type="button" class="text-button" data-binding-remove>Убрать привязку</button>`:''}</div>`}).join('')}<p class="muted">Ноль и «Нет» — заполненные значения. При пустом заголовке без замены показывается название записи. Недоступное поле использует ту же замену.</p><div data-binding-preview></div></details>`;
}
export function bindRecordBindings(root,block,collection,records,{escapeHTML:e,displayField,persist,draw}){
 const section=root.querySelector('.app-record-binding-config');if(!section)return;
 const entries=records.filter(r=>r.collectionId===block.collectionId&&r.status!=='archived'),host=section.querySelector('[data-binding-preview]');
 host.innerHTML=`<label>Предпросмотр данных<select data-binding-preview-record><option value="">Пустые значения</option>${entries.map(r=>`<option value="${e(r.id)}">${e(r.title)}</option>`).join('')}</select></label><div class="app-record-row" data-binding-preview-result></div><p class="muted">Предпросмотр ничего не сохраняет в записи.</p>`;
 const select=host.querySelector('select');
 const paint=()=>{const record=entries.find(r=>r.id===select.value)||{title:'Название записи',customFields:{}},text=recordRowText(block,record,collection,displayField);host.querySelector('[data-binding-preview-result]').innerHTML=`<strong>${e(text.title)}</strong>${text.subtitle?`<span>${e(text.subtitle)}</span>`:''}`;};select.onchange=paint;paint();
 const redraw=()=>{persist();draw();};
 section.querySelectorAll('[data-binding-field]').forEach(input=>input.onchange=()=>{const slot=input.closest('[data-binding-slot]').dataset.bindingSlot;block.recordBindings||={};if(input.value)block.recordBindings[slot]={...block.recordBindings[slot],fieldId:input.value};else delete block.recordBindings[slot];redraw();});
 section.querySelectorAll('[data-binding-remove]').forEach(button=>button.onclick=()=>{delete block.recordBindings[button.closest('[data-binding-slot]').dataset.bindingSlot];redraw();});
 section.querySelectorAll('[data-binding-property]').forEach(input=>input.oninput=()=>{const b=block.recordBindings[input.closest('[data-binding-slot]').dataset.bindingSlot];b[input.dataset.bindingProperty]=input.value;persist();paint();});
}
