const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const render = source.slice(source.indexOf('function renderWorkspaceControl('), source.indexOf('function closeWorkspaceDialog('));

function switcher(workspaces, activeWorkspaceId) {
  const root = {innerHTML: ''};
  const state = {workspaces, activeWorkspaceId};
  const context = vm.createContext({state, activeWorkspace: () => workspaces.find(p => p.id === activeWorkspaceId),
    $: selector => selector === '#workspace-control' ? root : null, $$: () => [],
    icon: name => `<svg data-icon="${name}"></svg>`,
    escapeHTML: value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
  vm.runInContext(render+'\nrenderWorkspaceControl()', context);
  return {html: root.innerHTML, summary: root.innerHTML.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)[1]};
}

const projects = [
  {id:'crm', name:'CRM', teamId:'business', teamName:'Business', kind:'team', role:'admin', teamRole:'owner'},
  {id:'python', name:'Python', teamId:'business', teamName:'Business', kind:'team', role:'member'},
  {id:'other', name:'CRM', teamId:'startup', teamName:'Startup', kind:'team', role:'member'},
];

test('current project is primary and team is secondary, switching updates identity', () => {
  const crm = switcher(projects,'crm');
  assert.match(crm.summary, /<strong>CRM<\/strong><small>Команда: Business<\/small>/);
  assert.doesNotMatch(crm.summary, /Владелец|Рабочее пространство/);
  assert.match(crm.html, /data-switch-workspace="crm" aria-current="page"/);
  assert.match(crm.html, /data-switch-workspace="python" aria-current="false"/);
  assert.match(switcher(projects,'python').summary, /<strong>Python<\/strong>/);
  assert.match(switcher(projects,'other').summary, /<small>Команда: Startup<\/small>/);
});

test('same-named projects remain grouped by team, only supplied accessible projects render', () => {
  const {html} = switcher(projects,'other');
  assert.equal((html.match(/workspace-team-group/g)||[]).length, 2);
  assert.equal((html.match(/aria-current="page"/g)||[]).length, 1);
  assert.equal((html.match(/data-switch-workspace=/g)||[]).length, 3);
  assert.match(html, /Настроить команду Business/);
  assert.doesNotMatch(html, /Настроить команду Startup/);
});

test('personal and empty contexts are not labelled as a business team', () => {
  const personal = switcher([{id:'personal',kind:'personal',name:'Ignored'}],'personal');
  assert.match(personal.summary, /<strong>Личное пространство<\/strong><small>Только вы<\/small>/);
  assert.match(personal.summary, /data-icon="lock"/);
  assert.match(switcher([],'missing').summary, /<strong>Выбрать проект<\/strong>/);
});

test('project names are escaped in headings, tooltips and accessible labels', () => {
  const {html} = switcher([{...projects[0],name:'<img src=x> "Project"',teamName:'<Business>'}],'crm');
  assert.doesNotMatch(html, /<img src=x>|<Business>/);
  assert.match(html, /&lt;img src=x&gt; &quot;Project&quot;/);
});
