export const conditionOperators={eq:'равно',ne:'не равно',empty:'не заполнено',not_empty:'заполнено',gt:'больше',gte:'больше или равно',lt:'меньше',lte:'меньше или равно'};
export const allowedConditionOperators=field=>Object.entries(conditionOperators).filter(([key])=>['eq','ne','empty','not_empty'].includes(key)||['number','money'].includes(field?.fieldType));
export const conditionLeaves=c=>!c?[]:c.mode?c.conditions||[]:[c];
export function conditionConfig(action,collection,e,fieldInput){
 const fields=(collection?.fields||[]).filter(f=>!['user','relation'].includes(f.fieldType)),c=action.condition;
 return `<div class="app-action-condition" data-condition-editor><label class="app-field-check"><input type="checkbox" data-condition-toggle ${c?'checked':''}> Выполнять только при условии</label>${c?`${c.mode?`<label>Как проверять условия<select data-condition-mode><option value="all" ${c.mode==='all'?'selected':''}>Все условия</option><option value="any" ${c.mode==='any'?'selected':''}>Любое условие</option></select></label>`:''}${conditionLeaves(c).map((leaf,i)=>{const f=fields.find(f=>f.id===leaf.fieldId);return `<div class="app-action-change" data-condition-index="${i}"><strong>Условие ${i+1}</strong><label>Поле условия<select data-condition-field><option value="">Выберите поле</option>${fields.map(field=>`<option value="${field.id}" ${field.id===leaf.fieldId?'selected':''}>${e(field.name)}</option>`).join('')}</select></label><label>Сравнение<select data-condition-operator>${allowedConditionOperators(f).map(([key,label])=>`<option value="${key}" ${key===leaf.operator?'selected':''}>${label}</option>`).join('')}</select></label>${['empty','not_empty'].includes(leaf.operator)?'':`<div data-condition-value>${f?fieldInput({...f,name:'Значение условия',required:false},leaf.value):'<p class="muted">Выберите доступное поле.</p>'}</div>`}<button type="button" class="text-button" data-condition-remove>Убрать условие</button></div>`}).join('')}<button type="button" class="secondary" data-condition-add ${conditionLeaves(c).length>=8?'disabled':''}>Добавить условие</button><p class="muted">${c.mode==='any'?'Достаточно одного выполненного условия.':c.mode==='all'?'Должны выполняться все условия.':''} Если условие не выполнено, кнопка останется видимой с объяснением. Удаление последнего условия снимает ограничение.</p>`:''}</div>`;
}
export function removeActionCondition(action,index){
 const list=conditionLeaves(action.condition);if(index<0||index>=list.length)return false;
 const remaining=list.filter((_,i)=>i!==index);if(!remaining.length)delete action.condition;else if(remaining.length===1)action.condition=remaining[0];else action.condition={mode:action.condition.mode||'all',conditions:remaining};return true;
}
export function bindConditionConfig(root,action,collection,persist,draw){
 root.querySelector('[data-condition-add]')?.addEventListener('click',()=>{const leaves=conditionLeaves(action.condition);if(!leaves.length||leaves.length>=8)return;const fields=(collection?.fields||[]).filter(f=>!['user','relation'].includes(f.fieldType));const f=fields.find(f=>!leaves.some(c=>c.fieldId===f.id))||fields[0];if(!f)return;action.condition={mode:action.condition.mode||'all',conditions:[...leaves,{fieldId:f.id,operator:'not_empty'}]};persist();draw();});
 root.querySelectorAll('[data-condition-remove]').forEach(button=>button.onclick=()=>{removeActionCondition(action,Number(button.closest('[data-condition-index]').dataset.conditionIndex));persist();draw();});
}
export function updateConditionProperty(input,action,collection,readValue){
 const root=input.closest('[data-condition-editor]');if(!root)return false;
 if(input.hasAttribute('data-condition-toggle')){if(input.checked)action.condition=['add','copy'].includes(action.operation)?{fieldId:action.operation==='copy'?action.sourceFieldId:action.fieldId,operator:'not_empty'}:{fieldId:action.fieldId,operator:'ne',value:structuredClone(action.value)};else delete action.condition;return true;}
 if(input.hasAttribute('data-condition-mode')){if(action.condition?.mode)action.condition.mode=input.value;return true;}
 const row=input.closest('[data-condition-index]')||root,c=conditionLeaves(action.condition)[Number(row.dataset?.conditionIndex||0)];if(!c)return true;
 if(input.hasAttribute('data-condition-field')){c.fieldId=input.value;c.operator='eq';const f=collection?.fields.find(f=>f.id===c.fieldId);c.value=f?.defaultValue??(f?.fieldType==='checkbox'?false:null);}
 else if(input.hasAttribute('data-condition-operator')){c.operator=input.value;if(['empty','not_empty'].includes(c.operator))delete c.value;else if(c.value==null){const f=collection?.fields.find(f=>f.id===c.fieldId);c.value=['number','money'].includes(f?.fieldType)?0:f?.fieldType==='checkbox'?false:null;}}
 else{const f=collection?.fields.find(f=>f.id===c.fieldId);if(f)c.value=readValue(row.querySelector('[data-condition-value]'),f);}
 return true;
}
export function conditionValue(value,kind){
 if(value==null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length)return null;
 if(Array.isArray(value))return [...new Set(value.map(v=>JSON.stringify(v)))].sort();
 if(kind==='datetime'&&typeof value==='string'&&Number.isFinite(Date.parse(value)))return Date.parse(value);
 return value;
}
export function conditionMatches(c,record,fields){
 if(!c)return true;if(c.mode||c.conditions){if(!['all','any'].includes(c.mode)||!c.conditions?.length||c.conditions.length>8||c.conditions.some(x=>x.mode||x.conditions))return false;const matches=c.conditions.map(leaf=>conditionMatches(leaf,record,fields));return c.mode==='all'?matches.every(Boolean):matches.some(Boolean);}const f=(fields||[]).find(f=>f.id===c.fieldId);if(!f||!allowedConditionOperators(f).some(([key])=>key===c.operator))return false;
 const a=conditionValue(record.customFields?.[c.fieldId],f.fieldType),b=conditionValue(c.value,f.fieldType);
 if(c.operator==='empty')return a===null;if(c.operator==='not_empty')return a!==null;
 if(c.operator==='eq')return JSON.stringify(a)===JSON.stringify(b);if(c.operator==='ne')return JSON.stringify(a)!==JSON.stringify(b);
 if(typeof a!=='number'||typeof b!=='number'||!Number.isFinite(a)||!Number.isFinite(b))return false;
 return ({gt:()=>a>b,gte:()=>a>=b,lt:()=>a<b,lte:()=>a<=b})[c.operator]?.()??false;
}
export function conditionDescription(c,collection,displayField){
 if(!c)return '';if(c.mode)return `${c.mode==='any'?'Достаточно любого условия':'Нужны все условия'}: ${conditionLeaves(c).map(leaf=>conditionDescription(leaf,collection,displayField).replace('Доступно, когда ', '')).join(c.mode==='any'?' или ':'; ')}`;const field=collection?.fields.find(f=>f.id===c.fieldId);if(!field)return 'Поле условия недоступно. Обновите настройки действия.';
 return `Доступно, когда «${field.name}» ${conditionOperators[c.operator]||'соответствует условию'}${['empty','not_empty'].includes(c.operator)?'':': '+(displayField(field,c.value)||'Не указано')}`;
}

export function conditionReview(value,e,displayField){
 if(!value.condition)return '';
 const fields=value.conditionFields||[value.conditionField].filter(Boolean),leaves=conditionLeaves(value.condition);
 return `<div class="app-action-condition-review"><strong>${value.condition.mode==='any'?'Достаточно любого условия':value.condition.mode==='all'?'Нужны все условия':'Условие действия'}</strong><ul>${leaves.map((leaf,i)=>`<li>${e(conditionDescription(leaf,{fields},displayField).replace('Доступно, когда ',''))} · ${value.conditionResults?.[i]===false?'Не выполнено':value.conditionResults?.[i]===true?'Выполнено':value.allowed?'Выполнено':'Не выполнено'}</li>`).join('')}</ul></div>`;
}
