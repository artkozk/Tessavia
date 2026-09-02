const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

function harness() {
  const handlers = {};
  const title = {value:'Title',style:{},scrollHeight:60,addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const body = {textContent:'Existing text',focusCount:0,setAttribute(){},focus(){this.focusCount++;}};
  const range = {selectNodeContents(node){assert.equal(node,body);},collapse(start){assert.equal(start,true);}};
  const context = vm.createContext({form:{elements:{title}},$:()=>body,document:{createRange:()=>range},window:{getSelection:()=>({removeAllRanges(){},addRange(value){assert.equal(value,range);}})}});
  vm.runInContext(source.slice(source.indexOf('function bindPersonalNoteSheet('),source.indexOf('function openPersonalEditor(')),context);
  vm.runInContext('bindPersonalNoteSheet(form)()',context);
  const fire = (type, values) => { const event={type,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...values}; handlers[type](event); return event; };
  return {title,body,fire};
}

test('Enter moves from note title to body without changing or submitting text', () => {
  const h=harness();
  const event=h.fire('keydown',{key:'Enter'});
  assert.equal(event.prevented,true);
  assert.equal(event.stopped,true);
  assert.equal(h.body.focusCount,1);
  assert.equal(h.title.value,'Title');
  assert.equal(h.body.textContent,'Existing text');
});

test('mobile paragraph and line-break intents enter the note body', () => {
  const h=harness();
  h.title.value='';
  assert.equal(h.fire('beforeinput',{inputType:'insertParagraph'}).prevented,true);
  assert.equal(h.fire('beforeinput',{inputType:'insertLineBreak'}).prevented,true);
  assert.equal(h.body.focusCount,2);
});

test('ordinary input and IME composition are not intercepted', () => {
  const h=harness();
  assert.equal(h.fire('keydown',{key:'Enter',isComposing:true}).prevented,false);
  assert.equal(h.fire('keydown',{key:'Enter',keyCode:229}).prevented,false);
  assert.equal(h.fire('beforeinput',{inputType:'insertParagraph',isComposing:true}).prevented,false);
  assert.equal(h.fire('keydown',{key:'a'}).prevented,false);
  assert.equal(h.fire('beforeinput',{inputType:'insertText'}).prevented,false);
  assert.equal(h.body.focusCount,0);
});

test('title grows without imposing a single clipped line', () => {
  const h=harness();
  assert.equal(h.title.style.height,'60px');
  h.title.scrollHeight=100;
  h.fire('input',{});
  assert.equal(h.title.style.height,'100px');
});

function markdown(children) {
  const element = (tag, nodes) => ({nodeType:1,tagName:tag.toUpperCase(),childNodes:nodes,children:nodes.filter(node=>node.nodeType===1)});
  const text = value => ({nodeType:3,nodeValue:value});
  const root=element('div',children(element,text));
  const context=vm.createContext({root,Node:{ELEMENT_NODE:1,TEXT_NODE:3}});
  vm.runInContext(source.slice(source.indexOf('function richTextToMarkdown('),source.indexOf('function setMarkdownEditorValue(')),context);
  return vm.runInContext('richTextToMarkdown(root)',context);
}

test('Enter after an initial plain-text line survives Markdown serialization', () => {
  assert.equal(markdown((el,txt)=>[txt('First'),el('div',[txt('Second')])]),'First\n\nSecond');
  assert.equal(markdown((el,txt)=>[el('b',[txt('First')]),el('div',[txt('Second')])]),'**First**\n\nSecond');
});

test('existing paragraphs, inline formatting and lists retain their boundaries', () => {
  assert.equal(markdown((el,txt)=>[el('p',[txt('First')]),el('p',[txt('Second')])]),'First\n\nSecond');
  assert.equal(markdown((el,txt)=>[txt('Some '),el('b',[txt('bold')]),txt(' text')]),'Some **bold** text');
  assert.equal(markdown((el,txt)=>[txt('List'),el('ul',[el('li',[txt('One')]),el('li',[txt('Two')])])]),'List\n\n- One\n- Two');
});
