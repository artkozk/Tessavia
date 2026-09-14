// Trash stores the original subtree. It is not a schema-only library copy.
export function blockRemovalPlan(definition, rootId) {
 const root=definition.blocks.find(b=>b.id===rootId),ids=new Set(root?[rootId]:[]);let changed=true;
 while(changed){changed=false;for(const block of definition.blocks)if(block.parentId&&ids.has(block.parentId)&&!ids.has(block.id)){ids.add(block.id);changed=true;}}
 const blocks=definition.blocks.filter(b=>ids.has(b.id)),dependencies=[];
 const conditionUses=condition=>Boolean(condition&&(ids.has(condition.source)||(condition.conditions||[]).some(conditionUses)));
 for(const block of definition.blocks){if(ids.has(block.id))continue;const reasons=[];if(['progress','button'].includes(block.kind)&&ids.has(block.source))reasons.push(block.kind==='progress'?'показывает прогресс':'переходит к блоку');if(conditionUses(block.visibility))reasons.push('использует отметки в условии показа');if(reasons.length)dependencies.push({blockId:block.id,title:block.title||'Блок',reason:reasons.join('; ')});}
 return{root,blocks,dependencies};
}

export function blockHiddenState(definition, block) {
 if(block.hidden)return{hidden:true,label:'Скрыт вручную',targetId:block.id};
 const seen=new Set([block.id]);let parent=block.parentId;
 while(parent&&!seen.has(parent)){seen.add(parent);const group=definition.blocks.find(b=>b.id===parent);if(!group)break;if(group.hidden)return{hidden:true,label:`Скрыта группа «${group.title||'Группа'}»`,targetId:group.id};parent=group.parentId;}
 return{hidden:false,label:block.visibility?'Настроено условие показа':'',targetId:block.id};
}

export function createPageBlockTrashEditor({escapeHTML:e,uid,request,owns,collect,getDefinition,getName,getRevision,pageId,persist,draw,setBusy,getPending,setPending,onApplied,onSelect,toast,normalize}) {
 let panel=null,serial=0,busy=false;
 const pending=()=>getPending(),active=()=>Boolean(panel||pending());
 const allowed=()=>owns()&&!busy&&!pending();
 const show=value=>{panel=value;draw();};
 const manage=()=>{if(!allowed())return;serial++;show({mode:'manage',hiddenOnly:false});};
 const select=id=>{if(!allowed())return;serial++;panel=null;onSelect(id);draw();};
 const remove=id=>{if(!allowed()||!collect())return;const plan=blockRemovalPlan(getDefinition(),id);if(!plan.root)return;persist();show({mode:'remove',rootId:id});};
 async function library(){
  if(!allowed())return;const turn=++serial;show({mode:'loading'});
  try{const result=await request(`/api/workspace/pages/${pageId}/app/trash?limit=50`);if(owns()&&turn===serial)show({mode:'trash',items:result.items,nextCursor:result.nextCursor||''});}catch(error){if(owns()&&turn===serial)show({mode:'error',message:error.message});}
 }
 async function more(){
  if(!allowed()||panel?.mode!=='trash'||!panel.nextCursor||panel.loadingMore)return;const origin=panel,turn=++serial;panel={...panel,loadingMore:true,error:''};draw();
  try{const result=await request(`/api/workspace/pages/${pageId}/app/trash?limit=50&cursor=${encodeURIComponent(origin.nextCursor)}`);if(owns()&&turn===serial){const ids=new Set(origin.items.map(item=>item.id));show({mode:'trash',items:[...origin.items,...result.items.filter(item=>!ids.has(item.id))],nextCursor:result.nextCursor||''});}}catch(error){if(owns()&&turn===serial)show({...origin,loadingMore:false,error:error.message});}
 }
 function prepare(kind,trashId){
  if(!allowed()||!collect())return;
  if(!getName().trim())return show({...panel,error:'Укажите название страницы перед сохранением.'});
  if(kind==='remove'){const plan=blockRemovalPlan(getDefinition(),panel.rootId);if(!plan.root||plan.dependencies.length)return draw();}
  if(kind==='restore'&&getDefinition().blocks.length+panel.item.blockCount>40)return draw();
  try{const body={definition:structuredClone(normalize(getDefinition())),pageName:getName(),expectedRevision:getRevision(),clientRequestId:uid()};if(kind==='remove')body.blockId=panel.rootId;return submit({kind,trashId,body});}catch(error){show({...panel,error:error.message});}
 }
 async function submit(proposed){
  if(!owns()||busy)return;
  const resuming=Boolean(pending());
  if(!pending()){
   setPending(structuredClone(proposed));
   // Do not send a mutating request unless its retry receipt is durable locally.
   if(persist()===false){setPending(null);show({...panel,error:'Не удалось сохранить запрос на устройстве. Освободите место в браузере и повторите; страница не изменена.'});return;}
  }
  const operation=pending(),originPanel=panel;busy=true;setBusy(true);
  try{
   const path=`/api/workspace/pages/${pageId}/app/trash${operation.kind==='restore'?`/${encodeURIComponent(operation.trashId)}/restore`:''}`;
   const result=await request(path,{method:'POST',body:JSON.stringify(operation.body)});
   if(!owns())return;
   setPending(null);panel=null;setBusy(false);
   await onApplied(result,operation.body.pageName,operation.kind);
   if(owns())toast(operation.kind==='restore'?'Блоки восстановлены. Страница сохранена.':'Блоки в корзине. Страница сохранена.');
  }catch(error){
   if(owns()){
    const definite=[400,401,403,404,409,413,422].includes(error.status)&&!(resuming&&[401,403,404].includes(error.status));
    if(definite){setPending(null);persist();panel={...(originPanel||{mode:'error'}),error:error.message,message:error.message};}
    else panel={...panel,error:error.message};
    setBusy(false);draw();toast(error.message,true);
   }
  }finally{busy=false;setBusy(false);}
 }
 function render(){
  if(!active())return '';
  const op=pending();
  if(op)return `<section class="app-trash-panel" tabindex="-1" aria-label="Проверка операции с блоками"><h3>Проверим результат ${op.kind==='restore'?'восстановления':'переноса в корзину'}</h3><p role="status">Ответ сервера ещё не подтверждён. Настройки страницы и запрос сохранены на этом устройстве. Сначала проверьте результат, чтобы не потерять изменения.</p>${panel?.error?`<p role="alert">${e(panel.error)}</p>`:''}<button type="button" class="primary" data-trash-retry>Проверить и продолжить</button></section>`;
  const definition=getDefinition(),count=definition.blocks.length;let body='';
  const capacity=`<p class="app-trash-capacity"><strong>Блоков на странице: ${count}/40</strong><span>Скрытые тоже занимают место. Корзина освобождает его.</span></p>`;
  if(panel.mode==='manage'){
   const states=definition.blocks.map(block=>({block,state:blockHiddenState(definition,block)})),hidden=states.filter(row=>row.state.hidden).length;
   body=`<h3>Блоки страницы</h3>${capacity}<div class="app-trash-filters" role="group" aria-label="Какие блоки показать"><button type="button" class="secondary" data-trash-filter="all" aria-pressed="${!panel.hiddenOnly}">Все · ${count}</button><button type="button" class="secondary" data-trash-filter="hidden" aria-pressed="${panel.hiddenOnly}">Скрытые · ${hidden}</button><button type="button" class="text-button" data-trash-library>Корзина</button></div><div class="app-trash-list">${states.filter(row=>!panel.hiddenOnly||row.state.hidden).map(({block,state})=>`<article><div><strong>${e(block.title||'Блок')}</strong>${state.label?`<p class="muted">${e(state.label)}</p>`:''}${block.kind==='group'?`<p class="muted">В группе блоков: ${blockRemovalPlan(definition,block.id).blocks.length-1}</p>`:''}</div><div class="app-trash-row-actions"><button type="button" class="secondary" data-trash-select="${e(state.hidden?state.targetId:block.id)}">${state.hidden&&state.targetId!==block.id?'Открыть группу':'Настроить'}</button><button type="button" class="text-button" data-trash-remove="${e(block.id)}">В корзину</button></div></article>`).join('')||'<p class="muted">Таких блоков нет.</p>'}</div>`;
  }
  if(panel.mode==='loading')body='<p role="status">Загружаем корзину…</p>';
  if(panel.mode==='trash')body=`<h3>Корзина блоков</h3>${capacity}<p class="muted">Загружено записей: ${panel.items.length}. Настройки, отметки и введённые числа сохраняются. У группы восстанавливается всё содержимое.</p><div class="app-trash-list">${panel.items.map(item=>`<article><div><strong>${e(item.title||'Блок')}</strong><p class="muted">Блоков: ${item.blockCount}${item.removedAt?` · ${e(String(item.removedAt).slice(0,10))}`:''}</p></div><button type="button" class="secondary" data-trash-restore="${e(item.id)}">Восстановить…</button></article>`).join('')||'<p class="muted">Корзина пуста.</p>'}</div>${panel.nextCursor?`<button type="button" class="secondary" data-trash-more ${panel.loadingMore?'disabled':''}>${panel.loadingMore?'Загружаем…':'Показать ещё'}</button>`:''}`;
  if(panel.mode==='remove'){
   const plan=blockRemovalPlan(definition,panel.rootId);
   body=`<h3>В корзину: ${e(plan.root?.title||'Блок')}</h3><p>Освободится мест: <strong>${plan.blocks.length}</strong>. В корзину перейдут выбранный блок и всё его содержимое. Настройки, личные отметки, числа и записи досок сохранятся.</p><ul>${plan.blocks.map(block=>`<li>${e(block.title||'Блок')}</li>`).join('')}</ul>${plan.dependencies.length?`<div role="alert"><p>Сначала измените связи в этих блоках:</p><ul>${plan.dependencies.map(item=>`<li><strong>${e(item.title)}</strong>: ${e(item.reason)}. <button type="button" class="text-button" data-trash-select="${e(item.blockId)}">Открыть блок</button></li>`).join('')}</ul></div>`:''}<p>Это действие также сохранит текущие изменения страницы «${e(getName())}».</p><div class="app-trash-row-actions"><button type="button" class="primary" data-trash-confirm-remove ${!plan.root||plan.dependencies.length?'disabled':''}>В корзину и сохранить страницу</button><button type="button" class="secondary" data-trash-library>Открыть корзину</button></div>`;
  }
  if(panel.mode==='restore'){
   const required=panel.item.blockCount,free=40-count;
   body=`<h3>Восстановить: ${e(panel.item.title||'Блок')}</h3><p>Вернутся прежние блоки (${required}), их настройки, отметки и числа. Сохранится текущий черновик страницы «${e(getName())}».</p><p>Нужно мест: ${required}. Свободно: ${free}.</p>${required>free?'<p role="alert">Сначала перенесите ненужные блоки в корзину. Скрытие не освобождает места.</p>':''}<p class="muted">Исходная группа и источники должны оставаться доступными. Если чего-то не хватает, платформа укажет причину; связи не будут заменены автоматически.</p><div class="app-trash-row-actions"><button type="button" class="primary" data-trash-confirm-restore ${required>free?'disabled':''}>Восстановить и сохранить страницу</button><button type="button" class="secondary" data-trash-manage>Освободить место</button></div>`;
  }
  if(panel.mode==='error')body=`<h3>Не удалось открыть корзину</h3><p role="alert">${e(panel.message||'Повторите попытку.')}</p><button type="button" class="secondary" data-trash-library>Повторить</button>`;
  return `<section class="app-trash-panel" tabindex="-1" aria-label="Блоки и корзина"><button type="button" class="text-button" data-trash-back>← К редактированию страницы</button>${panel.error&&panel.mode!=='error'?`<p role="alert">${e(panel.error)}</p>`:''}${body}</section>`;
 }
 function bind(host){
  const one=selector=>host.querySelector(selector),many=selector=>host.querySelectorAll(selector);
  one('[data-trash-back]')?.addEventListener('click',()=>{if(!allowed())return;serial++;panel=null;draw();});
  one('[data-trash-retry]')?.addEventListener('click',()=>pending()&&submit(pending()));
  many('[data-trash-library]').forEach(button=>button.onclick=library);
  one('[data-trash-manage]')?.addEventListener('click',manage);
  one('[data-trash-more]')?.addEventListener('click',more);
  many('[data-trash-filter]').forEach(button=>button.onclick=()=>{if(!allowed())return;panel.hiddenOnly=button.dataset.trashFilter==='hidden';draw();});
  many('[data-trash-select]').forEach(button=>button.onclick=()=>select(button.dataset.trashSelect));
  many('[data-trash-remove]').forEach(button=>button.onclick=()=>remove(button.dataset.trashRemove));
  many('[data-trash-restore]').forEach(button=>button.onclick=()=>{if(!allowed())return;const item=panel.items.find(item=>item.id===button.dataset.trashRestore);if(item)show({mode:'restore',item});});
  one('[data-trash-confirm-remove]')?.addEventListener('click',()=>prepare('remove'));
  one('[data-trash-confirm-restore]')?.addEventListener('click',()=>prepare('restore',panel.item.id));
  host.querySelector('.app-trash-panel')?.focus({preventScroll:true});
 }
 return{active,render,bind,manage,library,remove};
}
