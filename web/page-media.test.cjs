const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context=vm.createContext({encodeURIComponent});
vm.runInContext(fs.readFileSync(path.join(__dirname,'page-media.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),context);
const e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const icon=()=>'<svg></svg>';
test('only supported raster and video types render inline, never SVG or HTML',()=>{
 for(const type of ['image/png','image/jpeg','image/gif','image/webp'])assert.equal(context.privateMediaKind(type),'image');
 for(const type of ['video/mp4','video/webm'])assert.equal(context.privateMediaKind(type),'video');
 for(const type of ['image/svg+xml','text/html','application/pdf','image/heic','IMAGE/PNG','image/png;evil'])assert.equal(context.privateMediaKind(type),'');
});
test('media file URLs and draft storage bind account, workspace, page and block',()=>{
 const key=context.pageMediaDraftKey(1,'team:a','page','block');
 assert.notEqual(key,context.pageMediaDraftKey(2,'team:a','page','block'));
 assert.notEqual(key,context.pageMediaDraftKey(1,'team:b','page','block'));
 assert.notEqual(key,context.pageMediaDraftKey(1,'team:a','other','block'));
 assert.notEqual(key,context.pageMediaDraftKey(1,'team:a','page','other'));
 const url=context.mediaFileURL('page/x','block?x','file&x','workspace&other');
 assert.equal(url,'/api/workspace/pages/page%2Fx/app/media/block%3Fx/file%26x/file?workspaceId=workspace%26other');
});
test('a malformed or lost upload receipt never authorizes deleting the durable file draft',()=>{
 const item={name:'Sketch.png',blob:{size:27}};
 for(const value of [null,{}, {id:'file'}, {id:'file',name:'Other',size:27,contentType:'image/png'},{id:'file',name:item.name,size:28,contentType:'image/png'}])assert.throws(()=>context.requireMediaUploadReceipt(value,item),/Подтверждение/);
 const valid={id:'file',name:item.name,size:27,contentType:'image/png'};
 assert.equal(context.requireMediaUploadReceipt(valid,item),valid);
});
test('gallery escapes labels, previews only images and keeps explicit download/archive actions',()=>{
 const image={id:'file',name:'<script>"logo"</script>',size:4096,contentType:'image/png',canManage:true};
 const html=context.mediaTileMarkup(image,'/safe?workspaceId=one',e,icon);
 assert.match(html,/loading="lazy"/);assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);
 assert.match(html,/&amp;download=1/);assert.match(html,/data-media-state="file"/);
 const video=context.mediaTileMarkup({...image,contentType:'video/mp4'},'/safe?workspaceId=one',e,icon);
 assert.ok(!video.includes('<video'));assert.ok(!video.includes('<img'));
 const removed=context.mediaTileMarkup({...image,removedAt:'now',canManage:false},'/safe?workspaceId=one',e,icon);
 assert.match(removed,/В архиве/);assert.ok(!removed.includes('data-media-state'));
});
test('video viewer uses controls, no autoplay, and markup escapes file names and URLs',()=>{
 const html=context.privateMediaPreviewMarkup({name:'"<logo>',contentType:'video/webm'},'/safe?x="y',e);
 assert.match(html,/<video/);assert.match(html,/controls playsinline preload="metadata"/);assert.ok(!html.includes('autoplay'));assert.match(html,/&quot;&lt;logo&gt;/);assert.match(html,/x=&quot;y/);
 const htmlFile=context.privateMediaPreviewMarkup({name:'logo.svg',contentType:'image/svg+xml'},'/safe',e);
 assert.ok(!htmlFile.includes('<img'));assert.ok(!htmlFile.includes('<iframe'));assert.ok(!htmlFile.includes('<object'));
});
test('record attachments use the same scoped viewer and never become personal note URLs',()=>{
 const html=context.recordMediaMarkup([{id:'file',originalName:'Logo',contentType:'image/png',sizeBytes:10}],'team',e,icon);
 assert.match(html,/\/api\/attachments\/file\/download\?preview=1&amp;workspaceId=team/);
 assert.ok(!html.includes('/personal/'));assert.ok(!html.includes('data-media-state'));
});

function pageVariantsHarness({pending=true,failLocalCommit=false}={}){
 const makeNode=()=>({isConnected:true,hidden:false,dataset:{},style:{},innerHTML:'',textContent:'',nodes:new Map(),handlers:{},classList:{add(){},remove(){}},append(child){this.child=child;},querySelector(selector){if(selector==='[data-app-media="block"]'&&this.child)return this.child;if(!this.nodes.has(selector))this.nodes.set(selector,makeNode());return this.nodes.get(selector);},querySelectorAll(selector){return selector.includes('page-media-toolbar')?[this.querySelector('.page-media-toolbar'),this.querySelector('.page-media-hint'),this.querySelector('[data-media-grid]'),this.querySelector('[data-media-status]')]:[];},addEventListener(type,handler){this.handlers[type]=handler;}});
 const host=makeNode(),root={querySelector:()=>host},state={me:{id:1},activeWorkspaceId:'team',view:'page:page'},calls=[],panels=[],puts=[];
 const item={name:'Preserved sketch.png',blob:{size:27},requestKey:'original-upload-key'},key='page-media-v1:1:team:page:block';
 let stored={key,files:pending?[item]:[]},refreshes=0,fail=failLocalCommit;
 const store={async get(requested){assert.equal(requested,key);return stored;},async put(next){puts.push(next);if(fail)throw new Error('QuotaExceededError');stored=next;}};
 class FormData{constructor(){this.values={};}append(key,value,name){this.values[key]={value,name};}}
 const ctx=vm.createContext({document:{createElement:makeNode},FormData,encodeURIComponent,createNoteFileDraftStore:()=>store,validateNoteFiles(){},createMediaVariantsUI:options=>({mount(node,context){panels.push({node,context,options});return{refresh:async()=>{refreshes++;},addFiles:async()=>{},dispose(){}};}})});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'page-media.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),ctx);
 const ui=ctx.createPageMediaUI({state,api:(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject})),escapeHTML:e,icon,openModal(){},requestDialogClose(){},toast(){}});
 ui.mount(root,{blocks:[{id:'block',kind:'media'}]},{ownerId:1,workspace:'team',page:{id:'page'}});
 const legacy=host.querySelector('[data-media-legacy]'),legacyBody=host.querySelector('[data-media-legacy-body]').child;
 return{state,host,legacy,legacyBody,calls,panels,puts,item,get stored(){return stored;},get refreshes(){return refreshes;},allowCommit(){fail=false;},tick:async()=>{for(let i=0;i<35;i++)await Promise.resolve();}};
}

test('a page mounts the shared gallery with the exact block scope and hides an empty legacy queue',async()=>{
 const h=pageVariantsHarness({pending:false});await h.tick();const panel=h.panels[0];
 assert.equal(panel.context.kind,'page');assert.equal(panel.context.pageId,'page');assert.equal(panel.context.blockId,'block');assert.equal(panel.context.workspaceId,'team');assert.equal(panel.context.ownerId,1);
 assert.equal(typeof panel.options.draftStore.get,'function');assert.equal(panel.context.isCurrent(),true);assert.equal(h.legacy.hidden,true);assert.equal(h.calls.length,0);
 h.state.activeWorkspaceId='other';assert.equal(panel.context.isCurrent(),false);h.state.activeWorkspaceId='team';h.state.me={id:2};assert.equal(panel.context.isCurrent(),false);
 h.state.me={id:1};h.state.view='page:other';assert.equal(panel.context.isCurrent(),false);
});

test('pending files from the old page queue keep their original request key until receipt and refresh the variant gallery',async()=>{
 const h=pageVariantsHarness();await h.tick();assert.equal(h.calls.length,1);assert.equal(h.legacy.hidden,false);
 const call=h.calls[0];assert.equal(call.url,'/api/workspace/pages/page/app/media/block');assert.equal(call.options.method,'POST');
 assert.equal(call.options.headers['X-Workspace-ID'],'team');assert.equal(call.options.headers['X-Outbox-Owner'],'1');assert.equal(call.options.body.values.requestKey.value,h.item.requestKey);assert.equal(call.options.body.values.file.value,h.item.blob);
 assert.equal(h.legacyBody.querySelector('.page-media-toolbar').hidden,true);assert.equal(h.legacyBody.querySelector('[data-media-grid]').hidden,true);
 call.resolve({id:'file',name:h.item.name,size:27,contentType:'image/png'});await h.tick();
 assert.equal(h.stored.files.length,0);assert.equal(h.refreshes,1);assert.equal(h.legacy.hidden,true);assert.equal(h.calls.length,1);
});

test('a malformed old queue receipt preserves bytes and the same key for an explicit retry',async()=>{
 const h=pageVariantsHarness();await h.tick();h.calls[0].resolve({id:'file',name:'Wrong filename',size:27,contentType:'image/png'});await h.tick();
 assert.equal(h.stored.files[0],h.item);assert.equal(h.puts.length,0);assert.equal(h.refreshes,0);assert.equal(h.legacy.hidden,false);
 assert.match(h.legacyBody.querySelector('[data-media-error]').textContent,/Подтверждение загрузки/);
 h.legacyBody.querySelector('[data-media-retry]').handlers.click();await h.tick();assert.equal(h.calls.length,2);assert.equal(h.calls[1].options.body.values.requestKey.value,'original-upload-key');
});

test('a failed local acknowledgement commit never drops the legacy file even after a successful server response',async()=>{
 const h=pageVariantsHarness({failLocalCommit:true});await h.tick();h.calls[0].resolve({id:'file',name:h.item.name,size:27,contentType:'image/png'});await h.tick();
 assert.equal(h.stored.files[0],h.item);assert.equal(h.refreshes,0);assert.equal(h.legacy.hidden,false);assert.match(h.legacyBody.querySelector('[data-media-error]').textContent,/Quota/);
 h.allowCommit();h.legacyBody.querySelector('[data-media-retry]').handlers.click();await h.tick();assert.equal(h.calls[1].options.body.values.requestKey.value,h.item.requestKey);
});

test('a late confirmed legacy upload is acknowledged in its original scope without painting the next workspace',async()=>{
 const h=pageVariantsHarness();await h.tick();const originalHTML=h.legacyBody.innerHTML;h.state.activeWorkspaceId='other';
 h.calls[0].resolve({id:'file',name:h.item.name,size:27,contentType:'image/png'});await h.tick();
 assert.equal(h.stored.files.length,0);assert.equal(h.refreshes,0);assert.equal(h.legacyBody.innerHTML,originalHTML);assert.equal(h.calls.length,1);
});
