import { conditionConfig, updateConditionProperty, conditionMatches, conditionDescription, bindConditionConfig, conditionReview, conditionLeaves } from './page-action-conditions.js?v=20260914-personal-references-1';
export const actionFields=collection=>(collection?.fields||[]).filter(f=>!['user','relation'].includes(f.fieldType));
export const copyActionFieldType=kind=>['text','long_text','number','money','date','datetime','checkbox','url','email','phone'].includes(kind);
export function compatibleActionSourceFields(collection,target){
 if(!target||!copyActionFieldType(target.fieldType))return [];
 return actionFields(collection).filter(f=>f.id!==target.id&&copyActionFieldType(f.fieldType)&&(f.fieldType===target.fieldType||['number','money'].includes(f.fieldType)&&['number','money'].includes(target.fieldType)||['text','long_text'].includes(f.fieldType)&&['text','long_text'].includes(target.fieldType)));
}
export const actionChanges=action=>[action,...(action.changes||[])];
export function actionChangeConfig(a,action,collection,e,fieldInput,index){
 const fields=actionFields(collection),field=fields.find(f=>f.id===a.fieldId),sources=compatibleActionSourceFields(collection,field),mode=a.operation||'set';
 const used=new Set(actionChanges(action).filter((_,i)=>i!==index).map(c=>c.fieldId));
 const operation=field&&copyActionFieldType(field.fieldType)?`<label>Как изменить<select data-action-operation><option value="set" ${mode==='set'?'selected':''}>Установить значение</option>${['number','money'].includes(field.fieldType)?`<option value="add" ${mode==='add'?'selected':''}>Прибавить к текущему</option>`:''}<option value="copy" ${mode==='copy'?'selected':''}>Взять из другого поля</option></select></label>`:'';
 const value=mode==='copy'?`<label>Источник значения<select data-action-source-field><option value="">Выберите поле</option>${sources.map(f=>`<option value="${f.id}" ${f.id===a.sourceFieldId?'selected':''}>${e(f.name)}</option>`).join('')}</select></label><p class="muted">${sources.length?'Берётся значение до выполнения всей кнопки. Пустой источник очистит необязательное поле после подтверждения; обязательное поле не очищается.':'На этой доске нет другого совместимого поля. Добавьте поле подходящего типа или выберите другой способ изменения.'}</p>`:field?fieldInput({...field,name:mode==='add'?'Сколько прибавить':'Новое значение',required:mode==='add'||field.required},a.value):'<p class="muted">Выберите доступное поле.</p>';
 return `<div class="app-action-change" data-action-change="${index}"><strong>Изменение ${index+1}</strong><label>Изменяемое поле<select data-action-field><option value="">Выберите поле</option>${fields.map(f=>`<option value="${f.id}" ${f.id===a.fieldId?'selected':''} ${used.has(f.id)?'disabled':''}>${e(f.name)}</option>`).join('')}</select></label>${operation}<div data-action-value>${value}</div>${mode==='add'?'<p class="muted">Отрицательное число уменьшит значение. Пустое поле сначала нужно заполнить; для нового счётчика задайте начальное значение 0.</p>':''}${actionChanges(action).length>1?'<button type="button" class="text-button" data-change-remove>Убрать изменение</button>':''}</div>`;
}
export function recordActionConfig(block,collection,e,fieldInput){
 const fields=actionFields(collection);
 return `<details class="app-source-schema" ${(block.actions||[]).length?'open':''}><summary>Действия с записью · ${(block.actions||[]).length}</summary><p class="muted">Одна кнопка может изменить несколько полей записи. Человек увидит все изменения и подтвердит их вместе.</p>${(block.actions||[]).map(a=>`<section class="app-action-config" data-record-action="${e(a.id)}"><label>Подпись действия<input data-action-label value="${e(a.label)}" maxlength="80"></label>${actionChanges(a).map((c,i)=>actionChangeConfig(c,a,collection,e,fieldInput,i)).join('')}<button type="button" class="secondary" data-change-add ${actionChanges(a).length>=8||!fields.some(f=>!actionChanges(a).some(c=>c.fieldId===f.id))?'disabled':''}>Добавить изменение</button>${a.changes?.length?'<p class="muted">Все значения берутся из записи до нажатия кнопки. Изменения сохраняются вместе; при ошибке не сохранится ни одно.</p>':''}${conditionConfig(a,collection,e,fieldInput)}<button type="button" class="text-button" data-action-remove>Убрать действие</button></section>`).join('')}<button type="button" class="secondary" data-action-add ${fields.length&&(block.actions||[]).length<8?'':'disabled'}>Добавить действие</button>${fields.length?'':'<p class="muted">Сначала добавьте на доске поле: текст, число, вариант, дату или отметку.</p>'}</details>`;
}
export function removeActionChange(action,index){
 const changes=actionChanges(action);if(changes.length<=1||index<0||index>=changes.length)return false;
 changes.splice(index,1);const first=changes.shift();
 action.fieldId=first.fieldId;action.operation=first.operation;action.value=first.value;delete action.sourceFieldId;if(first.sourceFieldId)action.sourceFieldId=first.sourceFieldId;
 action.changes=changes.map(({fieldId,operation,value,sourceFieldId})=>({fieldId,operation,value,sourceFieldId}));return true;
}
export function readActionValue(root,field){
 const controls=[...root.querySelectorAll('input[name],textarea[name],select[name]')],control=controls[0];if(!control)return null;
 if(field.fieldType==='checkbox')return control.checked;
 if(field.fieldType==='multi_select')return controls.filter(c=>c.checked).map(c=>c.value);
 if(['number','money'].includes(field.fieldType))return control.value===''?null:Number(control.value);
 if(field.fieldType==='datetime')return control.value?new Date(control.value).toISOString():'';
 return control.value;
}
export function updateActionProperty(input,block,collection){
 const row=input.closest('[data-record-action]');if(!row)return false;
 const parent=block.actions.find(a=>a.id===row.dataset.recordAction);if(!parent)return false;
 if(updateConditionProperty(input,parent,collection,readActionValue))return true;
 const changeRow=input.closest('[data-action-change]')||row,action=actionChanges(parent)[Number(changeRow.dataset.actionChange||0)];if(!action)return false;
 if(input.hasAttribute('data-action-label'))parent.label=input.value;
 else if(input.hasAttribute('data-action-field')){action.fieldId=input.value;action.operation='set';delete action.sourceFieldId;const f=actionFields(collection).find(f=>f.id===input.value);action.value=f?.defaultValue??(f?.fieldType==='checkbox'?false:null);}
 else if(input.hasAttribute('data-action-operation')){action.operation=input.value;action.value=input.value==='add'?1:null;if(input.value==='copy'){action.sourceFieldId=compatibleActionSourceFields(collection,actionFields(collection).find(f=>f.id===action.fieldId))[0]?.id||'';}else delete action.sourceFieldId;}
 else if(input.hasAttribute('data-action-source-field'))action.sourceFieldId=input.value;
 else{const f=actionFields(collection).find(f=>f.id===action.fieldId);if(f)action.value=readActionValue(changeRow.querySelector('[data-action-value]'),f);}
 return true;
}
export function bindRecordActionConfig(root,block,collection,persist,draw,fieldDeps){
 root.querySelector('[data-action-add]')?.addEventListener('click',()=>{const field=actionFields(collection)[0];if(!field||(block.actions||[]).length>=8)return;block.actions=[...(block.actions||[]),{id:crypto.randomUUID().replaceAll('-',''),label:'Изменить '+field.name,fieldId:field.id,value:field.defaultValue??(field.fieldType==='checkbox'?false:null)}];persist();draw();});
 root.querySelectorAll('[data-record-action]').forEach(row=>{
  const action=block.actions.find(a=>a.id===row.dataset.recordAction);
  bindConditionConfig(row,action,collection,persist,draw);
  row.querySelector('[data-action-remove]').onclick=()=>{block.actions=block.actions.filter(a=>a.id!==row.dataset.recordAction);persist();draw();};
  row.querySelector('[data-change-add]').onclick=()=>{const field=actionFields(collection).find(f=>!actionChanges(action).some(c=>c.fieldId===f.id));if(!field||actionChanges(action).length>=8)return;action.changes=[...(action.changes||[]),{fieldId:field.id,operation:'set',value:field.defaultValue??(field.fieldType==='checkbox'?false:null)}];persist();draw();};
  row.querySelectorAll('[data-change-remove]').forEach(button=>button.onclick=()=>{removeActionChange(action,Number(button.closest('[data-action-change]').dataset.actionChange));persist();draw();});
 });
 fieldDeps.enhance(root);fieldDeps.bindMulti(root);
}
export function recordActionMenu(block,record,e,collection,displayField){return block.actions?.length?`<details class="app-record-action-menu"><summary>Действия<span class="sr-only">: ${e(record.title)}</span></summary><div>${block.actions.map(a=>{const allowed=conditionMatches(a.condition,record,collection?.fields);return `<div class="app-record-action-choice"><button type="button" class="text-button" data-app-element="actionButton action:${e(a.id)}" data-run-record-action="${e(a.id)}" data-action-record="${e(record.id)}" ${allowed?'':'disabled'}>${e(a.label)}</button>${!allowed?`<small class="muted">${e(conditionDescription(a.condition,collection,displayField))}</small>`:''}</div>`;}).join('')}</div></details>`:'';}
export async function openPageRecordAction(context,block,actionId,recordId,deps){
 const {state,api,escapeHTML:e,displayField,dialog,root,openModal,close,refresh,toast}=deps,owner=state.me.id;
 const active=()=>state.me?.id===owner&&state.activeWorkspaceId===context.workspace&&state.view===`page:${context.page.id}`;
 const headers={'X-Workspace-ID':context.workspace,'X-Outbox-Owner':String(owner)};
 const path=`/api/workspace/pages/${context.page.id}/app/action`;
 let preview=null,serial=0;
 root.innerHTML='<div class="dialog-header"><h2>Проверка действия</h2><button type="button" class="secondary" data-action-close>Закрыть</button></div><div class="app-action-dialog-body"><div data-action-review></div><p role="status" data-action-status></p><div class="form-actions"><button type="button" class="primary" data-action-apply disabled>Подтвердить изменение</button><button type="button" class="secondary" data-action-refresh>Обновить предпросмотр</button><button type="button" class="text-button" data-action-close>Отмена</button></div></div>';
 const review=root.querySelector('[data-action-review]'),status=root.querySelector('[data-action-status]'),apply=root.querySelector('[data-action-apply]'),reload=root.querySelector('[data-action-refresh]');
 root.querySelectorAll('[data-action-close]').forEach(button=>button.onclick=()=>{serial++;close();});openModal(dialog);
 const body=()=>({blockId:block.id,actionId,recordId,expectedRevision:context.revision});
 async function load(){const turn=++serial;preview=null;apply.disabled=true;reload.disabled=true;status.textContent='Проверяем актуальную запись…';try{
  const detail=await api('/api/records/'+recordId,{headers});
  if(turn!==serial||!active()||!review.isConnected)return;
  state.records=state.records.map(r=>r.id===detail.record.id?detail.record:r);state.detailCache.delete(detail.record.id);refresh();
  const value=await api(path,{method:'POST',headers,body:JSON.stringify({...body(),expectedUpdatedAt:detail.record.updatedAt})});
  if(turn!==serial||!active()||!review.isConnected)return;
  preview=value;review.innerHTML=`<h3>${e(value.label)}</h3><p>${e(value.title)}</p>${conditionReview(value,e,displayField)}${(value.changes||[value]).map(change=>`<section class="app-action-change"><strong>${e(change.field.name)}</strong>${change.sourceField?`<p class="muted">Источник: ${e(change.sourceField.name)} · ${e(displayField(change.sourceField,change.sourceValue)||'Не указано')}</p>`:''}<div class="app-action-comparison"><div><small>Сейчас</small><p>${e(displayField(change.field,change.before)||'Не указано')}</p></div><div><small>После подтверждения</small><p>${e(displayField(change.field,change.after)||'Не указано')}</p></div></div></section>`).join('')}${value.changes?.length>1?'<p class="muted">Все изменения сохранятся вместе. Источники берутся из записи до выполнения действия.</p>':''}`;status.textContent=value.allowed===false?value.conditionReason:'Изменение ещё не сохранено.';apply.disabled=value.allowed===false;
 }catch(error){if(turn===serial&&review.isConnected)status.textContent=error.message;}finally{if(turn===serial)reload.disabled=false;}}
 reload.onclick=load;
 apply.onclick=async()=>{if(!preview||preview.allowed===false||!active())return;apply.disabled=true;reload.disabled=true;const turn=++serial;status.textContent='Сохраняем изменение…';try{
  const record=await api(path,{method:'POST',headers,body:JSON.stringify({...body(),apply:true,expectedConditionCount:conditionLeaves(preview.condition).length,expectedChangeCount:preview.changes?.length||1,expectedUpdatedAt:preview.expectedUpdatedAt,schemaHash:preview.schemaHash})});
  if(turn!==serial||!active()||!review.isConnected)return;
  state.records=state.records.map(r=>r.id===record.id?record:r);state.detailCache.delete(record.id);close();refresh();toast('Изменение сохранено');
 }catch(error){if(turn===serial&&review.isConnected){preview=null;status.textContent=error.message+(error.status===409?'':' Перед повтором обновите предпросмотр и проверьте результат.');}}finally{if(turn===serial)reload.disabled=false;}};
 await load();
}
