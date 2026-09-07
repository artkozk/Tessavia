const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'page-apps.js'),'utf8').replaceAll('export ',''),c);
const run=code=>vm.runInContext(code,c);
test('user-authored tracker progress follows stable item IDs and excludes removed items',()=>{
 c.def={version:1,blocks:[{id:'chapters',kind:'tracker',items:[{id:'one',label:'Renamed chapter'},{id:'two',label:'Hidden chapter',hidden:true}]}]};c.marks={'chapters:one':true,'chapters:two':true};
 let value=run("appProgress({source:'chapters'},def,marks)");assert.equal(value.total,1);assert.equal(value.done,1);assert.equal(value.percent,100);
 c.def.blocks[0].items[1].hidden=false;value=run("appProgress({source:'chapters'},def,marks)");assert.equal(value.total,2);assert.equal(value.done,2);
 c.def.blocks[0].items=[];value=run("appProgress({source:'chapters'},def,marks)");assert.equal(value.percent,0);
});
test('template preview contains escaped user content and never interactive tracking',()=>{
 c.def={version:1,blocks:[{id:'title',kind:'text',title:'<script>bad</script>',text:'<img src=x>'},{id:'chapters',kind:'tracker',items:[{id:'one',label:'<b>One</b>'},{id:'hidden',label:'secret hidden',hidden:true}]}]};c.escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
 const html=run('pageAppMarkup(def,{},escape,true)');assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;b&gt;One'));assert.ok(!html.includes('secret hidden'));assert.match(html,/disabled/);
});
