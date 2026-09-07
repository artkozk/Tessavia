const formResults=new Map();
const builtinLabels={title:'Название',description:'Описание',dueAt:'Срок',ownerId:'Ответственный',stageId:'Этап',priority:'Приоритет'};
export function formFieldChoices(collection){return [...Object.entries(builtinLabels).map(([key,label])=>({key,label})),...(collection?.fields||[]).map(f=>({key:'custom:'+f.id,label:f.name}))];}
export function initialFormFields(collection){return ['title','description',...(collection?.fields||[]).map(f=>'custom:'+f.id)].map(key=>({key,width:12}));}
export function pageFormConfig(b,collections,e,icon){
 const collection=collections.find(c=>c.id===b.collectionId),choices=formFieldChoices(collection),fields=b.formFields||[];
 return `<label>Источник записей<select name="collectionId"><option value="">Выберите доску</option>${collections.map(c=>`<option value="${c.id}" ${c.id===b.collectionId?'selected':''}>${e(c.name)}</option>`).join('')}</select></label><p class="muted">Действие формы — создать запись на этой доске. Типы и обязательность полей задаются в настройках доски. Скрытые обязательные поля должны иметь начальное значение.</p><div class="app-form-config">${fields.map((f,i)=>`<article data-form-config-key="${e(f.key)}"><header><strong>${e(f.label||choices.find(c=>c.key===f.key)?.label||'Недоступное поле')}${f.hidden?' · скрыто':''}</strong><div><button type="button" class="icon-button" data-form-move="-1" aria-label="Поднять поле" ${i===0?'disabled':''}>${icon('arrowUp')}</button><button type="button" class="icon-button" data-form-move="1" aria-label="Опустить поле" ${i===fields.length-1?'disabled':''}>${icon('arrowDown')}</button><button type="button" class="text-button" data-form-toggle>${f.hidden?'Вернуть':'Убрать'}</button></div></header><details class="app-source-schema"><summary>Настроить поле</summary><div class="form-grid two"><label>Подпись<input data-form-property="label" value="${e(f.label||'')}" placeholder="${e(choices.find(c=>c.key===f.key)?.label||'')}" maxlength="160"></label><label>Подсказка внутри поля<input data-form-property="placeholder" value="${e(f.placeholder||'')}" maxlength="240"></label><label>Ширина поля (из 12)<input type="number" min="1" max="12" data-form-property="width" value="${f.width||12}"></label><label>Размер текста поля, px (0 — общий)<input type="number" min="0" max="72" data-form-property="fontSize" value="${f.fontSize||0}"></label>${[['color','Цвет текста поля'],['background','Цвет фона поля']].map(([key,label])=>`<label>${label}<input data-form-property="${key}" value="${e(f[key]||'')}" placeholder="#176b58 или пусто" pattern="#[a-fA-F0-9]{6}|" maxlength="7"></label>`).join('')}</div></details></article>`).join('')}</div><div class="form-grid two"><label>Добавить поле<select data-form-add-key><option value="">Выберите поле</option>${choices.filter(c=>!fields.some(f=>f.key===c.key)).map(c=>`<option value="${e(c.key)}">${e(c.label)}</option>`).join('')}</select></label><button type="button" class="secondary" data-form-add>Добавить поле</button></div><label>Название записи, если поле названия убрано<input name="defaultTitle" value="${e(b.defaultTitle||'')}" maxlength="80" placeholder="Например: Новое обращение"></label><div class="form-grid two"><label>Текст кнопки отправки<input name="actionLabel" value="${e(b.actionLabel||'')}" maxlength="80"></label><label>Сообщение после создания<input name="successText" value="${e(b.successText||'')}" maxlength="240" placeholder="Запись создана"></label></div>`;
}
export function updateFormProperty(input,b){const row=input.closest('[data-form-config-key]');if(!row||!input.dataset.formProperty)return false;const f=b.formFields.find(f=>f.key===row.dataset.formConfigKey);if(!f)return false;f[input.dataset.formProperty]=input.type==='number'?Number(input.value):input.value;return true;}
export function bindFormConfig(root,b,persist,draw){
 root.querySelectorAll('[data-form-config-key]').forEach(row=>{const key=row.dataset.formConfigKey;row.querySelector('[data-form-toggle]').onclick=()=>{const f=b.formFields.find(f=>f.key===key);f.hidden=!f.hidden;persist();draw();};row.querySelectorAll('[data-form-move]').forEach(button=>button.onclick=()=>{const i=b.formFields.findIndex(f=>f.key===key),j=i+Number(button.dataset.formMove);if(j<0||j>=b.formFields.length)return;[b.formFields[i],b.formFields[j]]=[b.formFields[j],b.formFields[i]];persist();draw();});});
 root.querySelector('[data-form-add]')?.addEventListener('click',()=>{const key=root.querySelector('[data-form-add-key]').value;if(!key)return;b.formFields=[...(b.formFields||[]),{key,width:12}];persist();draw();});
}
export function pageFormMarkup(b,collection,{escapeHTML:e,fieldInput,users,me,priorityLabels}){
 const options=(items,value)=>items.map(([id,name])=>`<option value="${e(String(id))}" ${String(id)===String(value)?'selected':''}>${e(name)}</option>`).join('');
 const fields=(b.formFields||[]).filter(f=>!f.hidden).map(f=>{
  const label=f.label||builtinLabels[f.key]||collection.fields.find(c=>'custom:'+c.id===f.key)?.name||'Поле';let control='';
  if(f.key.startsWith('custom:')){const source=collection.fields.find(c=>'custom:'+c.id===f.key);if(!source)return `<p role="alert">Поле ${e(label)} недоступно. Обновите настройки формы.</p>`;control=fieldInput({...source,name:label},source.defaultValue);}
  else if(f.key==='description')control=`<label>${e(label)}<textarea name="description" rows="4"></textarea></label>`;
  else if(f.key==='title')control=`<label>${e(label)}<input name="title" required maxlength="240" value="${e(b.defaultTitle||'')}"></label>`;
  else if(f.key==='dueAt')control=`<label>${e(label)}<input name="dueAt" type="datetime-local"></label>`;
  else if(f.key==='ownerId')control=`<label>${e(label)}<select name="ownerId">${options(users.map(u=>[u.id,u.username]),me.id)}</select></label>`;
  else if(f.key==='priority')control=`<label>${e(label)}<select name="priority">${options(Object.entries(priorityLabels),'normal')}</select></label>`;
  else if(f.key==='stageId')control=`<label>${e(label)}<select name="stageId">${options(collection.stages.map(s=>[s.id,s.name]),collection.stages[0]?.id)}</select></label>`;
  return `<div class="app-form-field" data-form-field-key="${e(f.key)}">${control}</div>`;
 }).join('');
 return `<form class="app-data-form"><fieldset class="app-form-inputs"><div class="app-form-grid">${fields}</div></fieldset><div class="form-actions"><button type="submit" class="primary">${e(b.actionLabel||'Создать запись')}</button></div><p role="status" data-form-result></p></form>`;
}
export function pageFormPayload(b,collection,values,customFields){return {type:collection.defaultRecordType,collectionId:collection.id,title:values.title??b.defaultTitle??'',description:values.description||'',dueAt:values.dueAt?new Date(values.dueAt).toISOString():'',ownerId:Number(values.ownerId||0),stageId:values.stageId||'',priority:values.priority||'normal',workstream:'business',editPolicy:'shared',customFields};}
export function mountPageForms(root,definition,context,deps){
 const {state,api,escapeHTML:e,fieldInput,readCustomFields,enhance,bindMulti,priorityLabels,refreshLists,openRecord}=deps;
 for(const b of definition.blocks.filter(b=>b.kind==='form'&&!b.hidden)){
  const host=root.querySelector(`[data-app-form="${b.id}"]`);if(!host)continue;
  const collection=(definition.collections||state.collections).find(c=>c.id===b.collectionId);
  if(!collection){host.innerHTML='<p class="muted">Источник формы недоступен. Выберите доску в конструкторе.</p>';continue;}
  host.innerHTML=pageFormMarkup(b,collection,{escapeHTML:e,fieldInput,users:state.users,me:state.me,priorityLabels});
  const form=host.querySelector('form'),result=form.querySelector('[data-form-result]'),button=form.querySelector('[type=submit]');
  for(const f of b.formFields||[]){const cell=form.querySelector(`[data-form-field-key="${f.key}"]`);if(!cell)continue;cell.style.setProperty('--form-span',f.width||12);if(f.fontSize)cell.style.fontSize=f.fontSize+'px';if(f.color)cell.style.color=f.color;if(f.background)cell.style.setProperty('--form-field-background',f.background);cell.querySelectorAll('input,textarea').forEach(control=>{if(f.placeholder)control.placeholder=f.placeholder;});}
  const scope=`tessavie:page-form:${state.me.id}:${context.workspace}:${context.pageId}:${b.id}`;
  const showResult=recordId=>{result.textContent=b.successText||'Запись создана.';const link=document.createElement('button');link.type='button';link.className='text-button';link.textContent='Открыть запись';link.onclick=()=>openRecord(recordId);result.append(' ',link);};
  const controls=()=>[...form.querySelectorAll('input[name],textarea[name],select[name]')];
  const saveDraft=()=>{if(context.preview)return;try{const values=controls().map(c=>({name:c.name,value:c.value,checked:c.checked}));localStorage.setItem(scope,JSON.stringify({values,signature:JSON.stringify(b)}));}catch{result.textContent='Не удалось сохранить черновик на устройстве. Оставьте страницу открытой до отправки.';}};
  if(!context.preview){try{const draft=JSON.parse(localStorage.getItem(scope)||'null');if(draft?.values){for(const c of controls()){const old=draft.values.find(v=>v.name===c.name&&(c.type!=='checkbox'||v.value===c.value));if(!old)continue;if(c.type==='checkbox')c.checked=old.checked;else c.value=old.value;}result.textContent=draft.signature===JSON.stringify(b)?'Восстановлен несохранённый ввод.': 'Форма изменилась. Проверьте восстановленные поля перед отправкой.';}}catch{result.textContent='Черновик не удалось прочитать.';}}
  const changed=()=>{if(formResults.has(scope)){formResults.delete(scope);result.textContent='';}saveDraft();};form.addEventListener('input',changed);form.addEventListener('change',changed);enhance(form);bindMulti(form);if(!context.preview&&formResults.has(scope))showResult(formResults.get(scope));
  form.onsubmit=async event=>{event.preventDefault();if(button.disabled)return;if(context.preview){result.textContent='Поля заполнены корректно. Предпросмотр не создаёт запись.';return;}
   if(state.activeWorkspaceId!==context.workspace)return;const values=Object.fromEntries(new FormData(form)),fields=collection.fields.filter(f=>(b.formFields||[]).some(item=>item.key==='custom:'+f.id&&!item.hidden)),payload=pageFormPayload(b,collection,values,readCustomFields(form,fields)),inputs=form.querySelector('.app-form-inputs');button.disabled=true;inputs.disabled=true;form.setAttribute('aria-busy','true');saveDraft();
   try{
    const headers={'X-Workspace-ID':context.workspace},latest=await api(`/api/workspace/pages/${context.pageId}/app`,{headers});
    if(latest.revision!==context.revision)throw new Error('Страница изменилась. Обновите её и проверьте восстановленный ввод. Запись не создана.');
    if(state.activeWorkspaceId!==context.workspace)return;
    const record=await api('/api/records',{method:'POST',headers,body:JSON.stringify(payload)});
    try{localStorage.removeItem(scope);}catch{}
    if(state.activeWorkspaceId!==context.workspace)return;
    state.records=[record,...state.records.filter(r=>r.id!==record.id)];state.detailCache.delete(record.id);
    form.reset();enhance(form);bindMulti(form);formResults.set(scope,record.id);showResult(record.id);refreshLists();deps.onCreated?.();
   }catch(error){result.textContent=error.message;saveDraft();}finally{button.disabled=false;inputs.disabled=false;form.removeAttribute('aria-busy');}
  };
 }
}
