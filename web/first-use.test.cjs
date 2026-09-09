const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const ctx=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'first-use.js'),'utf8').replaceAll('export function','function'),ctx);
test('personal help stays private even when opened from a team workspace',()=>{
 const help=ctx.helpContext('personal','notes',false);
 assert.equal(help.kind,'personal');assert.match(help.text,/не видит/);assert.doesNotMatch(help.text,/основател/);
 assert.equal(ctx.helpContext('calendar','today',true).kind,'personal');
});
test('team help uses the current action and explains independent permissions',()=>{
 assert.match(ctx.helpContext('work','inbox',false).text,/Настройки → Текущая страница.*поля и этапы/);
 assert.match(ctx.helpContext('overview','today',false).text,/выбранной команде/);
 assert.match(ctx.helpContext('personal','inbox',false).text,/Сделать делом/);
});
