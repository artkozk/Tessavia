import { blockSubtree } from './page-composition.js?v=20260910-calendar-layout-1';
const visibilityMetrics={checked:'Выполнено пунктов',remaining:'Осталось пунктов',percent:'Выполнено, %'};
const visibilityOperators={eq:'Равно',ne:'Не равно',gt:'Больше',gte:'Не меньше',lt:'Меньше',lte:'Не больше'};
export const visibilityLeaves=c=>!c?[]:c.mode?c.conditions||[]:[c];
export function blockVisible(block,definition,marks={}){
 const seen=new Set();let current=block;while(current){if(seen.has(current.id)||!ownBlockVisible(current,definition,marks))return false;seen.add(current.id);if(!current.parentId)return true;current=definition.blocks.find(b=>b.id===current.parentId&&b.kind==='group');if(!current)return false;}return false;
}
function ownBlockVisible(block,definition,marks={}){
 if(block.hidden)return false;
 const c=block.visibility;if(!c)return true;if(c.mode||c.conditions){if(!['all','any'].includes(c.mode)||!c.conditions?.length||c.conditions.length>8||c.conditions.some(x=>x.mode||x.conditions))return false;const results=c.conditions.map(leaf=>ownBlockVisible({...block,visibility:leaf},definition,marks));return c.mode==='all'?results.every(Boolean):results.some(Boolean);}
 const source=definition.blocks.find(b=>b.id===c.source&&b.kind==='tracker');if(!source)return false;
 const items=(source.items||[]).filter(i=>!i.hidden);if(!items.length)return false;
 const checked=items.filter(i=>marks[`${source.id}:${i.id}`]===true).length;
 const value={checked,remaining:items.length-checked,percent:checked/items.length*100}[c.metric];
 if(value===undefined||!Number.isFinite(c.value))return false;
 switch(c.operator){case'eq':return value===c.value;case'ne':return value!==c.value;case'gt':return value>c.value;case'gte':return value>=c.value;case'lt':return value<c.value;case'lte':return value<=c.value;default:return false;}
}
export function visibilityDescription(block,definition){
 const c=block.visibility;if(!c)return '';if(c.mode)return `${c.mode==='any'?'Любое условие':'Все условия'}: ${visibilityLeaves(c).map(leaf=>visibilityDescription({...block,visibility:leaf},definition)).join(c.mode==='any'?' или ':'; ')}`;
 const source=definition.blocks.find(b=>b.id===c.source);
 return `${source?.title||'Блок пунктов'}: ${visibilityMetrics[c.metric]||'показатель'} ${visibilityOperators[c.operator]?.toLowerCase()||'сравнение'} ${c.value}`;
}
function visibilitySources(block,definition){const excluded=new Set(block.kind==='group'?blockSubtree(definition,block.id).map(b=>b.id):[block.id]);return definition.blocks.filter(b=>b.kind==='tracker'&&!excluded.has(b.id));}
export function visibilityConfig(block,definition,e){
 const c=block.visibility,sources=visibilitySources(block,definition);
 const select=(leaf,key,label,values)=>`<label>${label}<select data-visibility-property="${key}">${Object.entries(values).map(([v,name])=>`<option value="${e(v)}" ${leaf?.[key]===v?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;
 return `<details class="app-visibility-config" ${c?'open':''}><summary>Когда показывать блок${c?' · условие':''}</summary><label class="app-field-check"><input type="checkbox" data-visibility-toggle ${c?'checked':''}> Показывать при условии</label>${c?`${c.mode?select(c,'mode','Как проверять условия',{all:'Все условия',any:'Любое условие'}):''}${visibilityLeaves(c).map((leaf,i)=>`<div class="app-action-change" data-visibility-index="${i}"><strong>Условие ${i+1}</strong>${select(leaf,'source','Прогресс блока',{'':'Выберите блок',...Object.fromEntries(sources.map(b=>[b.id,b.title||'Пункты и отметки']))})}<div class="form-grid two">${select(leaf,'metric','Показатель',visibilityMetrics)}${select(leaf,'operator','Сравнение',visibilityOperators)}<label>Порог<input type="number" data-visibility-property="value" min="0" max="${leaf.metric==='percent'?100:500}" step="1" value="${leaf.value}" required></label></div><button type="button" class="text-button" data-visibility-remove>Убрать условие</button></div>`).join('')}<button type="button" class="secondary" data-visibility-add ${visibilityLeaves(c).length>=8||!sources.length?'disabled':''}>Добавить условие</button><p class="muted">${c.mode==='any'?'Достаточно одного выполненного условия.':c.mode==='all'?'Нужны все условия.':''} ${sources.length?'Учитываются личные отметки текущего человека. Если в источнике нет видимых пунктов, его условие не выполнено.':'Сначала добавьте другой блок «Пункты и отметки».'} Удаление последнего условия показывает блок сразу.</p><p class="muted">Это порядок показа, а не ограничение доступа к содержимому страницы. Проверить разные состояния можно в предпросмотре.</p>`:'<p class="muted">Покажите следующий этап после отметок в других блоках. Без условия блок виден сразу.</p>'}</details>`;
}
export function removeVisibilityCondition(block,index){
 const leaves=visibilityLeaves(block.visibility);if(index<0||index>=leaves.length)return false;
 const rest=leaves.filter((_,i)=>i!==index);if(!rest.length)delete block.visibility;else if(rest.length===1)block.visibility=rest[0];else block.visibility={mode:block.visibility.mode||'all',conditions:rest};return true;
}
export function bindVisibilityConfig(root,block,definition,persist,draw){
 root.querySelector('[data-visibility-add]')?.addEventListener('click',()=>{const leaves=visibilityLeaves(block.visibility);if(!leaves.length||leaves.length>=8)return;const sources=visibilitySources(block,definition);const source=sources.find(b=>!leaves.some(c=>c.source===b.id))||sources[0];if(!source)return;block.visibility={mode:block.visibility.mode||'all',conditions:[...leaves,{source:source.id,metric:'remaining',operator:'eq',value:0}]};persist();draw();});
 root.querySelectorAll('[data-visibility-remove]').forEach(button=>button.onclick=()=>{removeVisibilityCondition(block,Number(button.closest('[data-visibility-index]').dataset.visibilityIndex));persist();draw();});
}
export function updateVisibility(input,block,definition){
 if(input.hasAttribute('data-visibility-toggle')){if(input.checked)block.visibility={source:visibilitySources(block,definition)[0]?.id||'',metric:'remaining',operator:'eq',value:0};else delete block.visibility;return true;}
 if(!input.hasAttribute('data-visibility-property')||!block.visibility)return false;
 const key=input.dataset.visibilityProperty;if(key==='mode'){block.visibility.mode=input.value;return true;}const index=Number(input.closest('[data-visibility-index]')?.dataset.visibilityIndex||0),c=visibilityLeaves(block.visibility)[index];if(c)c[key]=key==='value'?Number(input.value):input.value;return true;
}
export function previewVisibilityMarks(definition,counts){
 const marks={};for(const block of definition.blocks.filter(b=>b.kind==='tracker'))for(const item of (block.items||[]).filter(i=>!i.hidden).slice(0,Math.max(0,Math.floor(counts[block.id]||0))))marks[`${block.id}:${item.id}`]=true;return marks;
}
export function visibilityPreviewControls(definition,counts,e){
 const ids=new Set(definition.blocks.flatMap(b=>visibilityLeaves(b.visibility).map(c=>c.source)).filter(Boolean)),sources=definition.blocks.filter(b=>ids.has(b.id)&&b.kind==='tracker');
 if(!sources.length)return '';
 return `<details open class="app-visibility-preview"><summary>Проверка условий</summary><p class="muted">Задайте результат для предпросмотра. Настоящие отметки и данные не изменяются.</p><div class="form-grid two">${sources.map(b=>`<label>Выполнено: ${e(b.title||'Пункты и отметки')}<input type="number" data-preview-count="${e(b.id)}" min="0" max="${(b.items||[]).filter(i=>!i.hidden).length}" step="1" value="${counts[b.id]||0}"></label>`).join('')}</div></details>`;
}
