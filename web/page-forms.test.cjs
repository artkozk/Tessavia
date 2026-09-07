const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'page-forms.js'),'utf8').replaceAll('export ',''),c);
const run=code=>vm.runInContext(code,c);
c.escape=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('form preview preserves custom ordering, excludes hidden fields and escapes labels/defaults',()=>{
 c.b={defaultTitle:'<script>title</script>',actionLabel:'<img src=x>',formFields:[{key:'description',label:'Details <b>'},{key:'title',label:'Subject'},{key:'ownerId',hidden:true}]};
 c.collection={fields:[],stages:[]};
 const html=run('pageFormMarkup(b,collection,{escapeHTML:escape,fieldInput:()=>"",users:[],me:{id:1},priorityLabels:{}})');
 assert.ok(html.indexOf('name="description"')<html.indexOf('name="title"'));assert.ok(!html.includes('name="ownerId"'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img'));assert.ok(html.includes('Details &lt;b&gt;'));assert.ok(html.includes('type="submit"'));
});
test('record payload uses explicit fallback title and keeps false/zero without source IDs',()=>{
 c.b={defaultTitle:'New request'};c.collection={id:'installed',defaultRecordType:'idea'};c.values={};c.custom={flag:false,estimate:0};
 const value=run('pageFormPayload(b,collection,values,custom)');assert.equal(value.title,'New request');assert.equal(value.collectionId,'installed');assert.equal(value.ownerId,0);assert.equal(value.customFields.flag,false);assert.equal(value.customFields.estimate,0);
 c.values={title:''};assert.equal(run('pageFormPayload(b,collection,values,custom)').title,'');
});
test('empty-source form remains configurable without inventing personal assignees',()=>{
 const fields=run('initialFormFields(null)');assert.equal(fields.length,2);assert.equal(fields[0].key,'title');
 c.collection={fields:[{id:'f',name:'Email'}]};const choices=run('formFieldChoices(collection)');assert.equal(choices.find(v=>v.key==='custom:f').label,'Email');
});
