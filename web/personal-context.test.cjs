const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const fragment=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b));

test('personal search uses the private endpoint and opens its own entity',async()=>{
  const input={value:'секрет'},results={hidden:true,innerHTML:''},button={dataset:{personalId:'note-1',personalType:'note'},addEventListener:(_,fn)=>button.click=fn};
  let requested='',opened='';
  const state={me:{id:1},workspaces:[{id:'personal',kind:'personal'}],activeWorkspaceId:'personal',projectContextEpoch:1,globalSearchRequest:0};
  const context=vm.createContext({state,typeMeta:{},activeWorkspace:()=>state.workspaces[0],captureProjectContext:()=>({user:1,workspace:'personal',epoch:1}),isProjectContextCurrent:()=>true,
    $:selector=>selector==='#global-search-input'?input:results,$$:()=>[button],api:async url=>{requested=url;return[{id:'note-1',type:'note',title:'Секрет',context:'текст'}]},
    escapeHTML:String,markdownPlain:String,icon:()=>'',closeGlobalSearch:()=>{},loadPersonal:async()=>{},openPersonalEditor:(kind,id)=>opened=kind+':'+id,openPersonalPlanDetails:()=>{},openRecord:()=>{throw Error('project record opened')}});
  vm.runInContext(fragment('async function runGlobalSearch(', 'function setAuthMode('),context);
  await vm.runInContext("runGlobalSearch('секрет')",context);await button.click();
  assert.equal(requested,'/api/personal/search?q=%D1%81%D0%B5%D0%BA%D1%80%D0%B5%D1%82');assert.equal(opened,'note:note-1');assert.match(results.innerHTML,/Только для вас/);
});

test('workspace switcher exposes personal separately and its menu includes only personal sections and own pages',()=>{
  assert.match(source,/data-switch-personal/);
  assert.match(source,/Только вы · независимо от команд/);
  const state={activeWorkspaceId:'private',workspaces:[{id:'private',kind:'personal'},{id:'team',kind:'team'}],projectNavigation:{enabledViews:['work','chat']},workspacePages:[{id:'own',name:'My page'},{id:'archived',name:'Old page',archived:true}],interfacePreferences:{navOrder:['page:own','personal:notes']}};
  const context=vm.createContext({state,navItems:[['personal','Personal'],['work','Work'],['chat','Chat']]});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'personal-navigation.js'),'utf8').replaceAll('export function','function'),context);
  vm.runInContext(fragment('function navigationCatalog(', 'function navCount('),context);
  const catalog=context.navigationCatalog(),keys=Array.from(catalog,item=>item.key);
  assert.deepEqual(keys.slice(0,2),['page:own','personal:notes']);assert.equal(keys.includes('personal'),true);assert.equal(keys.includes('calendar'),true);assert.equal(keys.includes('personal:finance'),true);
  assert.equal(keys.includes('work'),false);assert.equal(keys.includes('chat'),false);assert.equal(keys.includes('page:archived'),false);
  state.activeWorkspaceId='team';state.workspacePages=[];state.interfacePreferences={navOrder:[]};
  assert.deepEqual(Array.from(context.navigationCatalog(),item=>item.key),['personal','work','chat']);
});
