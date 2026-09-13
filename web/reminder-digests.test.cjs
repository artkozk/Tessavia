const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const settings = fs.readFileSync(require.resolve('./reminder-settings.js'), 'utf8');
const app = fs.readFileSync(require.resolve('./app.js'), 'utf8');

test('reminder settings expose independent daily and weekly digest schedules', () => {
  for (const field of ['dailyDigestEnabled','dailyDigestTime','weeklyDigestEnabled','weeklyDigestWeekday','weeklyDigestTime']) {
    assert.match(settings, new RegExp(`name="${field}"`));
    assert.match(settings, new RegExp(`${field}:(?:Number\\()?form\\.elements\\.${field}`));
  }
  assert.match(settings, /Одна запись с итоговыми числами без названий личных дел и карточек/);
});

test('digest notifications open Today or the weekly Review without treating a digest as a project record', async () => {
  for(const [entityId,tab] of [['weekly:2026-09-07','review'],['daily:2026-09-13','today']]){
    let click;const navigation=[],requests=[],errors=[],item={id:'digest',entityType:'personal_digest',entityId,title:'Summary',body:'Counts'},button={dataset:{openNotification:'digest'},addEventListener:(_,fn)=>click=fn};
    const context=vm.createContext({state:{notificationInbox:{items:[item]},activeWorkspaceId:'private'},history:{state:{}},escapeHTML:String,formatDate:String,icon:()=>'',
      $:()=>({addEventListener(){}}),$$:selector=>selector==='[data-open-notification]'?[button]:[],
      api:async(path,options)=>requests.push([path,options.method]),navigateToView:async(...args)=>navigation.push(args),loadNotificationInbox:async()=>{},toast:message=>errors.push(message),openRecord:()=>{throw Error('Digest opened as record');}});
    vm.runInContext(fs.readFileSync(require.resolve('./personal-navigation.js'),'utf8').replaceAll('export function','function'),context);
    vm.runInContext(app.slice(app.indexOf('function renderNotifications('),app.indexOf('async function loadNotificationInbox(')),context);
    context.renderNotifications();await click();
    assert.deepEqual(requests,[['/api/notifications/digest/read','POST']]);assert.equal(errors.length,0);assert.equal(navigation.length,1);
    const target=context.personalNavigationTarget(...navigation[0]);assert.equal(target.view,'personal');assert.equal(target.personalTab,tab);
  }
});
