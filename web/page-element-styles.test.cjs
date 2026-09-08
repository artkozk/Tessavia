const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'page-element-styles.js'),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);const run=s=>vm.runInContext(s,c);
test('parent styling never resets nested child properties even when parent follows child in definition',()=>{
 const childNode={dataset:{appElement:'title'},style:{}},parentNode={dataset:{appElement:'title'},style:{}};
 const child={querySelectorAll:()=>[childNode]},parent={querySelectorAll:()=>[parentNode,childNode]};childNode.closest=()=>child;parentNode.closest=()=>parent;
 c.root={querySelectorAll:s=>[s.includes('child')?child:parent]};c.def={blocks:[{id:'child',elementStyles:{title:{fontSize:30,color:'#112233'}}},{id:'parent',elementStyles:{title:{fontSize:18,color:'#445566'}}}]};run('applyElementStyles(root,def)');assert.equal(childNode.style.fontSize,'30px');assert.equal(childNode.style.color,'#112233');assert.equal(parentNode.style.fontSize,'18px');
});
test('specific element overrides common group including explicit zero and false without touching data',()=>{
 c.block={id:'b',items:[{id:'one',label:'One'}],elementStyles:{item:{fontSize:22,padding:12,hidden:true,color:'#176b58'},'item:one':{padding:0,hidden:false}}};const before=JSON.stringify(c.block);const s=run("resolvedElementStyle(block,['item','item:one'])");assert.equal(s.fontSize,22);assert.equal(s.padding,0);assert.equal(s.hidden,false);assert.equal(JSON.stringify(c.block),before);
 delete c.block.elementStyles['item:one'];assert.equal(run("resolvedElementStyle(block,['item','item:one']).hidden"),true);
});
test('styles apply to rendered nodes and reset when removed; source marks and content stay unchanged',()=>{
 const node={dataset:{appElement:'item item:one'},style:{},hidden:false,closest:()=>null};c.root={querySelectorAll:()=>[{querySelectorAll:()=>[node]}]};c.def={blocks:[{id:'b',elementStyles:{item:{width:600,minHeight:44,fontSize:25,color:'#112233',hidden:true}}}]};run('applyElementStyles(root,def)');assert.equal(node.style.width,'600px');assert.equal(node.style.maxWidth,'100%');assert.equal(node.style.fontSize,'25px');assert.equal(node.hidden,true);c.def.blocks[0].elementStyles={};run('applyElementStyles(root,def)');assert.equal(node.style.width,'');assert.equal(node.style.fontSize,'');assert.equal(node.hidden,false);
});
test('editor offers stable nested targets, preserved inactive targets, and escapes user labels',()=>{
 c.block={kind:'tracker',items:[{id:'a',label:'<img>'}],elementStyles:{'action:old':{color:'#112233'}}};c.e=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const html=run("elementStyleConfig(block,null,'item:a',e)");assert.match(html,/&lt;img&gt;/);assert.match(html,/value="item:a" selected/);assert.match(html,/Сбросить выбранный элемент/);assert.ok(!html.includes('<img>'));assert.equal(run("elementStyleTargets(block,null).find(t=>t.key==='action:old').inactive"),true);
});
