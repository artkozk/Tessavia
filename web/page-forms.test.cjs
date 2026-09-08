const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({structuredClone});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'page-forms.js'),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
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

test('appearance preview inside the editor does not nest a form and retains required input',()=>{
 c.b={formFields:[{key:'title'}]};c.collection={fields:[],stages:[]};const html=run('pageFormMarkup(b,collection,{escapeHTML:escape,fieldInput:()=>"",users:[],me:{id:1},priorityLabels:{},embeddedPreview:true})');assert.ok(html.startsWith('<div class="app-data-form">'));assert.ok(!html.includes('<form'));assert.match(html,/name="title" required/);assert.ok(html.endsWith('</div>'));
});

test('retry intent snapshots the submitted body and survives a JSON draft round trip',()=>{
 c.payload={title:'Submitted',customFields:{zero:0,flag:false,tags:['one']}};
 c.intent=run("recordFormIntent(payload,'one-submit-intent-0001')");c.payload.title='Edited later';c.payload.customFields.tags.push('two');
 c.draft=JSON.parse(JSON.stringify({pending:c.intent}));const restored=run('restoreRecordFormIntent(draft)');
 assert.equal(restored.key,'one-submit-intent-0001');assert.equal(restored.payload.title,'Submitted');assert.equal(restored.payload.customFields.tags.length,1);assert.equal(restored.payload.customFields.zero,0);assert.equal(restored.payload.customFields.flag,false);
});
test('old drafts carry no invented retry key and malformed pending metadata is ignored',()=>{
 c.draft={values:[]};assert.equal(run('restoreRecordFormIntent(draft)'),null);
 c.draft={pending:{key:'bad',payload:{title:'x'}}};assert.equal(run('restoreRecordFormIntent(draft)'),null);
});
