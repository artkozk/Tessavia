// The library contains schema, never page marks, record values or sheet inputs.
export function componentSubtree(definition, rootId) {
 const ids=new Set([rootId]);let changed=true;
 while(changed){changed=false;for(const b of definition.blocks)if(b.parentId&&ids.has(b.parentId)&&!ids.has(b.id)){ids.add(b.id);changed=true;}}
 if(!definition.blocks.some(b=>b.id===rootId))throw new Error('Выберите блок, который нужно сохранить.');
 const blocks=structuredClone(definition.blocks.filter(b=>ids.has(b.id)));
 for(const b of blocks){if(b.id===rootId)b.parentId='';if(b.source&&!ids.has(b.source)){if(['progress','button'].includes(b.kind))throw new Error(`«${b.title||'Блок'}» связан с блоком вне группы. Перенесите их в одну группу и сохраните её целиком.`);delete b.source;}const visit=c=>{if(!c)return;if(c.source&&!ids.has(c.source))throw new Error(`Условие «${b.title||'блока'}» зависит от отметок вне группы. Включите источник отметок в ту же группу.`);for(const child of c.conditions||[])visit(child);};visit(b.visibility);}
 return{version:1,blocks};
}

export function componentInsertTargets(host, component) {
 const groups=new Map(host.blocks.filter(b=>b.kind==='group').map(b=>[b.id,b]));
 const depth=(b,lookup)=>{let n=0,parent=b.parentId;const seen=new Set();while(parent){if(seen.has(parent))return 99;seen.add(parent);n++;parent=lookup.get(parent)?.parentId;}return n;};
 const lookup=new Map(component.blocks.map(b=>[b.id,b])),height=Math.max(0,...component.blocks.map(b=>depth(b,lookup)));
 return host.blocks.filter(b=>b.kind==='group'&&depth(b,groups)+1+height<=4);
}

export function normalizeComponentDrafts(value) {
 const drafts=Object.create(null);
 if(!value||typeof value!=='object'||Array.isArray(value))return drafts;
 for(const [id,draft] of Object.entries(value))if(/^[a-zA-Z0-9_-]{1,64}$/.test(id)&&draft&&typeof draft==='object'&&!Array.isArray(draft)&&typeof draft.name==='string'&&typeof draft.description==='string')drafts[id]={name:draft.name,description:draft.description};
 return drafts;
}

export function createPageComponentEditor({escapeHTML:e,uid,request,owns,collect,getDefinition,getName,getSelection,getRevision,pageId,persist,draw,setBusy,getPending,setPending,onInserted,toast,normalize,markup,stylePreview,getDraft=()=>null,setDraft=()=>{},clearDraft=()=>{}}) {
 let panel=null,serial=0,busy=false;
 const pending=()=>getPending();
 const active=()=>Boolean(panel||pending());
 const show=value=>{panel=value;draw();};
 const parentFor=(component)=>{const selected=getDefinition().blocks.find(b=>b.id===getSelection()),parent=selected?.kind==='group'?selected.id:selected?.parentId||'';return componentInsertTargets(getDefinition(),component).some(b=>b.id===parent)?parent:'';};
 async function library(){
  if(!owns()||pending())return;const turn=++serial;show({mode:'loading'});
  try{const items=await request('/api/page-app/components');if(owns()&&turn===serial)show({mode:'library',items});}catch(error){if(owns()&&turn===serial)show({mode:'error',message:error.message});}
 }
 async function preview(id){
  if(!owns()||pending())return;const turn=++serial;show({mode:'loading'});
  try{const item=await request(`/api/page-app/components/${id}`);if(owns()&&turn===serial)show({mode:'preview',item,parentId:parentFor(item.definition)});}catch(error){if(owns()&&turn===serial)show({mode:'error',message:error.message});}
 }
 function save(){
  if(!owns()||pending()||!collect())return;
  try{const definition=componentSubtree(normalize(getDefinition()),getSelection()),root=definition.blocks.find(b=>!b.parentId),draft=getDraft(root.id);show({mode:'save',definition,rootId:root.id,name:draft?.name??Array.from(root.title||'Мой блок').slice(0,80).join(''),description:draft?.description??''});}catch(error){toast(error.message,true);}
 }
 async function submit(body,kind){
  if(!owns()||busy)return;
  const resuming=Boolean(pending());
  if(!pending()){
   setPending(structuredClone({kind,body}));
   // A retry key must survive closing or reloading before the mutation is sent.
   if(persist()===false){setPending(null);show({...panel,error:'Не удалось сохранить запрос на устройстве. Освободите место в браузере и повторите; запрос не отправлен.'});return;}
  }
  const operation=pending(),originPanel=panel;busy=true;setBusy(true);
  try{
   const result=await request(operation.kind==='insert'?`/api/workspace/pages/${pageId}/app/component`:'/api/page-app/components',{method:'POST',body:JSON.stringify(operation.body)});
   if(!owns())return;setPending(null);setBusy(false);
   if(operation.kind==='insert'){panel=null;await onInserted(result,operation.body.pageName);if(owns())toast('Свой блок вставлен. Страница сохранена; копию можно менять независимо.');}
   else{clearDraft(operation.body.rootBlockId);persist();show({mode:'saved',item:result});toast('Свой блок сохранён в личной библиотеке');}
  }catch(error){
   if(owns()){
    // Permission or availability may change after a previous request committed.
    // Such a retry response cannot disprove that earlier unknown result.
    const definite=[400,401,403,404,409,413,422].includes(error.status)&&!(resuming&&[401,403,404].includes(error.status));
    if(definite){setPending(null);persist();}
    setBusy(false);
    if(definite&&operation.kind==='create'){
     const draft=getDraft(operation.body.rootBlockId)||operation.body;
     panel={mode:'save',definition:operation.body.definition,rootId:operation.body.rootBlockId,name:draft.name,description:draft.description,error:error.message};
    }else if(definite&&originPanel?.mode==='preview')panel={...originPanel,error:error.message};
    else panel={mode:'error',message:error.message};
    draw();toast(error.message,true);
   }
  }finally{busy=false;setBusy(false);}
 }
 function render(){
  if(!active())return '';
  const op=pending();if(op)return `<section class="app-component-panel" tabindex="-1" aria-label="Результат операции со своим блоком"><h3>Проверим результат ${op.kind==='insert'?'вставки':'сохранения'}</h3><p role="status">Ответ ещё не подтверждён. Повторная проверка использует тот же запрос и не создаст вторую копию. Черновик сохранён на этом устройстве.</p>${panel?.message?`<p role="alert">${e(panel.message)}</p>`:''}<button type="button" class="primary" data-component-retry>Проверить и продолжить</button></section>`;
  let body='';
  if(panel.mode==='loading')body='<p role="status">Загружаем свои блоки…</p>';
  if(panel.mode==='library')body=`<h3>Мои блоки</h3><p class="muted">Сохранённые вами части страниц. Каждая вставка — отдельная редактируемая копия.</p><div class="app-component-list">${panel.items.map(item=>`<article><div><h4>${e(item.name)}</h4>${item.description?`<p>${e(item.description)}</p>`:''}</div><button type="button" class="secondary" data-component-preview="${e(item.id)}">Посмотреть</button></article>`).join('')||'<p>Пока нет своих блоков. Вернитесь в редактор, соберите группу и выберите «Сохранить как свой блок» в её свойствах.</p>'}</div>`;
  if(panel.mode==='save')body=`<h3>Сохранить как свой блок</h3><p class="muted">Сохраняются текст, оформление, формулы и внутренние связи. Личные отметки, введённые числа и записи не копируются. Библиотека доступна только вам.</p><form data-component-save-form><label>Название своего блока<input name="name" value="${e(panel.name)}" maxlength="80" required></label><label>Описание<textarea name="description" maxlength="500" rows="3">${e(panel.description)}</textarea></label><div class="app-canvas app-component-preview">${markup(panel.definition,{},e,true)}</div><button type="submit" class="primary">Сохранить в мои блоки</button></form>`;
  if(panel.mode==='preview'){const d=panel.item.definition,count=getDefinition().blocks.length+d.blocks.length;body=`<h3>${e(panel.item.name)}</h3>${panel.item.description?`<p>${e(panel.item.description)}</p>`:''}<div class="app-canvas app-component-preview">${markup(d,{},e,true)}</div><label>Разместить внутри<select data-component-parent><option value="">На странице</option>${componentInsertTargets(getDefinition(),d).map(b=>`<option value="${e(b.id)}" ${panel.parentId===b.id?'selected':''}>${e(b.title||'Группа')}</option>`).join('')}</select></label><p>Вставка сохранит текущие изменения страницы «${e(getName())}». ${d.collections?.length?'Для списков и форм будут созданы отдельные пустые доски. ':''}Отметки и введённые числа начнутся с пустого состояния.</p>${count>40?'<p role="alert">Вместе с копией получится больше 40 блоков. Освободите место или выберите другую страницу.</p>':''}<button type="button" class="primary" data-component-insert ${count>40?'disabled':''}>Вставить и сохранить страницу</button>`;}
  if(panel.mode==='saved')body=`<h3>Блок «${e(panel.item.name)}» сохранён</h3><p>Откройте другую свою страницу → Конструктор → Мои блоки, чтобы вставить независимую копию. Изменения исходной страницы пока остаются в черновике.</p><button type="button" class="secondary" data-component-library>Открыть мои блоки</button>`;
  if(panel.mode==='error')body=`<h3>Не удалось завершить</h3><p role="alert">${e(panel.message)}</p><button type="button" class="secondary" data-component-library>Открыть мои блоки</button>`;
  return `<section class="app-component-panel" tabindex="-1" aria-label="Свои блоки"><button type="button" class="text-button" data-component-back>← К редактированию страницы</button>${panel.error?`<p role="alert">${e(panel.error)}</p>`:''}${body}</section>`;
 }
 function bind(host){
  const one=selector=>host.querySelector(selector);
  one('[data-component-back]')?.addEventListener('click',()=>{if(!owns()||pending())return;serial++;panel=null;draw();});
  one('[data-component-library]')?.addEventListener('click',library);
  host.querySelectorAll('[data-component-preview]').forEach(b=>b.onclick=()=>preview(b.dataset.componentPreview));
  one('[data-component-retry]')?.addEventListener('click',()=>{if(pending())return submit(pending().body,pending().kind);});
  const form=one('[data-component-save-form]');if(form){const remember=()=>{if(!owns()||busy||pending())return;panel.name=form.elements.name.value;panel.description=form.elements.description.value;setDraft(panel.rootId,{name:panel.name,description:panel.description});persist();};form.oninput=remember;form.onchange=remember;form.onsubmit=event=>{event.preventDefault();if(!owns()||busy||!form.reportValidity())return;remember();return submit({name:panel.name,description:panel.description,definition:panel.definition,rootBlockId:panel.rootId,clientRequestId:uid()},'create');};}
  const parent=one('[data-component-parent]');if(parent)parent.onchange=()=>panel.parentId=parent.value;
  one('[data-component-insert]')?.addEventListener('click',()=>{if(!owns()||!collect()||!getName().trim())return toast('Укажите название страницы',true);let definition;try{definition=normalize(getDefinition());}catch(error){return toast(error.message,true);}return submit({componentId:panel.item.id,clientRequestId:uid(),parentId:panel.parentId,pageName:getName(),expectedRevision:getRevision(),definition},'insert');});
  if(panel?.mode==='preview')stylePreview(host,panel.item.definition);if(panel?.mode==='save')stylePreview(host,panel.definition);
  const surface=host.querySelector('.app-component-panel');surface?.focus({preventScroll:true});surface?.scrollIntoView({block:'start'});
 }
 return{active,render,bind,library,save};
}
