const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const runFunction = (context, name, next) => vm.runInContext(source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`)), context);

test('device choice follows the same 820px boundary as navigation', () => {
  let mobile = false;
  const context = vm.createContext({window:{matchMedia(query){assert.equal(query,'(max-width: 820px)'); return {matches:mobile};}}});
  runFunction(context,'interfaceDevice','deviceSelector');
  assert.equal(vm.runInContext('interfaceDevice()', context),'desktop');
  mobile = true;
  assert.equal(vm.runInContext('interfaceDevice()', context),'mobile');
});

test('mobile controls omit desktop geometry and reorder arrow buttons', () => {
  const context = vm.createContext({toolbarNames:{help:'Help'},typeMeta:{},icon:()=>'',escapeHTML:v=>v});
  runFunction(context,'renderLayoutFields','readLayoutFields');
  context.layout={contentWidth:1500,sidebarWidth:238,toolbarActions:['help'],quickActions:[]};
  const mobile=vm.runInContext("renderLayoutFields(layout,'mobile')",context);
  const desktop=vm.runInContext("renderLayoutFields(layout,'desktop')",context);
  assert.doesNotMatch(mobile,/name="(?:contentWidth|sidebarWidth|sidebarSide)"/);
  assert.match(desktop,/name="contentWidth"/);
  assert.match(mobile,/data-reorder-handle/);
  assert.doesNotMatch(mobile,/data-toolbar-(?:up|down)/);
});

test('saving another device does not replace the currently visible profile', async () => {
  const desktop={device:'desktop',navOrder:['work']},mobile={device:'mobile',navOrder:['personal']};
  const state={activeWorkspaceId:'a',interfacePreferences:desktop,interfaceProfiles:{desktop,mobile}};
  let resolve;
  const context=vm.createContext({state,interfaceDevice:()=> 'desktop',api:(url)=>{assert.equal(url,'/api/interface/preferences?device=mobile');return new Promise(done=>{resolve=done;});}});
  vm.runInContext(source.slice(source.indexOf('async function saveInterfacePreferences('),source.indexOf('function openInterfaceSettings(')),context);
  const save=vm.runInContext('saveInterfacePreferences({device:"mobile",navOrder:["chat"]})',context);
  resolve({device:'mobile',navOrder:['chat']}); await save;
  assert.equal(state.interfacePreferences,desktop);
  assert.deepEqual(state.interfaceProfiles.mobile.navOrder,['chat']);
  const late=vm.runInContext('saveInterfacePreferences({device:"mobile"})',context);
  state.activeWorkspaceId='b';
  resolve({device:'mobile',navOrder:['foreign']}); await late;
  assert.deepEqual(state.interfaceProfiles.mobile.navOrder,['chat']);
});

function reorderHarness(fail = false) {
  let committed=0;
  const handlers={};
  const list={children:[],isConnected:true,captured:false,append(node){this.children.push(node);},closest(){return null;},addEventListener(name,fn){handlers[name]=fn;},setPointerCapture(){this.captured=true;},hasPointerCapture(){return this.captured;},releasePointerCapture(){this.captured=false;},insertBefore(row,anchor){this.children=this.children.filter(item=>item!==row);this.children.splice(anchor?this.children.indexOf(anchor):this.children.length,0,row);}};
  const rows=['a','b','c'].map(key=>{
    const handle={handlers:{},setAttribute(){},focus(){},addEventListener(name,fn){this.handlers[name]=fn;},isConnected:true};
    const row={key,handle,classList:{add(){},remove(){}},getBoundingClientRect(){const top=list.children.indexOf(this)*60;return{top,bottom:top+60,height:60};},before(item){list.insertBefore(item,this);},after(item){list.insertBefore(item,this.nextSibling);},get nextSibling(){return list.children[list.children.indexOf(this)+1]||null;}};
    list.children.push(row);return row;
  });
  const context=vm.createContext({document:{createElement:()=>({setAttribute(){}}),scrollingElement:{scrollBy(){}}},innerHeight:600,$:(selector,row)=>row.handle,$$:()=>list.children.filter(row=>row.key),toast(){}});
  runFunction(context,'bindReorderList','openNavigationSettings');
  context.list=list;context.onCommit=()=>{committed++;if(fail)throw new Error('offline');};
  vm.runInContext('bindReorderList(list,"[row]",onCommit)',context);
  const event=(values={})=>({button:0,isPrimary:true,pointerId:1,clientX:10,clientY:20,preventDefault(){},...values});
  return {rows,list,order:()=>list.children.filter(row=>row.key).map(row=>row.key),committed:()=>committed,
    start:()=>rows[0].handle.handlers.pointerdown(event()),move:y=>handlers.pointermove(event({clientY:y})),end:cancel=>handlers[cancel?'pointercancel':'pointerup'](event({type:cancel?'pointercancel':'pointerup'})),key:(key)=>rows[0].handle.handlers.keydown(event({key}))};
}

test('drag reorders at release, but a tap never changes or saves order', async () => {
  const h=reorderHarness();h.start();h.move(23);await h.end(false);assert.equal(h.committed(),0);
  h.start();h.move(170);await h.end(false);assert.deepEqual(h.order(),['b','c','a']);assert.equal(h.committed(),1);
});

test('cancelled drag restores original order without writing it', async () => {
  const h=reorderHarness();h.start();h.move(170);await h.end(true);assert.deepEqual(h.order(),['a','b','c']);assert.equal(h.committed(),0);
});

test('keyboard reorder works; a failed persistence restores previous order', async () => {
  const h=reorderHarness();await h.key('End');assert.deepEqual(h.order(),['b','c','a']);
  await h.key('Home');assert.deepEqual(h.order(),['a','b','c']);
  const failure=reorderHarness(true);failure.start();failure.move(170);await failure.end(false);assert.deepEqual(failure.order(),['a','b','c']);
});

test('select opens in the top layer and stays inside desktop and mobile bounds', () => {
  let mobile=false, shown=false, top=100;
  const menu={style:{},scrollHeight:200,matches:()=>shown,showPopover(){shown=true;}};
  const trigger={getBoundingClientRect:()=>({left:50,right:220,width:170,top,bottom:top+44})};
  const context=vm.createContext({window:{innerWidth:1000,innerHeight:600,matchMedia:()=>({matches:mobile})},$:selector=>selector.includes('trigger')?trigger:menu});
  runFunction(context,'positionCustomSelectMenu','syncCustomSelect');
  vm.runInContext('positionCustomSelectMenu({})',context);
  assert.equal(shown,true);assert.equal(menu.style.top,'150px');assert.equal(menu.style.width,'180px');
  top=530;vm.runInContext('positionCustomSelectMenu({})',context);assert.equal(menu.style.top,'324px');
  mobile=true;context.window.innerWidth=320;context.window.innerHeight=740;
  vm.runInContext('positionCustomSelectMenu({})',context);assert.equal(menu.style.width,'296px');assert.equal(menu.style.bottom,'12px');
});
