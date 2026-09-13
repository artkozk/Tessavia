const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
function setup(){
  const classes=()=>{const items=new Set();return{contains:k=>items.has(k),add:k=>items.add(k),remove:k=>items.delete(k),toggle(k,on){on?items.add(k):items.delete(k)}}};
  const element=()=>({classList:classes(),style:{values:{},removeProperty(k){delete this.values[k]}},attrs:{},setAttribute(k,v){this.attrs[k]=v},focuses:0,focus(){this.focuses++},isConnected:true});
  const sidebar=element(),workspace=element(),backdrop=element(),button=element(),active=element(),nav=element(),body=element();
  let mobile=true,cancels=0;sidebar.cancelSwipe=()=>cancels++;
  const frames=[],state={};
  const context=vm.createContext({state,document:{activeElement:active,body},window:{matchMedia:()=>({matches:mobile})},requestAnimationFrame:cb=>frames.push(cb),$:s=>s==='.sidebar'?sidebar:s==='.workspace'?workspace:s==='#sidebar-backdrop'?backdrop:s==='#menu-button'?button:nav});
  vm.runInContext(source.slice(source.indexOf('function setSidebarOpen('),source.indexOf('function openModal(')),context);
  return{state,sidebar,workspace,backdrop,button,active,nav,body,open:v=>context.setSidebarOpen(v),resize:v=>mobile=v,flush(){frames.splice(0).forEach(cb=>cb())},get cancels(){return cancels}};
}
test('height-only resize keeps current focus and drag transform',()=>{const h=setup();h.open(false);h.open(true);h.flush();assert.equal(h.nav.focuses,1);const cancels=h.cancels;h.sidebar.style.values.transform='translate3d(-30px,0,0)';h.open(true);h.open(true);h.flush();assert.equal(h.cancels,cancels);assert.equal(h.nav.focuses,1);assert.ok(h.sidebar.style.values.transform);});
test('closing restores page access and focus exactly once',()=>{const h=setup();h.open(true);h.flush();assert.equal(h.workspace.inert,true);h.open(false);h.open(false);assert.equal(h.workspace.inert,false);assert.equal(h.sidebar.inert,true);assert.equal(h.active.focuses,1);assert.equal(h.button.attrs['aria-expanded'],'false');assert.equal(h.body.classList.contains('mobile-nav-open'),false);});
test('rapid open-close cannot focus the now hidden menu on the next frame',()=>{const h=setup();h.open(true);h.open(false);h.flush();assert.equal(h.nav.focuses,0);assert.equal(h.active.focuses,1);});
test('crossing into desktop releases the mobile modal state',()=>{const h=setup();h.open(true);h.resize(false);h.open(true);h.flush();assert.equal(h.sidebar.inert,false);assert.equal(h.workspace.inert,false);assert.equal(h.sidebar.classList.contains('open'),false);assert.equal(h.backdrop.tabIndex,-1);h.resize(true);h.open(false);assert.equal(h.sidebar.inert,true);});
