const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({structuredClone});vm.runInContext(fs.readFileSync(path.join(__dirname,'page-block-trash.js'),'utf8').replaceAll('export ',''),context);
const clone=value=>JSON.parse(JSON.stringify(value));
const def=blocks=>({version:1,blocks});
function harness(blocks=[],saved=null){
 let definition=def(blocks),name='Draft page',revision=3,pending=saved?clone(saved):null,owned=true,durable=true,collects=0,serial=0,stored=pending?clone(pending):null;
 const calls=[],messages=[],selected=[],applied=[],busy=[],nodes=[];
 const host={html:'',querySelector:s=>nodes.find(node=>node.selector===s)||null,querySelectorAll:s=>nodes.filter(node=>node.selector===s)};
 const draw=()=>{host.html=editor.render();nodes.length=0;for(const tag of host.html.match(/<button\b[^>]*>/g)||[]){const attrs=[...tag.matchAll(/\b(data-trash-[a-z-]+)(?:="([^"]*)")?/g)];for(const [,key,value] of attrs)nodes.push({selector:`[${key}]`,disabled:/\bdisabled/.test(tag),dataset:{[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:value},addEventListener(type,handler){this[`on${type}`]=handler;}});}editor.bind(host);};
 const editor=context.createPageBlockTrashEditor({escapeHTML:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),uid:()=>`request-${++serial}`,owns:()=>owned,collect:()=>{collects++;return true;},getDefinition:()=>definition,getName:()=>name,getRevision:()=>revision,pageId:'page',persist:()=>{if(!durable)return false;stored=clone(pending);return true;},getPending:()=>pending,setPending:value=>pending=value,draw,setBusy:value=>busy.push(value),request:(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject})),toast:message=>messages.push(message),normalize:clone,onSelect:id=>selected.push(id),onApplied:async(result,savedName,kind)=>{definition=result.definition;name=result.pageName||savedName;revision=result.revision;stored=clone(pending);applied.push({result,kind});draw();}});
 const click=selector=>{const node=host.querySelector(selector);assert.ok(node,`missing ${selector} in ${host.html}`);return node.onclick();};
 return{editor,host,calls,messages,selected,applied,busy,draw,click,get pending(){return pending;},get stored(){return stored;},get collects(){return collects;},setOwned:value=>owned=value,setDurable:value=>durable=value,setDefinition:value=>definition=value,setName:value=>name=value};
}

test('removal includes all descendants and names live dependencies, including hidden all/any conditions',()=>{
 const source=def([{id:'g',kind:'group'},{id:'t',kind:'tracker',parentId:'g',items:[{id:'one',label:'Read'}]},{id:'p',kind:'progress',source:'t',parentId:'g'},{id:'hidden',kind:'text',title:'Next day',hidden:true,visibility:{mode:'any',conditions:[{source:'t'},{source:'outside'}]}},{id:'jump',kind:'button',title:'Jump',source:'g'},{id:'progress',kind:'progress',title:'Summary',source:'t'},{id:'text',kind:'text',source:'t'},{id:'records',kind:'records',collectionId:'g',recordBindings:{title:{fieldId:'t'}}}]);
 const before=JSON.stringify(source),plan=context.blockRemovalPlan(source,'g');
 assert.deepEqual(Array.from(plan.blocks,b=>b.id),['g','t','p']);assert.deepEqual(Array.from(plan.dependencies,d=>d.blockId),['hidden','jump','progress']);assert.equal(JSON.stringify(source),before);
 assert.equal(context.blockRemovalPlan(source,'missing').blocks.length,0);
});

test('hidden state names ancestor and distinguishes own hidden flag from a display condition',()=>{
 const definition=def([{id:'g',kind:'group',hidden:true,title:'Morning'},{id:'inner',kind:'group',parentId:'g'},{id:'t',kind:'text',parentId:'inner'},{id:'own',kind:'text',hidden:true,parentId:'g'},{id:'condition',kind:'text',visibility:{source:'t'}}]);
 assert.equal(context.blockHiddenState(definition,definition.blocks[2]).targetId,'g');assert.match(context.blockHiddenState(definition,definition.blocks[2]).label,/Morning/);
 assert.equal(context.blockHiddenState(definition,definition.blocks[3]).targetId,'own');assert.equal(context.blockHiddenState(definition,definition.blocks[4]).hidden,false);
});

test('capacity management lists hidden blocks and offers deletion rather than a dead-end toast',()=>{
 const h=harness(Array.from({length:40},(_,i)=>({id:`b${i}`,kind:'text',title:`Block ${i}`,hidden:true})));h.editor.manage();
 assert.match(h.host.html,/40\/40/);assert.match(h.host.html,/Скрытые · 40/);assert.equal(h.host.querySelectorAll('[data-trash-remove]').length,40);
 h.click('[data-trash-remove]');assert.match(h.host.html,/В корзину и сохранить страницу/);assert.match(h.host.html,/Освободится мест: <strong>1/);assert.match(h.host.html,/Draft page/);
});

test('dependency confirmation is disabled, shows names and opens the exact dependent block',()=>{
 const h=harness([{id:'source',kind:'tracker',title:'Reading'},{id:'next',kind:'text',title:'Next step',hidden:true,visibility:{source:'source'}}]);h.editor.remove('source');
 assert.equal(h.host.querySelector('[data-trash-confirm-remove]').disabled,true);assert.match(h.host.html,/Next step/);h.click('[data-trash-confirm-remove]');assert.equal(h.calls.length,0);
 h.click('[data-trash-select]');assert.deepEqual(h.selected,['next']);assert.equal(h.editor.active(),false);
});

test('removal persists immutable draft and request before network, then freezes unknown outcome',async()=>{
 const blocks=[{id:'g',kind:'group',title:'Reading'},{id:'t',kind:'tracker',parentId:'g',items:[{id:'one',label:'Read'}]}],h=harness(blocks);h.editor.remove('g');
 const sending=h.click('[data-trash-confirm-remove]'),body=h.calls[0].options.body;
 assert.equal(h.calls[0].url,'/api/workspace/pages/page/app/trash');assert.equal(JSON.stringify(h.stored.body),body);assert.equal(h.stored.body.expectedRevision,3);assert.equal(h.stored.body.pageName,'Draft page');assert.equal(h.stored.body.blockId,'g');assert.equal(h.collects,2);
 blocks[0].title='External mutation';assert.equal(h.pending.body.definition.blocks[0].title,'Reading');
 h.calls[0].reject(new Error('Network unavailable'));await sending;assert.ok(h.pending);assert.match(h.host.html,/Ответ сервера ещё не подтверждён/);
 h.editor.manage();h.editor.remove('t');assert.match(h.host.html,/Проверить и продолжить/);assert.equal(h.calls.length,1);
 const retry=h.click('[data-trash-retry]');assert.equal(h.calls[1].options.body,body);
 h.calls[1].resolve({revision:4,pageName:'Draft page',definition:def([]),rootBlockId:'g'});await retry;assert.equal(h.pending,null);assert.equal(h.stored,null);assert.equal(h.applied[0].kind,'remove');
});

test('reload repeats the same stored operation even when current page revision or name changed',async()=>{
 const saved={kind:'restore',trashId:'deleted',body:{definition:def([{id:'current',kind:'text'}]),pageName:'Original name',expectedRevision:1,clientRequestId:'stable'}};
 const h=harness([{id:'later',kind:'text'}],saved);h.setName('Later name');h.draw();assert.match(h.host.html,/восстановления/);
 const retry=h.click('[data-trash-retry]');assert.equal(h.calls[0].url,'/api/workspace/pages/page/app/trash/deleted/restore');assert.deepEqual(JSON.parse(h.calls[0].options.body),saved.body);
 h.calls[0].resolve({revision:5,definition:def([{id:'old',kind:'tracker',items:[{id:'original',label:'Same item'}]}]),rootBlockId:'old',marks:{'old:original':true},sheets:{old:{values:{original:'77'}}}});await retry;
 assert.equal(h.applied[0].result.marks['old:original'],true);assert.equal(h.applied[0].result.sheets.old.values.original,'77');assert.equal(h.pending,null);
});

test('local receipt storage failure prevents the mutation entirely',()=>{
 const h=harness([{id:'root',kind:'text'}]);h.editor.remove('root');h.setDurable(false);h.click('[data-trash-confirm-remove]');
 assert.equal(h.calls.length,0);assert.equal(h.pending,null);assert.match(h.host.html,/страница не изменена/);
});

test('definite conflicts keep the draft and show the server dependency instead of silently repairing it',async()=>{
 const h=harness([{id:'root',kind:'text'}]);h.editor.remove('root');const send=h.click('[data-trash-confirm-remove]');h.calls[0].reject(Object.assign(new Error('Сначала восстановите группу «Утро»'),{status:409}));await send;
 assert.equal(h.pending,null);assert.match(h.host.html,/Сначала восстановите группу «Утро»/);assert.match(h.host.html,/В корзину и сохранить страницу/);assert.equal(h.applied.length,0);
});

test('restoration requires capacity and offers a direct route to free it',async()=>{
 const h=harness(Array.from({length:39},(_,i)=>({id:`b${i}`,kind:'text',hidden:true})));const loading=h.editor.library();h.calls[0].resolve({items:[{id:'entry',title:'Morning',blockCount:2,removedAt:'2026-09-14T10:00:00Z'}],nextCursor:''});await loading;
 assert.match(h.host.html,/Загружено записей: 1/);h.click('[data-trash-restore]');assert.equal(h.host.querySelector('[data-trash-confirm-restore]').disabled,true);
 h.click('[data-trash-confirm-restore]');assert.equal(h.calls.length,1);assert.match(h.host.html,/Нужно мест: 2. Свободно: 1/);h.click('[data-trash-manage]');assert.equal(h.host.querySelectorAll('[data-trash-remove]').length,39);
});

test('restore submits current draft atomically and never remaps original identifiers',async()=>{
 const h=harness([{id:'draft',kind:'text',text:'Unsaved'}]);const loading=h.editor.library();h.calls[0].resolve({items:[{id:'entry',title:'Morning',blockCount:2}],nextCursor:''});await loading;h.click('[data-trash-restore]');const send=h.click('[data-trash-confirm-restore]');
 const body=JSON.parse(h.calls[1].options.body);assert.equal(body.definition.blocks[0].id,'draft');assert.equal(body.definition.blocks[0].text,'Unsaved');assert.equal(body.expectedRevision,3);assert.equal(body.blockId,undefined);
 h.calls[1].resolve({revision:4,definition:def([{id:'draft',kind:'text'},{id:'original-group',kind:'group'},{id:'original-tracker',parentId:'original-group',kind:'tracker'}]),rootBlockId:'original-group'});await send;assert.equal(h.applied[0].result.rootBlockId,'original-group');
});

test('responses owned by another account cannot apply data or clear the saved receipt',async()=>{
 const h=harness([{id:'root',kind:'text'}]);h.editor.remove('root');const send=h.click('[data-trash-confirm-remove]');h.setOwned(false);h.calls[0].resolve({revision:4,definition:def([])});await send;
 assert.equal(h.applied.length,0);assert.ok(h.stored);assert.ok(h.pending);assert.equal(h.messages.length,0);
});

test('retry access errors do not prove that the original operation failed and keep its durable receipt',async()=>{
 for(const status of [401,403,404]){
  const h=harness([{id:'root',kind:'text'}]);h.editor.remove('root');const send=h.click('[data-trash-confirm-remove]'),exact=h.calls[0].options.body;
  h.calls[0].reject(new TypeError('Response lost'));await send;const retry=h.click('[data-trash-retry]');h.calls[1].reject(Object.assign(new Error('Войдите в аккаунт или проверьте доступ'),{status}));await retry;
  assert.ok(h.pending);assert.equal(JSON.stringify(h.stored.body),exact);assert.match(h.host.html,/Войдите в аккаунт/);assert.match(h.host.html,/Проверить и продолжить/);h.editor.manage();assert.equal(h.host.querySelector('[data-trash-back]'),null);
 }
});

test('trash pagination keeps loaded metadata on errors and does not duplicate rows or concurrent requests',async()=>{
 const h=harness();const loading=h.editor.library();assert.equal(h.calls[0].url,'/api/workspace/pages/page/app/trash?limit=50');h.calls[0].resolve({items:[{id:'one',title:'First',blockCount:1}],nextCursor:'opaque+/='});await loading;
 const more=h.click('[data-trash-more]');assert.equal(h.calls[1].url,'/api/workspace/pages/page/app/trash?limit=50&cursor=opaque%2B%2F%3D');h.click('[data-trash-more]');assert.equal(h.calls.length,2);
 h.calls[1].reject(new Error('Connection unavailable'));await more;assert.match(h.host.html,/First/);assert.match(h.host.html,/Connection unavailable/);assert.match(h.host.html,/Показать ещё/);
 const retry=h.click('[data-trash-more]');assert.equal(h.calls[2].url,h.calls[1].url);h.calls[2].resolve({items:[{id:'one',title:'First',blockCount:1},{id:'two',title:'Second',blockCount:1}],nextCursor:''});await retry;
 assert.equal(h.host.querySelectorAll('[data-trash-restore]').length,2);assert.equal(h.host.querySelector('[data-trash-more]'),null);
});

test('a stale paginated response cannot take over after returning to the page',async()=>{
 const h=harness();const loading=h.editor.library();h.calls[0].resolve({items:[],nextCursor:'next'});await loading;const more=h.click('[data-trash-more]');h.click('[data-trash-back]');h.calls[1].resolve({items:[{id:'private',title:'Private result',blockCount:1}],nextCursor:''});await more;
 assert.equal(h.editor.active(),false);assert.equal(h.host.html,'');
});
