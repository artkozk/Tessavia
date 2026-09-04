const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
test('reminder date input rejects missing DST hour and preserves normal local instant',()=>{
 const source=fs.readFileSync(path.join(__dirname,'personal-reminders.js'),'utf8').replaceAll('export function','function');
 const run=execFileSync(process.execPath,['-e',source+`;let rejected=false;try{reminderInstant('2026-03-08T02:30')}catch(e){rejected=true};console.log(JSON.stringify({rejected,instant:reminderInstant('2026-03-08T03:30'),roundTrip:reminderLocalInput('2026-03-08T07:30:00Z')}));`],{env:{...process.env,TZ:'America/New_York'},encoding:'utf8'});
 assert.deepEqual(JSON.parse(run),{rejected:true,instant:'2026-03-08T07:30:00.000Z',roundTrip:'2026-03-08T03:30'});
});
