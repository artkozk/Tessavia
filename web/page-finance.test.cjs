const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function load(extra={}){
 const c=vm.createContext({Date,Intl,applyElementStyles(){},...extra});
 for(const name of ['personal-finance.js','page-finance.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),c);
 return c;
}
const e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const base=()=>({currency:'RUB',balanceThrough:'2026-09-15',buckets:[{id:'one',name:'Общий счёт'},{id:'archived',name:'Архивный',archived:true}],balances:[{bucketId:'one',balanceMinor:450000},{bucketId:'archived',balanceMinor:10000}],entries:[{id:'income',sourceName:'Заказ',payer:'<Клиент>',date:'2026-09-14',grossMinor:600000,allocations:[],createdAt:'2026-09-14T12:00:00Z'}],expenses:[{id:'expense',bucketName:'Общий счёт',payee:'<Заправка>',date:'2026-09-15',amountMinor:150000,note:'Личные подробности',createdAt:'2026-09-15T12:00:00Z'}]});
const teamData=()=>({...base(),scope:{kind:'team',workspaceId:'team',workspaceName:'Студия',sourceWorkspaceId:'team',sourceWorkspaceName:'Студия',sourceAvailable:true,canWrite:true,revision:3}});
test('block resolves its page workspace, never a private fallback for unknown or team pages',()=>{
 const c=load(),state={workspaces:[{id:'own',kind:'personal'},{id:'team',kind:'team',name:'Студия'}]};
 assert.equal(c.pageFinanceContext(state,{workspace:'team',ownerId:1}).kind,'team');
 assert.equal(c.pageFinanceContext(state,{workspace:'own',ownerId:1}).kind,'personal');
 assert.throws(()=>c.pageFinanceContext(state,{workspace:'missing',ownerId:1}),/недоступно/);
 assert.throws(()=>c.validatePageFinanceOverview(base(),{kind:'team',workspaceId:'team'}),/Источник/);
 assert.throws(()=>c.validatePageFinanceOverview(teamData(),{kind:'personal',workspaceId:'own'}),/другого/);
 assert.throws(()=>c.validatePageFinanceOverview(teamData(),{kind:'team',workspaceId:'other'}),/Источник/);
});
test('overview uses cumulative balances including archived accounts and only recent non-void operations',()=>{
 const c=load(),data=base();data.expenses.push({...data.expenses[0],id:'void',date:'2026-09-16',voided:true,payee:'Removed transaction'});
 const html=c.pageFinanceOverviewMarkup({finance:{recentLimit:1}},data,{kind:'personal'},e,()=>'',true);
 assert.ok(html.includes(c.financeMoney(460000)));assert.ok(html.includes('Архивный'));assert.ok(html.includes('&lt;Заправка&gt;'));assert.ok(!html.includes('&lt;Клиент&gt;'));assert.ok(!html.includes('Removed transaction'));assert.ok(html.includes('За последние 30 дней'));
 assert.match(html,/data-page-finance-action="income"/);assert.match(html,/data-page-finance-action="expense"/);
});

test('team constructor overview exposes lifetime contributions, revenue and spending without importing a private ledger or changing custom labels',()=>{
 const c=load(),data=teamData();data.teamSummary={contributionMinor:100000,revenueMinor:20000,spentMinor:30000,balanceMinor:90000,unclassifiedMinor:500};
 const block={finance:{totalLabel:'Осталось на запуск',incomeLabel:'Записать взнос'}};
 const html=c.pageFinanceOverviewMarkup(block,data,{kind:'team',workspaceName:'Студия'},e,()=>'',true);
 assert.match(html,/Осталось на запуск/);assert.match(html,/Записать взнос/);assert.match(html,/page-finance-team-totals/);assert.match(html,/Вложено/);assert.match(html,/Доходы от работы/);assert.match(html,/Все записанные операции/);
 assert.ok(html.includes(c.financeMoney(90000)));assert.ok(html.includes(c.financeMoney(100000)));assert.match(html,/Прежние поступления/);
 assert.doesNotMatch(c.pageFinanceOverviewMarkup({finance:{showTotal:false}},data,{kind:'team'},e,()=>'',true),/page-finance-team-totals/);
 assert.doesNotMatch(c.pageFinanceOverviewMarkup(block,data,{kind:'personal'},e,()=>'',true),/page-finance-team-totals/);
});
test('linked and ordinary member views expose context and cannot offer mutations',()=>{
 const c=load(),data=teamData();data.scope={...data.scope,linked:true,sourceWorkspaceId:'other',sourceWorkspaceName:'<Другой бюджет>',canWrite:false};
 let html=c.pageFinanceOverviewMarkup({},data,{kind:'team',workspaceName:'Студия'},e,()=>'',true);
 assert.ok(html.includes('Источник: &lt;Другой бюджет&gt; · просмотр'));assert.ok(!html.includes('data-page-finance-action="income"'));assert.ok(html.includes('data-page-finance-action="open"'));
 data.scope={...data.scope,linked:false};html=c.pageFinanceOverviewMarkup({},data,{kind:'team'},e,()=>'',true);assert.ok(!html.includes('data-page-finance-action="expense"'));
});
test('all display switches and labels survive config; preview never pulls real finance or invented sums',()=>{
 const c=load(),block={kind:'finance',finance:{showTotal:false,showAccounts:false,showRecent:false,showActions:false,openLabel:'<Мой учёт>',display:'compact',recentLimit:10}};
 const html=c.pageFinanceOverviewMarkup(block,base(),{kind:'personal'},e,()=>'',true);
 assert.ok(!html.includes('Общий счёт'));assert.ok(!html.includes('Личные подробности'));assert.ok(!html.includes('page-finance-total'));assert.ok(html.includes('&lt;Мой учёт&gt;'));assert.ok(html.includes('page-finance-compact'));
 const preview=c.pageFinancePreviewMarkup({},e);assert.ok(preview.includes('счета'));assert.ok(!preview.includes('450'));assert.ok(!preview.includes('120'));assert.ok(!preview.includes('/api/'));assert.match(preview,/disabled/);
 assert.equal(c.updatePageFinanceConfig({dataset:{financeProperty:'showTotal'},type:'checkbox',checked:false},block),true);
 assert.equal(block.finance.showTotal,false);assert.equal(c.updatePageFinanceConfig({dataset:{financeProperty:'workspaceId'},value:'secret'},block),false);
});
test('thirty day range follows local today across month and year boundaries',()=>{
 const c=load();const range=c.pageFinanceRange(new Date(2026,0,10,9));assert.equal(range.to,'2026-01-10');assert.equal(range.from,'2025-12-12');
});
function host(){return{isConnected:true,_html:'',nodes:new Map(),actions:[],set innerHTML(value){for(const node of this.nodes.values())node.isConnected=false;for(const node of this.actions)node.isConnected=false;this._html=value;this.nodes=new Map();this.actions=[];for(const selector of ['[data-page-finance-refresh]','[data-page-finance-retry]'])if(value.includes(selector.slice(1,-1)))this.nodes.set(selector,{isConnected:true,disabled:false});for(const match of value.matchAll(/<button[^>]*data-page-finance-action="([^"]+)"[^>]*>/g)){this.actions.push({isConnected:true,dataset:{pageFinanceAction:match[1]},disabled:match[0].includes(' disabled')});}},get innerHTML(){return this._html},querySelector(selector){return this.nodes.get(selector)||null},querySelectorAll(selector){return selector==='[data-page-finance-action]'?this.actions:[]}};}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function runtime(){
 const c=load(),state={me:{id:1},activeWorkspaceId:'team',view:'page:page',workspaces:[{id:'team',kind:'team',name:'Студия'}]},one=host(),two=host(),calls=[],actions=[],listeners=new Set();
 const events={addEventListener(type,listener){assert.equal(type,'tessavie-finance-changed');listeners.add(listener);},removeEventListener(type,listener){listeners.delete(listener);},emit(detail){for(const listener of [...listeners])listener({detail});}};
 const root={querySelector(selector){return selector==='[data-app-finance="one"]'?one:selector==='[data-app-finance="two"]'?two:null;}};
 const ui=c.createPageFinanceUI({state,api:(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject})),escapeHTML:e,icon:()=>'',now:()=>new Date(2026,8,15,9),onFinanceAction:async value=>actions.push(value),eventTarget:events});
 const definition={blocks:[{id:'one',kind:'finance',finance:{showRecent:false}},{id:'two',kind:'finance',finance:{showAccounts:false,totalLabel:'Второй итог'}}]},current={ownerId:1,workspace:'team',page:{id:'page'}};
 return{ui,state,one,two,calls,actions,root,definition,current,events,listeners};
}
test('two blocks mount into separate hosts and actions carry the exact owner workspace and source revision',async()=>{
 const h=runtime();h.ui.mount(h.root,h.definition,h.current);assert.equal(h.calls.length,2);
 for(const call of h.calls){assert.match(call.url,/^\/api\/workspace\/finance\?from=2026-08-17&to=2026-09-15$/);assert.equal(call.options.headers['X-Workspace-ID'],'team');assert.equal(call.options.headers['X-Outbox-Owner'],'1');call.resolve(teamData());}await tick();
 assert.ok(!h.one.innerHTML.includes('Личные подробности'));assert.ok(h.two.innerHTML.includes('Личные подробности'));assert.ok(h.two.innerHTML.includes('Второй итог'));assert.ok(!h.one.innerHTML.includes('Второй итог'));
 await h.one.actions.find(button=>button.dataset.pageFinanceAction==='income').onclick();assert.equal(h.actions.length,1);assert.equal(h.actions[0].workspaceId,'team');assert.equal(h.actions[0].ownerId,1);assert.equal(h.actions[0].sourceWorkspaceId,'team');assert.equal(h.actions[0].sourceRevision,3);
 h.actions[0].onChanged();assert.equal(h.calls.length,4);
});
test('late finance replies and previous action handlers never repaint or act after an account or workspace switch',async()=>{
 const h=runtime();h.ui.mount(h.root,h.definition,h.current);h.state.me={id:2};for(const call of h.calls)call.resolve(teamData());await tick();assert.ok(!h.one.innerHTML.includes('Студия'));assert.ok(!h.two.innerHTML.includes('450'));
 const next=runtime();next.ui.mount(next.root,next.definition,next.current);for(const call of next.calls)call.resolve(teamData());await tick();const previous=next.one.actions[0];next.state.activeWorkspaceId='other';await previous.onclick();assert.equal(next.actions.length,0);
});
test('load failure removes prior balances and offers retry without falling back to personal API',async()=>{
 const h=runtime();h.ui.mount(h.root,h.definition,h.current);h.calls[0].resolve(teamData());h.calls[1].resolve(teamData());await tick();
 h.one.querySelector('[data-page-finance-refresh]').onclick();h.calls[2].reject(new Error('Источник недоступен'));await tick();assert.ok(!h.one.innerHTML.includes('4 600'));assert.ok(h.one.innerHTML.includes('Источник недоступен'));assert.ok(h.one.querySelector('[data-page-finance-retry]'));assert.ok(h.calls.every(call=>call.url.startsWith('/api/workspace/finance')));
});
test('settings event refreshes two active blocks even when it carries the old source and hides stale amounts immediately',async()=>{
 const h=runtime();h.ui.mount(h.root,h.definition,h.current);for(const call of h.calls)call.resolve(teamData());await tick();
 assert.equal(h.listeners.size,1);const previous=h.one.actions[0];
 for(const detail of [{owner:2,workspaceId:'team',kind:'team'},{owner:1,workspaceId:'unrelated',kind:'team'},{owner:1,workspaceId:'team',kind:'personal'}])h.events.emit(detail);
 assert.equal(h.calls.length,2);
 h.events.emit({owner:1,workspaceId:'team',kind:'team',sourceWorkspaceId:'team'});
 assert.equal(h.calls.length,4);assert.ok(!h.one.innerHTML.includes('Студия'));await previous.onclick();assert.equal(h.actions.length,0);
 const linked={...teamData(),scope:{...teamData().scope,linked:true,sourceWorkspaceId:'source',sourceWorkspaceName:'Новый источник',canWrite:false,revision:4}};
 h.calls[2].resolve(linked);h.calls[3].resolve(linked);await tick();
 assert.ok(h.one.innerHTML.includes('Новый источник'));assert.ok(!h.one.innerHTML.includes('data-page-finance-action="income"'));
 h.events.emit({owner:1,workspaceId:'source',kind:'team',sourceWorkspaceId:'source'});assert.equal(h.calls.length,6);
 h.events.emit({owner:1,workspaceId:'source',kind:'team',sourceWorkspaceId:'source'});assert.equal(h.calls.length,8);
});
test('listener cleanup invalidates pending replies on reset and does not multiply listeners on remount',async()=>{
 const h=runtime();h.ui.mount(h.root,h.definition,h.current);assert.equal(h.listeners.size,1);h.ui.reset();assert.equal(h.listeners.size,0);
 for(const call of h.calls)call.resolve(teamData());await tick();assert.ok(!h.one.innerHTML.includes('Студия'));
 h.events.emit({owner:1,workspaceId:'team',kind:'team'});assert.equal(h.calls.length,2);
 h.ui.mount(h.root,h.definition,h.current);h.ui.mount(h.root,h.definition,h.current);assert.equal(h.listeners.size,1);
 h.events.emit({owner:1,workspaceId:'team',kind:'team'});assert.equal(h.calls.length,8);
 h.calls[2].resolve(teamData());h.calls[3].resolve(teamData());await tick();assert.ok(!h.one.innerHTML.includes('Студия'));
 h.state.me=null;h.events.emit({owner:1,workspaceId:'team',kind:'team'});assert.equal(h.listeners.size,0);assert.equal(h.calls.length,8);
});
