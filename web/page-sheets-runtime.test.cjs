const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const conflictError = () => Object.assign(new Error('Changed on another device'), {status:409});
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

// A small event/DOM model for the sheet runtime. Repainting replaces hosts and
// disconnects the old nodes; currentTarget clears when event dispatch returns.
class Node {
  constructor() { this.disabled=false; this.hidden=true; this.textContent=''; this.value=''; this.dataset={}; this.isConnected=true; this.handlers={}; this.children={}; }
  set disabled(value) { this._disabled=Boolean(value); }
  get disabled() { return this._disabled; }
  set innerHTML(value) { this.html=value; this.children={}; for(const name of ['data-sheet-refresh','data-sheet-accept']) if(value.includes(name)) this.children[`[${name}]`]=new Node(); }
  get innerHTML() { return this.html||''; }
  querySelector(selector) { return this.children[selector]||null; }
  addEventListener(type,handler) { this.handlers[type]=handler; }
  click() { assert.equal(this.disabled,false,'clicked a disabled control'); const event={currentTarget:this,target:this}; const result=(this.onclick||this.handlers.click)?.(event); event.currentTarget=null; return result; }
}
function makeHost(block) {
  const host=new Node();
  for(const name of ['save','undo','status','conflict'])host.children[`[data-sheet-${name}]`]=new Node();
  const inputs=[];
  for(const row of block.sheet.rows){
    host.children[`[data-sheet-error="${row.id}"]`]=new Node();
    if(row.kind==='input'){const input=new Node();input.dataset.sheetInput=row.id;inputs.push(input);}else host.children[`[data-sheet-result="${row.id}"]`]=new Node();
  }
  host.querySelectorAll=selector=>selector==='[data-sheet-input]'?inputs:[];
  host.input=id=>inputs.find(node=>node.dataset.sheetInput===id);
  host.edit=(id,value)=>{const input=host.input(id);assert.equal(input.disabled,false);input.value=value;input.oninput({target:input});};
  host.save=host.querySelector('[data-sheet-save]');host.undo=host.querySelector('[data-sheet-undo]');host.conflict=host.querySelector('[data-sheet-conflict]');
  return host;
}
function harness(api){
  const context=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(__dirname,'page-sheets.js'),'utf8').replaceAll('export ',''),context);
  const state={me:{id:1},activeWorkspaceId:'workspace',view:'page:page'};
  const block={id:'block',kind:'sheet',sheet:{rows:[{id:'value',label:'Private value',kind:'input',precision:2},{id:'result',label:'Result',kind:'formula',precision:2,start:{rowId:'value'},steps:[]}]}};
  const definition={version:1,blocks:[block]};
  let current={page:{id:'page'},workspace:'workspace',definition,revision:1,sheets:{block:{values:{value:'1'},revision:1}}}, host=null, reloads=0;
  const requests=[],toasts=[];
  const ui=context.createPageSheetUI({state,api:async(path,options)=>{requests.push({path,options});return api(path,options);},escapeHTML:escape,toast:(...args)=>toasts.push(args)});
  const valid=(page,workspace)=>state.activeWorkspaceId===workspace&&state.view===`page:${page.id}`;
  let reload=()=>{};
  function mount(next=current){current=next;if(host)host.isConnected=false;host=makeHost(current.definition.blocks[0]);ui.mount({querySelector:()=>host},current.definition,current,{valid,reload:async()=>{reloads++;await reload();}});return host;}
  return {state,ui,requests,toasts,mount,setReload:fn=>reload=fn,get host(){return host;},get current(){return current;},get reloads(){return reloads;}};
}

test('sheet input survives a tracker repaint without being stored in its definition',()=>{
  const h=harness(()=>{throw Error('Unexpected request');});h.mount();const schema=JSON.stringify(h.current.definition);
  h.host.edit('value','123,456');h.mount();assert.equal(h.host.input('value').value,'123,456');assert.equal(h.host.save.disabled,false);assert.equal(JSON.stringify(h.current.definition),schema);assert.equal(h.requests.length,0);
});

test('acknowledged PUT stays current after a GET/repaint during the request',async()=>{
  const pending=deferred(),h=harness(()=>pending.promise);h.mount();h.host.edit('value','2');const saving=h.host.save.click();
  h.mount(structuredClone(h.current));assert.equal(h.host.input('value').disabled,true);
  pending.resolve({values:{value:'2'},revision:2});await saving;assert.equal(h.host.input('value').value,'2');assert.equal(h.host.save.disabled,true);
  h.mount();assert.equal(h.host.input('value').value,'2','a repaint replaced the acknowledged save with an older GET');
  h.host.edit('value','3');const next=h.host.save.click();await next;const payload=JSON.parse(h.requests[1].options.body);assert.equal(payload.expectedValuesRevision,2);
});

test('value conflict comparison and its accept action survive repaint',async()=>{
  let requests=0;const fresh={revision:1,sheets:{block:{values:{value:'3'},revision:2}}};
  const h=harness(async()=>{if(++requests===1)throw conflictError();return fresh;});h.mount();h.host.edit('value','2');await h.host.save.click();
  await h.host.conflict.querySelector('[data-sheet-refresh]').click();assert.ok(h.host.conflict.querySelector('[data-sheet-accept]'));assert.equal(h.host.save.disabled,true);
  h.mount();const accept=h.host.conflict.querySelector('[data-sheet-accept]');assert.ok(accept,'repaint lost the only conflict recovery action');await accept.click();
  assert.equal(h.host.input('value').value,'2');assert.equal(h.host.save.disabled,false);h.host.undo.click();assert.equal(h.host.input('value').value,'3');
  h.mount();assert.equal(h.host.input('value').value,'3','undo restored an obsolete server value after repaint');
});

test('failed conflict refresh can be retried after currentTarget clears',async()=>{
  let requests=0;const h=harness(async()=>{if(++requests===1)throw conflictError();throw new Error('Network unavailable');});h.mount();h.host.edit('value','2');await h.host.save.click();
  const refresh=h.host.conflict.querySelector('[data-sheet-refresh]');await assert.doesNotReject(refresh.click());assert.equal(refresh.disabled,false);
});

test('schema conflict keeps input and requires explicit refreshed schema before resubmission',async()=>{
  let requests=0;const h=harness(async()=>{if(++requests===1)throw conflictError();if(requests===2)return fresh;return {values:{value:'2'},revision:4};});
  const fresh={...structuredClone(h.current),revision:2,sheets:{block:{values:{value:'8'},revision:3}}};fresh.definition.blocks[0].sheet.rows[0].label='Updated label';
  h.setReload(()=>h.mount(fresh));h.mount();h.host.edit('value','2');await h.host.save.click();await h.host.conflict.querySelector('[data-sheet-refresh]').click();
  assert.equal(h.reloads,0);assert.equal(h.host.save.disabled,true);await h.host.conflict.querySelector('[data-sheet-accept]').click();assert.equal(h.reloads,1);
  assert.equal(h.host.input('value').value,'2');await h.host.save.click();const body=JSON.parse(h.requests.at(-1).options.body);assert.deepEqual(body.values,{value:'2'});assert.equal(body.expectedRevision,2);assert.equal(body.expectedValuesRevision,3);
});

test('logout resets pending inputs and ignores previous account PUT response',async()=>{
  const pending=deferred(),h=harness(()=>pending.promise);h.mount();h.host.edit('value','private-account-one');h.host.edit('value','987');const saving=h.host.save.click();
  h.ui.reset();h.state.me={id:2};h.mount({...structuredClone(h.current),sheets:{block:{values:{value:'8'},revision:1}}});pending.resolve({values:{value:'987'},revision:2});await saving;
  assert.equal(h.host.input('value').value,'8');assert.equal(h.host.save.disabled,true);assert.equal(h.toasts.length,0);
});

test('logout/relogin to the same account still ignores an old pending save response',async()=>{
  const pending=deferred(),h=harness(()=>pending.promise);h.mount();h.host.edit('value','987');const saving=h.host.save.click();
  h.ui.reset();h.mount({...structuredClone(h.current),sheets:{block:{values:{value:'5'},revision:5}}});pending.resolve({values:{value:'987'},revision:2});await saving;
  assert.equal(h.host.input('value').value,'5');assert.equal(h.host.save.disabled,true);
});

test('page app integration rejects previous account GET before mounting its private sheets',async()=>{
  for(const reset of [false,true]){
    const first=deferred(),second=deferred(),mounted=[],root=new Node();let reads=0,resets=0;
    const state={me:{id:1},activeWorkspaceId:'workspace',view:'page:page',collections:[],records:[]};
    const c=vm.createContext({
      createPageSheetUI:()=>({mount:(_,__,current)=>mounted.push(current),reset:()=>resets++}),
      createPageFinanceUI:()=>({mount(){}}),updatePageFinanceConfig:()=>false,createPageMediaUI:()=>({mount(){}}),createPageDataUI:()=>({mount:()=>{}}),mountPageForms:()=>{},
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname,'page-apps.js'),'utf8').replaceAll('\r\n','\n').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
    c.applyAppStyles=()=>{};c.pageAppMarkup=()=>'<p>Page</p>';
    const ui=c.createPageAppUI({state,api:()=>++reads===1?first.promise:second.promise,escapeHTML:escape,icon:()=>'', $:selector=>selector==='#main-content'?root:null,$$:()=>[],toast:()=>{},canConfigureWorkspace:()=>true,formDependencies:{},dataDependencies:{}});
    const old=ui.render({id:'page',name:'Shared page'});state.me={id:2};if(reset)ui.resetPrivate();
    first.resolve({definition:{blocks:[]},marks:{},revision:1,sheets:{block:{values:{private:'987'},revision:1}}});await old;
    assert.equal(mounted.length,0,'old account data reached sheet mount');assert.equal(resets,reset?1:0);
    const fresh=ui.render({id:'page',name:'Shared page'});second.resolve({definition:{blocks:[]},marks:{},revision:1,sheets:{block:{values:{private:'5'},revision:1}}});await fresh;
    assert.equal(mounted.length,1);assert.equal(mounted[0].ownerId,2);assert.equal(mounted[0].sheets.block.values.private,'5');
  }
});
