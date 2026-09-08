export const conditionOperators={eq:'равно',ne:'не равно',empty:'не заполнено',not_empty:'заполнено',gt:'больше',gte:'больше или равно',lt:'меньше',lte:'меньше или равно'};
export const allowedConditionOperators=field=>Object.entries(conditionOperators).filter(([key])=>['eq','ne','empty','not_empty'].includes(key)||['number','money'].includes(field?.fieldType));
export function conditionConfig(action,collection,e,fieldInput){
 const fields=(collection?.fields||[]).filter(f=>!['user','relation'].includes(f.fieldType)),c=action.condition,f=fields.find(f=>f.id===c?.fieldId);
 return `<div class="app-action-condition" data-condition-editor><label class="app-field-check"><input type="checkbox" data-condition-toggle ${c?'checked':''}> Выполнять только при условии</label>${c?`<label>Поле условия<select data-condition-field><option value="">Выберите поле</option>${fields.map(field=>`<option value="${field.id}" ${field.id===c.fieldId?'selected':''}>${e(field.name)}</option>`).join('')}</select></label><label>Сравнение<select data-condition-operator>${allowedConditionOperators(f).map(([key,label])=>`<option value="${key}" ${key===c.operator?'selected':''}>${label}</option>`).join('')}</select></label>${['empty','not_empty'].includes(c.operator)?'':`<div data-condition-value>${f?fieldInput({...f,name:'Значение условия',required:false},c.value):'<p class="muted">Выберите доступное поле.</p>'}</div>`}<p class="muted">Если условие не выполнено, кнопка останется видимой с объяснением.</p>`:''}</div>`;
}
export function updateConditionProperty(input,action,collection,readValue){
 const root=input.closest('[data-condition-editor]');if(!root)return false;
 if(input.hasAttribute('data-condition-toggle')){if(input.checked)action.condition=action.operation==='add'?{fieldId:action.fieldId,operator:'not_empty'}:{fieldId:action.fieldId,operator:'ne',value:structuredClone(action.value)};else delete action.condition;return true;}
 const c=action.condition;if(!c)return true;
 if(input.hasAttribute('data-condition-field')){c.fieldId=input.value;c.operator='eq';const f=collection?.fields.find(f=>f.id===c.fieldId);c.value=f?.defaultValue??(f?.fieldType==='checkbox'?false:null);}
 else if(input.hasAttribute('data-condition-operator')){c.operator=input.value;if(['empty','not_empty'].includes(c.operator))delete c.value;else if(c.value==null){const f=collection?.fields.find(f=>f.id===c.fieldId);c.value=['number','money'].includes(f?.fieldType)?0:f?.fieldType==='checkbox'?false:null;}}
 else{const f=collection?.fields.find(f=>f.id===c.fieldId);if(f)c.value=readValue(root.querySelector('[data-condition-value]'),f);}
 return true;
}
export function conditionValue(value,kind){
 if(value==null||typeof value==='string'&&!value.trim()||Array.isArray(value)&&!value.length)return null;
 if(Array.isArray(value))return [...new Set(value.map(v=>JSON.stringify(v)))].sort();
 if(kind==='datetime'&&typeof value==='string'&&Number.isFinite(Date.parse(value)))return Date.parse(value);
 return value;
}
export function conditionMatches(c,record,fields){
 if(!c)return true;const f=(fields||[]).find(f=>f.id===c.fieldId);if(!f||!allowedConditionOperators(f).some(([key])=>key===c.operator))return false;
 const a=conditionValue(record.customFields?.[c.fieldId],f.fieldType),b=conditionValue(c.value,f.fieldType);
 if(c.operator==='empty')return a===null;if(c.operator==='not_empty')return a!==null;
 if(c.operator==='eq')return JSON.stringify(a)===JSON.stringify(b);if(c.operator==='ne')return JSON.stringify(a)!==JSON.stringify(b);
 if(typeof a!=='number'||typeof b!=='number'||!Number.isFinite(a)||!Number.isFinite(b))return false;
 return ({gt:()=>a>b,gte:()=>a>=b,lt:()=>a<b,lte:()=>a<=b})[c.operator]?.()??false;
}
export function conditionDescription(c,collection,displayField){
 if(!c)return '';const field=collection?.fields.find(f=>f.id===c.fieldId);if(!field)return 'Поле условия недоступно. Обновите настройки действия.';
 return `Доступно, когда «${field.name}» ${conditionOperators[c.operator]||'соответствует условию'}${['empty','not_empty'].includes(c.operator)?'':': '+(displayField(field,c.value)||'Не указано')}`;
}
