const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const source = fs.readFileSync(__dirname + '/bulk-work.js','utf8');
const loaded = import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));

test('explicit selection keeps original versions across pages and caps at 100', async () => {
  const {createWorkSelection}=await loaded, selection=createWorkSelection();
  selection.scope('project:filter'); selection.toggle();
  for(let i=0;i<100;i++) assert.equal(selection.set({id:String(i),updatedAt:'v1'},true),true);
  assert.equal(selection.set({id:'100',updatedAt:'v1'},true),false);
  selection.scope('project:filter');
  selection.set({id:'1',updatedAt:'v2'},true);
  assert.equal(selection.items.get('1').expectedUpdatedAt,'v1');
  selection.set({id:'1'},false);
  assert.equal(selection.set({id:'100',updatedAt:'v1'},true),true);
});
test('another filter, project, view or layout clears selection and leaves no hidden targets',async()=>{
  const {createWorkSelection}=await loaded, selection=createWorkSelection();
  for(const key of ['project1:filter1','project1:filter2','project2:filter2','project2:board','project2:hiddenColumn']){
    selection.scope(key);assert.equal(selection.items.size,0);assert.equal(selection.enabled,false);
    selection.toggle();selection.set({id:'selected',updatedAt:'v1'},true);
  }
  selection.toggle();assert.equal(selection.items.size,0);
});
