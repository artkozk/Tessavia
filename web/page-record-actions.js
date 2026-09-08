import { conditionConfig, updateConditionProperty, conditionMatches, conditionDescription } from './page-action-conditions.js?v=20260908-block-visibility-2';
export const actionFields=collection=>(collection?.fields||[]).filter(f=>!['user','relation'].includes(f.fieldType));
export function recordActionConfig(block,collection,e,fieldInput){
 const fields=actionFields(collection);
 return `<details class="app-source-schema" ${(block.actions||[]).length?'open':''}><summary>Действия с записью · ${(block.actions||[]).length}</summary><p class="muted">Кнопка изменит поле записи по заданному правилу. Перед изменением человек увидит результат и подтвердит его.</p>${(block.actions||[]).map(a=>{const field=fields.find(f=>f.id===a.fieldId);return `<section class="app-action-config" data-record-action="${e(a.id)}"><label>Подпись действия<input data-action-label value="${e(a.label)}" maxlength="80"></label><label>Изменяемое поле<select data-action-field><option value="">Выберите поле</option>${fields.map(f=>`<option value="${f.id}" ${f.id===a.fieldId?'selected':''}>${e(f.name)}</option>`).join('')}</select></label>${field&&['number','money'].includes(field.fieldType)?`<label>Как изменить<select data-action-operation><option value="set" ${a.operation!=='add'?'selected':''}>Установить значение</option><option value="add" ${a.operation==='add'?'selected':''}>Прибавить к текущему</option></select></label>`:''}<div data-action-value>${field?fieldInput({...field,name:a.operation==='add'?'Сколько прибавить':'Новое значение',required:a.operation==='add'||field.required},a.value):'<p class="muted">Выберите доступное поле.</p>'}</div>${a.operation==='add'?'<p class="muted">Отрицательное число уменьшит значение. Пустое поле сначала нужно заполнить; для нового счётчика задайте начальное значение 0.</p>':''}${conditionConfig(a,collection,e,fieldInput)}<button type="button" class="text-button" data-action-remove>Убрать действие</button></section>`;}).join('')}<button type="button" class="secondary" data-action-add ${fields.length&&(block.actions||[]).length<8?'':'disabled'}>Добавить действие</button>${fields.length?'':'<p class="muted">Сначала добавьте на доске поле: текст, число, вариант, дату или отметку.</p>'}</details>`;
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
 const action=block.actions.find(a=>a.id===row.dataset.recordAction);if(!action)return false;
 if(updateConditionProperty(input,action,collection,readActionValue))return true;
 if(input.hasAttribute('data-action-label'))action.label=input.value;
 else if(input.hasAttribute('data-action-field')){action.fieldId=input.value;action.operation='set';const f=actionFields(collection).find(f=>f.id===input.value);action.value=f?.defaultValue??(f?.fieldType==='checkbox'?false:null);}
 else if(input.hasAttribute('data-action-operation')){action.operation=input.value;action.value=input.value==='add'?1:null;}
 else{const f=actionFields(collection).find(f=>f.id===action.fieldId);if(f)action.value=readActionValue(row.querySelector('[data-action-value]'),f);}
 return true;
}
export function bindRecordActionConfig(root,block,collection,persist,draw,fieldDeps){
 root.querySelector('[data-action-add]')?.addEventListener('click',()=>{const field=actionFields(collection)[0];if(!field||(block.actions||[]).length>=8)return;block.actions=[...(block.actions||[]),{id:crypto.randomUUID().replaceAll('-',''),label:'Изменить '+field.name,fieldId:field.id,value:field.defaultValue??(field.fieldType==='checkbox'?false:null)}];persist();draw();});
 root.querySelectorAll('[data-record-action]').forEach(row=>row.querySelector('[data-action-remove]').onclick=()=>{block.actions=block.actions.filter(a=>a.id!==row.dataset.recordAction);persist();draw();});
 fieldDeps.enhance(root);fieldDeps.bindMulti(root);
}
export function recordActionMenu(block,record,e,collection,displayField){return block.actions?.length?`<details class="app-record-action-menu"><summary>Действия<span class="sr-only">: ${e(record.title)}</span></summary><div>${block.actions.map(a=>{const allowed=conditionMatches(a.condition,record,collection?.fields);return `<div class="app-record-action-choice"><button type="button" class="text-button" data-run-record-action="${e(a.id)}" data-action-record="${e(record.id)}" ${allowed?'':'disabled'}>${e(a.label)}</button>${!allowed?`<small class="muted">${e(conditionDescription(a.condition,collection,displayField))}</small>`:''}</div>`;}).join('')}</div></details>`:'';}
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
  preview=value;review.innerHTML=`<h3>${e(value.label)}</h3><p>${e(value.title)}</p>${value.condition?`<p class="muted">${e(conditionDescription(value.condition,{fields:[value.conditionField]},displayField))}</p>`:''}<strong>${e(value.field.name)}</strong><div class="app-action-comparison"><div><small>Сейчас</small><p>${e(displayField(value.field,value.before)||'Не указано')}</p></div><div><small>После подтверждения</small><p>${e(displayField(value.field,value.after)||'Не указано')}</p></div></div>`;status.textContent=value.allowed===false?value.conditionReason:'Изменение ещё не сохранено.';apply.disabled=value.allowed===false;
 }catch(error){if(turn===serial&&review.isConnected)status.textContent=error.message;}finally{if(turn===serial)reload.disabled=false;}}
 reload.onclick=load;
 apply.onclick=async()=>{if(!preview||preview.allowed===false||!active())return;apply.disabled=true;reload.disabled=true;const turn=++serial;status.textContent='Сохраняем изменение…';try{
  const record=await api(path,{method:'POST',headers,body:JSON.stringify({...body(),apply:true,expectedUpdatedAt:preview.expectedUpdatedAt,schemaHash:preview.schemaHash})});
  if(turn!==serial||!active()||!review.isConnected)return;
  state.records=state.records.map(r=>r.id===record.id?record:r);state.detailCache.delete(record.id);close();refresh();toast('Изменение сохранено');
 }catch(error){if(turn===serial&&review.isConnected){preview=null;status.textContent=error.message+(error.status===409?'':' Перед повтором обновите предпросмотр и проверьте результат.');}}finally{if(turn===serial)reload.disabled=false;}};
 await load();
}
