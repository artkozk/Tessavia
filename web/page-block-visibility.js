const visibilityMetrics={checked:'Выполнено пунктов',remaining:'Осталось пунктов',percent:'Выполнено, %'};
const visibilityOperators={eq:'Равно',ne:'Не равно',gt:'Больше',gte:'Не меньше',lt:'Меньше',lte:'Не больше'};
export function blockVisible(block,definition,marks={}){
 if(block.hidden)return false;
 const c=block.visibility;if(!c)return true;
 const source=definition.blocks.find(b=>b.id===c.source&&b.kind==='tracker');if(!source)return false;
 const items=(source.items||[]).filter(i=>!i.hidden);if(!items.length)return false;
 const checked=items.filter(i=>marks[`${source.id}:${i.id}`]===true).length;
 const value={checked,remaining:items.length-checked,percent:checked/items.length*100}[c.metric];
 if(value===undefined||!Number.isFinite(c.value))return false;
 switch(c.operator){case'eq':return value===c.value;case'ne':return value!==c.value;case'gt':return value>c.value;case'gte':return value>=c.value;case'lt':return value<c.value;case'lte':return value<=c.value;default:return false;}
}
export function visibilityDescription(block,definition){
 const c=block.visibility;if(!c)return '';
 const source=definition.blocks.find(b=>b.id===c.source);
 return `${source?.title||'Блок пунктов'}: ${visibilityMetrics[c.metric]||'показатель'} ${visibilityOperators[c.operator]?.toLowerCase()||'сравнение'} ${c.value}`;
}
export function visibilityConfig(block,definition,e){
 const c=block.visibility,sources=definition.blocks.filter(b=>b.kind==='tracker'&&b.id!==block.id);
 const select=(key,label,values)=>`<label>${label}<select data-visibility-property="${key}">${Object.entries(values).map(([v,name])=>`<option value="${e(v)}" ${c?.[key]===v?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;
 return `<details class="app-visibility-config" ${c?'open':''}><summary>Когда показывать блок${c?' · условие':''}</summary><label class="app-field-check"><input type="checkbox" data-visibility-toggle ${c?'checked':''}> Показывать при условии</label>${c?`${select('source','Прогресс блока',{'':'Выберите блок',...Object.fromEntries(sources.map(b=>[b.id,b.title||'Пункты и отметки']))})}<div class="form-grid two">${select('metric','Показатель',visibilityMetrics)}${select('operator','Сравнение',visibilityOperators)}<label>Порог<input type="number" data-visibility-property="value" min="0" max="${c.metric==='percent'?100:500}" step="1" value="${c.value}" required></label></div><p class="muted">${sources.length?'Учитываются личные отметки текущего человека. Если в источнике нет видимых пунктов, блок не показывается.':'Сначала добавьте другой блок «Пункты и отметки».'}</p><p class="muted">Это порядок показа, а не ограничение доступа к содержимому страницы. Проверить разные состояния можно в предпросмотре.</p>`:'<p class="muted">Покажите следующий этап после отметок в другом блоке. Без условия блок виден сразу.</p>'}</details>`;
}
export function updateVisibility(input,block,definition){
 if(input.hasAttribute('data-visibility-toggle')){if(input.checked)block.visibility={source:definition.blocks.find(b=>b.kind==='tracker'&&b.id!==block.id)?.id||'',metric:'remaining',operator:'eq',value:0};else delete block.visibility;return true;}
 if(!input.hasAttribute('data-visibility-property')||!block.visibility)return false;
 const key=input.dataset.visibilityProperty;block.visibility[key]=key==='value'?Number(input.value):input.value;return true;
}
export function previewVisibilityMarks(definition,counts){
 const marks={};for(const block of definition.blocks.filter(b=>b.kind==='tracker'))for(const item of (block.items||[]).filter(i=>!i.hidden).slice(0,Math.max(0,Math.floor(counts[block.id]||0))))marks[`${block.id}:${item.id}`]=true;return marks;
}
export function visibilityPreviewControls(definition,counts,e){
 const ids=new Set(definition.blocks.map(b=>b.visibility?.source).filter(Boolean)),sources=definition.blocks.filter(b=>ids.has(b.id)&&b.kind==='tracker');
 if(!sources.length)return '';
 return `<details open class="app-visibility-preview"><summary>Проверка условий</summary><p class="muted">Задайте результат для предпросмотра. Настоящие отметки и данные не изменяются.</p><div class="form-grid two">${sources.map(b=>`<label>Выполнено: ${e(b.title||'Пункты и отметки')}<input type="number" data-preview-count="${e(b.id)}" min="0" max="${(b.items||[]).filter(i=>!i.hidden).length}" step="1" value="${counts[b.id]||0}"></label>`).join('')}</div></details>`;
}
