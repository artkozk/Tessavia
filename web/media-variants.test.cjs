const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function load(){let key=0;const c=vm.createContext({URL,FormData,Blob,Date,encodeURIComponent,decodeURIComponent,crypto:{randomUUID:()=>String(++key).padStart(32,'a')},structuredClone});vm.runInContext(fs.readFileSync(path.join(__dirname,'media-variants.js'),'utf8').replaceAll('export ',''),c);return c;}
const contexts=[{kind:'record',recordId:'record',ownerId:1,workspaceId:'team'},{kind:'note',noteId:'note',ownerId:1,workspaceId:'personal-1'},{kind:'page',pageId:'page',blockId:'block',ownerId:1,workspaceId:'team'}];
function fixture(c,ctx=contexts[0],{id='legacy:attachment',attachmentId='attachment',version=1,name='Вариант',note='Первая версия'}={}){return{id,name,revision:1,archived:false,canManage:true,selectedVersionId:'',versions:[{id:'file:'+attachmentId,attachmentId,version,name:'Logo.png',note,contentType:'image/png',preview:'image',size:3,available:true,createdAt:'2026-09-15T12:00:00Z',createdBy:1,createdByName:'Автор',fileUrl:c.mediaVariantsPaths(ctx).variants+'/'+encodeURIComponent(id)+'/versions/'+encodeURIComponent('file:'+attachmentId)+'/file'+(ctx.kind==='note'?'':'?workspaceId='+ctx.workspaceId)}]};}
test('adapters have separate endpoints and durable draft scopes across every owner and workspace',()=>{
 const c=load(),paths=contexts.map(ctx=>c.mediaVariantsPaths(ctx));assert.equal(paths[0].upload,'/api/records/record/attachments');assert.equal(paths[1].upload,'/api/personal/notes/note/attachments');assert.equal(paths[2].variants,'/api/workspace/pages/page/app/media/block/variants');
 const keys=new Set(contexts.map(ctx=>c.mediaVariantsDraftKey(ctx)));assert.equal(keys.size,3);assert.notEqual(c.mediaVariantsDraftKey(contexts[0]),c.mediaVariantsDraftKey({...contexts[0],ownerId:2}));assert.notEqual(c.mediaVariantsDraftKey(contexts[0]),c.mediaVariantsDraftKey({...contexts[0],workspaceId:'other'}));assert.throws(()=>c.mediaVariantsPaths({...contexts[0],recordId:'../private'}));
});
test('server file addresses must remain in the exact parent variant version and workspace',()=>{
 const c=load();for(const ctx of contexts){const item=fixture(c,ctx),version=item.versions[0];assert.equal(c.mediaVersionURL(ctx,item,version),version.fileUrl);for(const fileUrl of ['https://evil.test/file','//evil.test/file',version.fileUrl.replace('/file%3Aattachment/','/file%3Aother/'),version.fileUrl.replace(c.mediaVariantsPaths(ctx).variants,'/api/personal/notes/other/media-variants')])assert.throws(()=>c.mediaVersionURL(ctx,item,{...version,fileUrl}));if(ctx.kind!=='note')assert.throws(()=>c.mediaVersionURL(ctx,item,{...version,fileUrl:version.fileUrl.replace('workspaceId=team','workspaceId=other')}));}
});
test('a selected old version stays selected after a newer upload; no selection uses latest',()=>{
 const c=load(),item=fixture(c),next=fixture(c,contexts[0],{attachmentId:'second',version:2}).versions[0];item.versions.push(next);assert.equal(c.displayedMediaVersion(item).id,next.id);item.selectedVersionId=item.versions[0].id;assert.equal(c.displayedMediaVersion(item).version,1);
});
test('comparison is exactly two safe available raster images and all names and captions are escaped',()=>{
 const c=load(),one=fixture(c,contexts[0],{name:'<Logo>',note:'<script>bad</script>'}),two=fixture(c,contexts[0],{id:'legacy:second',attachmentId:'second',name:'Другой'}),pairs=[{variant:one,version:one.versions[0]},{variant:two,version:two.versions[0]}];
 const html=c.mediaComparisonMarkup(pairs,contexts[0],e);assert.ok(html.includes('&lt;Logo&gt;'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.equal((html.match(/<img /g)||[]).length,2);assert.ok(html.includes('без обрезки'));
 assert.throws(()=>c.mediaComparisonMarkup([pairs[0],pairs[0]],contexts[0],e));for(const version of [{...two.versions[0],contentType:'image/svg+xml'},{...two.versions[0],preview:'video',contentType:'video/mp4'},{...two.versions[0],available:false}])assert.throws(()=>c.mediaComparisonMarkup([pairs[0],{variant:two,version}],contexts[0],e));
});
test('gallery preserves archive and readonly rules; unsafe formats never render as images',()=>{
 const c=load(),item=fixture(c),render=value=>c.mediaVariantsGalleryMarkup(value,contexts[0],e,()=>'',new Set(),false);assert.ok(render([item]).includes('Новая версия'));assert.ok(!render([{...item,canManage:false}]).includes('data-variant-upload'));assert.ok(!render([{...item,archived:true}]).includes('data-variant-preview'));
 const dangerous={...item,versions:[{...item.versions[0],contentType:'image/svg+xml'}]};assert.ok(!render([dangerous]).includes('<img'));
});
test('upload receipts and version metadata never erase a draft on a malformed acknowledgment',()=>{
 const c=load(),item={fileName:'Logo.png',blob:{size:3},intent:'version',requestKey:'stable-key',attachmentId:'attachment',note:'Changed',expectedRevision:2};
 for(const value of [null,{}, {id:'attachment',name:'other',size:3,contentType:'image/png'},{id:'attachment',name:'Logo.png',size:4,contentType:'image/png'}])assert.throws(()=>c.requireVariantUploadReceipt(value,item));
 assert.equal(c.requireVariantUploadReceipt({id:'attachment',originalName:'Logo.png',sizeBytes:3,contentType:'image/png'},item),'attachment');assert.equal(c.mediaVariantMetadataBody(item).expectedRevision,2);assert.ok(!('selectedVersionId' in c.mediaVariantMetadataBody(item)));
});
function node(){const nodes=new Map(),listeners={};let html='',fields=[];return{isConnected:true,get innerHTML(){return html;},set innerHTML(value){html=value;fields=[];for(const match of value.matchAll(/<(input|textarea)[^>]*data-media-draft-field="([^"]+)"[^>]*>([^<]*)/g)){const prefix=value.slice(0,match.index),key=[...prefix.matchAll(/data-upload-draft="([^"]+)"/g)].at(-1)?.[1],field={dataset:{mediaDraftField:match[2]},value:match[1]==='textarea'?match[3]:match[0].match(/value="([^"]*)"/)?.[1]||'',closest:()=>({dataset:{uploadDraft:key}})};fields.push(field);}},textContent:'',dataset:{},disabled:false,hidden:false,classList:{add(){},remove(){}},addEventListener(type,listener){listeners[type]=listener;},removeEventListener(type){delete listeners[type];},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},querySelectorAll(selector){return selector==='[data-media-draft-field]'?[...fields,...[...nodes.values()].flatMap(child=>child.querySelectorAll(selector))]:[];},scrollIntoView(){},click(){return this.onclick?this.onclick():listeners.click?.();}};}
function runtime(ctx=contexts[0],onChange){
 const c=load(),root=node(),saved=new Map(),calls=[],server={items:[],canCreate:true},state={me:{id:ctx.ownerId},activeWorkspaceId:ctx.workspaceId},file=Object.assign(new Blob(['png'],{type:'image/png'}),{name:'Logo.png'});
 const store={get:async key=>saved.has(key)?structuredClone(saved.get(key)):null,put:async value=>{saved.set(value.key,structuredClone(value));}};
 let behavior=null;
 const api=async(url,options={})=>{calls.push({url,...options});if(behavior){const value=await behavior(url,options);if(value!==undefined)return value;}if(!options.method)return structuredClone(server);if(url===c.mediaVariantsPaths(ctx).upload)return{id:'attachment',name:file.name,originalName:file.name,size:3,sizeBytes:3,contentType:'image/png'};const result=fixture(c,ctx);server.items=[result];return result;};
 const ui=c.createMediaVariantsUI({state,api,escapeHTML:e,icon:()=>'',draftStore:store,toast(){}}),view=ui.mount(root,{...ctx,onChange});
 return{c,ctx,root,saved,calls,server,state,file,ui,view,store,setBehavior:fn=>behavior=fn,draft:()=>saved.get(c.mediaVariantsDraftKey(ctx)),send:()=>root.querySelector('[data-media-send]').click()};
}
test('durable queue uploads then binds metadata with pinned headers in each adapter',async()=>{
 for(const ctx of contexts){const h=runtime(ctx);await h.view.ready;await h.view.addFiles([h.file]);assert.equal(h.draft().files.length,1);assert.equal(h.calls.filter(call=>call.method==='POST').length,0);await h.send();assert.equal(h.draft().files.length,0);
  const posts=h.calls.filter(call=>call.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].url,h.c.mediaVariantsPaths(ctx).upload);assert.equal(posts[1].url,h.c.mediaVariantsPaths(ctx).variants);assert.ok(posts[0].body.get('requestKey'));assert.equal(JSON.parse(posts[1].body).attachmentId,'attachment');for(const request of h.calls){assert.equal(request.headers['X-Outbox-Owner'],'1');assert.equal(request.headers['X-Workspace-ID'],ctx.workspaceId);}}
});
test('lost metadata response resumes with same request key without uploading the file again',async()=>{
 const h=runtime();await h.view.ready;await h.view.addFiles([h.file]);let lost=false;
 h.setBehavior((url,options)=>{if(options.method==='POST'&&url===h.c.mediaVariantsPaths(h.ctx).variants&&!lost){lost=true;h.server.items=[fixture(h.c)];const err=new Error('Response lost');err.status=503;throw err;}});
 await h.send();assert.equal(h.draft().files.length,1);assert.equal(h.draft().files[0].attachmentId,'attachment');const first=JSON.parse(h.calls.find(call=>call.method==='POST'&&typeof call.body==='string').body);
 await h.send();assert.equal(h.draft().files.length,0);const uploads=h.calls.filter(call=>call.url.endsWith('/attachments')&&call.method==='POST'),metadata=h.calls.filter(call=>call.method==='POST'&&typeof call.body==='string');assert.equal(uploads.length,1);assert.equal(metadata.length,2);assert.equal(JSON.parse(metadata[1].body).requestKey,first.requestKey);
});
test('a malformed upload receipt retains the blob and stable upload key for review',async()=>{
 const h=runtime();await h.view.ready;await h.view.addFiles([h.file]);const key=h.draft().files[0].uploadKey;h.setBehavior((url,options)=>{if(options.method==='POST'&&url.endsWith('/attachments'))return{id:'wrong'};});await h.send();assert.equal(h.draft().files.length,1);assert.equal(h.draft().files[0].uploadKey,key);assert.equal(h.draft().files[0].blob.size,3);assert.equal(h.calls.filter(call=>call.method==='POST').length,1);
});
test('account changes during upload prevent metadata writes and keep the confirmed file in its original draft',async()=>{
 const h=runtime();await h.view.ready;await h.view.addFiles([h.file]);h.setBehavior((url,options)=>{if(options.method==='POST'&&url.endsWith('/attachments')){h.state.me={id:2};return{id:'attachment',name:'Logo.png',size:3,contentType:'image/png'};}});await h.send();assert.equal(h.draft().files[0].attachmentId,'attachment');assert.equal(h.calls.filter(call=>call.method==='POST').length,1);assert.equal(h.calls.filter(call=>call.method==='POST')[0].headers['X-Outbox-Owner'],'1');
});
test('reopening restores files and captions; read-only or archived contexts cannot send them',async()=>{
 const h=runtime();await h.view.ready;await h.view.addFiles([h.file]);const key=h.c.mediaVariantsDraftKey(h.ctx),saved=h.saved.get(key);saved.files[0].note='Do not lose this caption';h.saved.set(key,saved);h.view.dispose();h.server.canCreate=false;const next=h.ui.mount(h.root,h.ctx);await next.ready;assert.ok(h.root.querySelector('[data-variants-queue]').innerHTML.includes('Do not lose this caption'));await h.send();assert.equal(h.calls.filter(call=>call.method==='POST').length,0);assert.equal(h.draft().files.length,1);
});
test('new versions retain the selected version and pin the parent revision',async()=>{
 const h=runtime();const variant=fixture(h.c);variant.selectedVersionId=variant.versions[0].id;h.server.items=[variant];await h.view.refresh();await h.view.ready;await h.view.addFiles([h.file],{variantId:variant.id});await h.send();const metadata=h.calls.find(call=>call.method==='POST'&&call.url.endsWith('/versions'));assert.ok(metadata);const body=JSON.parse(metadata.body);assert.equal(body.expectedRevision,1);assert.ok(!('selectedVersionId'in body));
});
test('a refresh during caption persistence keeps the newest visible text and reopening waits for its durable commit',async()=>{
 const h=runtime();await h.view.ready;await h.view.addFiles([h.file]);let unblock,writing=false;
 const blocked=new Promise(resolve=>unblock=resolve),put=h.store.put;
 h.store.put=async value=>{if(value.files[0]?.note==='Newest caption'&&!writing){writing=true;await blocked;}return put(value);};
 const caption=h.root.querySelectorAll('[data-media-draft-field]').find(field=>field.dataset.mediaDraftField==='note');caption.value='Newest caption';caption.oninput();await new Promise(resolve=>setImmediate(resolve));assert.equal(writing,true);
 await h.view.refresh();assert.ok(h.root.querySelector('[data-variants-queue]').innerHTML.includes('Newest caption'));
 const newRoot=node();h.view.dispose();const next=h.ui.mount(newRoot,h.ctx);await new Promise(resolve=>setImmediate(resolve));unblock();await next.ready;
 assert.equal(h.draft().files[0].note,'Newest caption');assert.ok(newRoot.querySelector('[data-variants-queue]').innerHTML.includes('Newest caption'));
});
test('attachment counters include archived variants, count each file once and exclude removed legacy files',()=>{
 const c=load(),one=fixture(c),archived={...fixture(c,contexts[0],{id:'legacy:second',attachmentId:'second'}),archived:true};
 assert.equal(c.mediaAttachmentCount([one,archived,one]),2);
 assert.equal(c.mediaAttachmentCount([one,{...archived,versions:archived.versions.map(version=>({...version,removed:true}))}]),1);
});
test('scoped change callbacks refresh attachment counters after upload without replacing the parent or notifying a departed account',async()=>{
 const notifications=[],h=runtime(contexts[0],value=>notifications.push(value.attachmentCount));await h.view.ready;
 assert.deepEqual(notifications,[0]);await h.view.addFiles([h.file]);await h.send();assert.equal(notifications.at(-1),1);
 assert.equal(h.draft().files.length,0);const count=notifications.length;h.state.me={id:2};await h.view.refresh();assert.equal(notifications.length,count);
});
test('authorized archived source files retain historical preview but cannot be selected as the current version',()=>{
 const c=load(),variant=fixture(c),version={...variant.versions[0],removed:true,available:true};
 assert.equal(c.mediaVersionKind(version),'image');assert.equal(c.mediaVersionURL(contexts[0],variant,version),version.fileUrl);
 assert.equal(c.mediaVersionSelectable(variant,version),false);assert.equal(c.mediaVersionSelectable(variant,{...version,removed:false}),true);
 assert.equal(c.mediaVersionSelectable(variant,{...version,removed:false,available:false}),false);assert.equal(c.mediaVersionKind({...version,available:false}),'');
 assert.equal(c.mediaVersionSelectable({...variant,canManage:false},{...version,removed:false}),false);
 assert.equal(c.mediaVersionSelectable({...variant,archived:true},{...version,removed:false}),false);
});
