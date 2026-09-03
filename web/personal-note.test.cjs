const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

function sheet(item, options) {
  const calls = [];
  const context = vm.createContext({
    escapeHTML: value => String(value).replaceAll('<', '&lt;'), icon: () => '',
    markdownEditor: (...args) => { calls.push(args); return '<editor>'; },
  });
  vm.runInContext(source.slice(source.indexOf('function personalNoteSheet('), source.indexOf('function bindPersonalNoteSheet(')), context);
  context.item = item; context.options = options;
  return {html: vm.runInContext('personalNoteSheet(item, options)', context), call: calls[0]};
}

test('note title belongs to the shared editor, with no separate visible field', () => {
  const result = sheet({title:'Heading', body:'Text', pinned:true});
  assert.doesNotMatch(result.html, /textarea|name="title"|required/);
  assert.match(result.html, /name="pinned"/);
  assert.equal(result.call[6].notebookTitle, 'Heading');
  assert.equal(result.call[2], 'Text');
});

test('generated captions do not become an editable duplicate heading', () => {
  assert.equal(sheet({title:'First line', body:'First line', titleGenerated:true}).call[6].notebookTitle, '');
  assert.equal(sheet({title:'First line', body:'First line', titleGenerated:false}).call[6].notebookTitle, 'First line');
});

test('plans and project incoming reuse the notebook and preserve draft names', () => {
  for (const bodyName of ['notes', 'description']) {
    const result = sheet({title:'Title', body:'Body'}, {bodyName, pin:false});
    assert.equal(result.call[0], bodyName);
    assert.equal(result.call[6].notebookTitle, 'Title');
    assert.equal(result.call[6].history, true);
    assert.equal(result.call[6].ai, false);
    assert.doesNotMatch(result.html, /name="pinned"/);
  }
});

test('notebook content reserves the title inside the document and escapes it', () => {
  const context=vm.createContext({escapeHTML:s=>s.replaceAll('<','&lt;'),renderMarkdown:s=>'<p>'+s+'</p>'});
  vm.runInContext(source.slice(source.indexOf('function notebookContent('),source.indexOf('function syncNotebook(')),context);
  assert.equal(vm.runInContext("notebookContent('<Heading>', 'Body')",context), '<div data-notebook-title>&lt;Heading></div><p>Body</p>');
  assert.equal(vm.runInContext("notebookContent('', '')",context), '<div data-notebook-title><br></div><p><br></p>');
});

test('notebook Enter leaves composition and modified shortcuts untouched', () => {
  const context=vm.createContext({});
  vm.runInContext(source.slice(source.indexOf('function notebookEnter('),source.indexOf('function markdownEditor(')),context);
  for (const event of [{isComposing:true},{keyCode:229},{ctrlKey:true},{metaKey:true},{type:'keydown',key:'a'},{type:'beforeinput',inputType:'insertText'}]) {
    context.event=event;
    assert.equal(vm.runInContext('notebookEnter(null,event)',context),false);
  }
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
