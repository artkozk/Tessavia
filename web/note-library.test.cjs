const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'note-library.js'),'utf8').replaceAll('export function','function'),context);
const {filterPersonalNotes,parseNoteTags,createNoteLibraryUI}=context;
const notes=[{id:'1',title:'Книга',body:'Заметка об архитектуре',folderId:'f',folderName:'Исследования',tags:['Обучение'],pinned:true},{id:'2',title:'День',body:'Разные мысли',tags:['дом'],pinned:false}];
test('note text, folder, tag and pin filters intersect without losing unclassified notes',()=>{
 for(const query of ['КНИГА','АРХИТЕКТУРЕ','исследования','ОБУЧЕНИЕ']) assert.equal(filterPersonalNotes(notes,{query})[0].id,'1');
 assert.equal(filterPersonalNotes(notes,{folder:'f',tag:'обучение',pinned:true}).length,1);
 assert.equal(filterPersonalNotes(notes,{folder:'f',tag:'дом'}).length,0);
 assert.equal(filterPersonalNotes(notes,{folder:'none'})[0].id,'2');
 assert.equal(filterPersonalNotes(notes,{query:'не найдено'}).length,0);
 assert.equal(notes.length,2);
});
test('pasted tags normalize separators and deduplicate Cyrillic case',()=>{
 assert.deepEqual(Array.from(parseNoteTags(' #Работа, работа ;\n Дом; #дом, ')),['Работа','Дом']);
});
test('large note list renders a bounded first chunk and exposes full result count',()=>{
 const state={me:{id:1},personal:{noteFolders:[],noteTemplates:[]}};
 const ui=createNoteLibraryUI({state,escapeHTML:String,icon:()=>'',renderNoteCard:note=>`<article>${note.id}</article>`});
 const html=ui.render(Array.from({length:85},(_,i)=>({id:i,tags:[]})),[]);
 assert.equal((html.match(/<article>/g)||[]).length,24);
 assert.match(html,/24 из 85/);assert.match(html,/data-note-more/);
});
test('an uncertain template copy reuses its key after reload and isolates owners',()=>{
 const data=new Map(),storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value),removeItem:key=>data.delete(key)};let next=0;
 const make=()=>context.createNoteShortcutKeys(storage,()=>String(++next));
 const first=make().get(1,'template','2026-09-04');
 assert.equal(make().get(1,'template','2026-09-04'),first);
 assert.notEqual(make().get(2,'template','2026-09-04'),first);
 assert.notEqual(make().get(1,'template','2026-09-05'),first);
 make().confirmed(1,'template','2026-09-04');
 assert.notEqual(make().get(1,'template','2026-09-04'),first);
});
