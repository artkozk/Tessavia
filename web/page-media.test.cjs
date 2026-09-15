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
