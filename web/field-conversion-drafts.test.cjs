const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync(__dirname+'/field-conversion.js').toString('base64'));
test('old choice drafts require review only when the single choice cannot retain them',async()=>{const m=await modulePromise;for(const [value,want] of [[['a','b'],true],[['a'],false],['a',false],['missing',true],[[],false],['',false],[null,false]])assert.equal(m.incompatibleChoiceDraft(value,['','a','b']),want,JSON.stringify(value));});
test('draft persistence retains original selections until explicit resolution',()=>{
  const source=fs.readFileSync(__dirname+'/app.js','utf8'),start=source.indexOf('function workingDraftValues('),end=source.indexOf('\nfunction loadWorkingDraft',start);
  const root={fields:[{name:'title',type:'text',value:'My unsaved card'},{name:'custom:channel',type:'select-one',value:'a'}],fieldDraftConflicts:{'custom:channel':['a','b']}};
  const read=vm.runInNewContext(source.slice(start,end)+';workingDraftValues',{$$:(selector,r)=>r.fields,CSS:{escape:x=>x}});
  assert.deepEqual(JSON.parse(JSON.stringify(read(root))),{title:'My unsaved card','custom:channel':['a','b']});
  delete root.fieldDraftConflicts['custom:channel'];assert.equal(read(root)['custom:channel'],'a');
});
