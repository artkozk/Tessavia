const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({structuredClone});for(const name of ['page-composition.js','page-block-visibility.js','page-apps.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),c);
const run=s=>vm.runInContext(s,c),make=()=>({blocks:[{id:'g',kind:'group',title:'Group'},{id:'t',parentId:'g',kind:'tracker',items:[{id:'i',label:'Check'}]},{id:'p',parentId:'g',kind:'progress',source:'t'},{id:'n',parentId:'g',kind:'group'},{id:'j',parentId:'n',kind:'button',source:'t',visibility:{source:'t',metric:'remaining',operator:'eq',value:0}},{id:'r',parentId:'g',kind:'records',collectionId:'board'},{id:'other',kind:'text',text:'Outside'}]});
c.e=s=>String(s).replaceAll('<','&lt;');
test('copying a composition remaps internal dependencies, retains shared records and starts with independent marks',()=>{
 c.def=make();const original=JSON.stringify(c.def.blocks);let i=0;c.copyUID=()=>`copy${++i}`;assert.equal(run("duplicateBlockTree(def,'g',copyUID)"),'copy1');assert.equal(JSON.stringify(c.def.blocks.slice(0,6)),JSON.stringify(JSON.parse(original).slice(0,6)));
 const copy=c.def.blocks.find(b=>b.id==='copy2'),progress=c.def.blocks.find(b=>b.id==='copy3'),jump=c.def.blocks.find(b=>b.id==='copy5');assert.equal(copy.parentId,'copy1');assert.equal(progress.source,copy.id);assert.equal(jump.parentId,'copy4');assert.equal(jump.source,copy.id);assert.equal(jump.visibility.source,copy.id);assert.equal(c.def.blocks.find(b=>b.id==='copy6').collectionId,'board');c.marks={'t:i':true};c.p=progress;assert.equal(run('appProgress(p,def,marks).done'),0);
});
test('moving siblings keeps descendants attached and changing group type releases only direct children',()=>{
 c.def=make();run('moveBlockSibling(def,def.blocks[0],1)');assert.deepEqual(Array.from(run('blockOutline(def).map(x=>x.block.id)')),['other','g','t','p','n','j','r']);run("releaseGroupChildren(def,def.blocks.find(b=>b.id==='g'))");assert.equal(c.def.blocks.find(b=>b.id==='t').parentId,'');assert.equal(c.def.blocks.find(b=>b.id==='j').parentId,'n');
});
test('group destinations exclude own subtree and prevent moving a deep subtree past level four',()=>{
 c.def=make();for(let i=0;i<4;i++)c.def.blocks.push({id:'level'+i,kind:'group',parentId:i?'level'+(i-1):''});c.b=c.def.blocks[0];const choices=Array.from(run('groupChoices(def,b).map(x=>x.block.id)'));assert.ok(!choices.includes('g'));assert.ok(!choices.includes('n'));assert.ok(choices.includes('level1'));assert.ok(!choices.includes('level2'));assert.ok(!choices.includes('level3'));
});
test('hidden ancestors suppress descendants and jump targets without losing stored content',()=>{
 c.def=make();c.def.blocks.push({id:'jump',kind:'button',source:'t'});c.def.blocks[0].hidden=true;assert.equal(run('blockVisible(def.blocks[1],def,{})'),false);let html=run('pageAppMarkup(def,{},e)');assert.ok(!html.includes('data-app-tracker="t"'));assert.match(html,/data-app-jump="t" disabled/);c.def.blocks[0].hidden=false;html=run('pageAppMarkup(def,{},e)');assert.ok(html.includes('data-app-tracker="t"'));assert.ok(!html.includes('data-app-jump="t" disabled'));
});
test('a group cannot use its own enclosed tracker to unlock itself and oversized copies are atomic',()=>{
 c.def=make();c.b=c.def.blocks[0];assert.equal(run('visibilitySources(b,def).length'),0);while(c.def.blocks.length<40)c.def.blocks.push({id:'x'+c.def.blocks.length,kind:'text'});const before=JSON.stringify(c.def);assert.throws(()=>run("duplicateBlockTree(def,'g',()=> 'new')"),/40/);assert.equal(JSON.stringify(c.def),before);
});
