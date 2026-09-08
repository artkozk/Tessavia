const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({});for(const name of ['page-block-visibility.js','page-apps.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
const run=s=>vm.runInContext(s,c),def=()=>({blocks:[{id:'steps',kind:'tracker',title:'Steps',items:[{id:'one',label:'One'},{id:'two',label:'Two'},{id:'hidden',hidden:true,label:'Removed'}]},{id:'next',kind:'text',title:'Next',text:'Continue here',visibility:{source:'steps',metric:'remaining',operator:'eq',value:0}}]});
c.e=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
test('each user sees a step from their own marks; undo hides it without deleting data',()=>{
 c.def=def();c.marks={'steps:one':true,'steps:hidden':true};assert.equal(run('blockVisible(def.blocks[1],def,marks)'),false);
 c.marks['steps:two']=true;assert.equal(run('blockVisible(def.blocks[1],def,marks)'),true);assert.equal(run('blockVisible(def.blocks[1],def,{})'),false);
 delete c.marks['steps:two'];assert.equal(run('blockVisible(def.blocks[1],def,marks)'),false);
});
test('all comparators use numeric zero, percent boundaries, missing source and no active items',()=>{
 c.def=def();c.marks={'steps:one':true};const rule=c.def.blocks[1].visibility;rule.metric='percent';rule.value=50;
 for(const [operator,expected] of [['eq',true],['ne',false],['gt',false],['gte',true],['lt',false],['lte',true],['unknown',false]]){rule.operator=operator;assert.equal(run('blockVisible(def.blocks[1],def,marks)'),expected)}
 rule.operator='eq';rule.metric='checked';rule.value=0;assert.equal(run('blockVisible(def.blocks[1],def,{})'),true);
 c.def.blocks[0].items=[];assert.equal(run('blockVisible(def.blocks[1],def,{})'),false);rule.source='missing';assert.equal(run('blockVisible(def.blocks[1],def,{})'),false);
});
test('template inspection shows conditional content; simulation and actual display evaluate it',()=>{
 c.def=def();assert.ok(run('pageAppMarkup(def,{},e,true)').includes('Continue here'));assert.ok(run('pageAppMarkup(def,{},e,true)').includes('Условие:'));
 assert.ok(!run('pageAppMarkup(def,{},e,true,true)').includes('Continue here'));c.counts={steps:2};assert.ok(run('pageAppMarkup(def,previewVisibilityMarks(def,counts),e,true,true)').includes('Continue here'));
 assert.ok(!run('pageAppMarkup(def,{},e)').includes('Continue here'));c.def.blocks[1].hidden=true;assert.ok(!run('pageAppMarkup(def,previewVisibilityMarks(def,counts),e,true,true)').includes('Continue here'));
});
test('jump to conditionally hidden target is unavailable instead of silently doing nothing',()=>{
 c.def=def();c.def.blocks.push({id:'jump',kind:'button',title:'Go next',source:'next'});assert.match(run('pageAppMarkup(def,{},e)'),/data-app-jump="next" disabled/);
 c.counts={steps:2};assert.ok(!run('pageAppMarkup(def,previewVisibilityMarks(def,counts),e)').includes('data-app-jump="next" disabled'));
});
test('100 percent requires every active item, never a rounded-up partial result',()=>{
 c.def=def();c.def.blocks[0].items=Array.from({length:200},(_,i)=>({id:String(i),label:String(i)}));c.def.blocks[1].visibility={source:'steps',metric:'percent',operator:'gte',value:100};c.counts={steps:199};
 assert.equal(run('blockVisible(def.blocks[1],def,previewVisibilityMarks(def,counts))'),false);c.counts.steps=200;assert.equal(run('blockVisible(def.blocks[1],def,previewVisibilityMarks(def,counts))'),true);
});
