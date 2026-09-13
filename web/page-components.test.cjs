const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({structuredClone});vm.runInContext(fs.readFileSync(path.join(__dirname,'page-components.js'),'utf8').replaceAll('export ',''),context);
const extract=context.componentSubtree,targets=context.componentInsertTargets;

test('a saved component extracts the whole nested tree without mutating its source or copying runtime data',()=>{
 const def={version:1,marks:{'t:1':true},sheets:{s:{values:{one:'999'}}},collections:[{id:'ignored'}],blocks:[{id:'outer',kind:'group'},{id:'g',kind:'group',parentId:'outer'},{id:'t',kind:'tracker',parentId:'g',items:[{id:'1',label:'Read'}]},{id:'p',kind:'progress',source:'t',parentId:'g'},{id:'other',kind:'text',text:'PRIVATE OUTSIDE'}]};
 const before=JSON.stringify(def),copy=extract(def,'g');assert.equal(copy.blocks.length,3);assert.equal(copy.blocks[0].parentId,'');assert.equal(copy.blocks[2].source,'t');assert.equal(copy.marks,undefined);assert.equal(copy.sheets,undefined);assert.equal(copy.collections,undefined);assert.equal(JSON.stringify(def),before);copy.blocks[1].items[0].label='Different';assert.equal(def.blocks[2].items[0].label,'Read');
});
test('component extraction names unavailable external behavior instead of silently changing it',()=>{
 for(const dependent of [{id:'b',kind:'button',source:'outside',title:'Jump'},{id:'b',kind:'progress',source:'outside',title:'Progress'},{id:'b',kind:'text',title:'Text',visibility:{mode:'all',conditions:[{source:'outside',metric:'checked'}]}}]){
  const def={version:1,blocks:[{id:'g',kind:'group'},{...dependent,parentId:'g'},{id:'outside',kind:'tracker'}]};assert.throws(()=>extract(def,'g'),/вне группы/);
 }
 assert.throws(()=>extract({version:1,blocks:[]},'g'),/Выберите блок/);
 const safe=extract({version:1,blocks:[{id:'g',kind:'group',source:'unrelated'}]},'g');assert.equal(safe.blocks[0].source,undefined);
});
test('insertion destinations respect the complete component depth and exclude non-groups',()=>{
 const host={blocks:[{id:'a',kind:'group'},{id:'b',kind:'group',parentId:'a'},{id:'c',kind:'group',parentId:'b'},{id:'d',kind:'group',parentId:'c'},{id:'text',kind:'text'}]},component={blocks:[{id:'x',kind:'group'},{id:'y',kind:'group',parentId:'x'},{id:'z',kind:'text',parentId:'y'}]};
 assert.deepEqual(Array.from(targets(host,component),b=>b.id),['a','b']);
});

test('component metadata normalization preserves empty and long drafts without accepting foreign fields or inheriting keys',()=>{
 const value=JSON.parse('{"root":{"name":"","description":"Kept","definition":"ignored"},"__proto__":{"name":"Prototype block","description":"Plain ID"},"bad id":{"name":"bad","description":"bad"},"missing":{"name":"No description"},"array":[]}');value.long={name:'Название '.repeat(20),description:'Описание '.repeat(100)};
 const before=JSON.stringify(value),drafts=context.normalizeComponentDrafts(value);assert.equal(Object.getPrototypeOf(drafts),null);assert.deepEqual(Object.keys(drafts),['root','__proto__','long']);assert.equal(drafts.root.name,'');assert.equal(drafts.root.definition,undefined);assert.equal(drafts.__proto__.name,'Prototype block');assert.equal(drafts.long.description,value.long.description);drafts.root.description='Changed';assert.equal(JSON.stringify(value),before);
 for(const invalid of [null,[],1,'draft'])assert.equal(Object.keys(context.normalizeComponentDrafts(invalid)).length,0);
});
