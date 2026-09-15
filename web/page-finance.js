import { financeAccountBalances, financeJournal, financeMoney, financeTeamSummary, financeReceiptKindLabel } from './personal-finance.js?v=20260915-team-accounting-1';
import { applyElementStyles } from './page-element-styles.js?v=20260915-team-accounting-1';

const financeBlockLabels={totalLabel:'Всего на счетах',accountsLabel:'Счета',recentLabel:'Последние операции',openLabel:'Открыть финансы',incomeLabel:'Доход',expenseLabel:'Расход'};
export function pageFinanceConfig(block) {
 const saved=block.finance||{};
 return {...Object.fromEntries(['showTotal','showAccounts','showRecent','showActions'].map(key=>[key,saved[key]!==false])),recentLimit:Number.isInteger(saved.recentLimit)&&saved.recentLimit>=1&&saved.recentLimit<=10?saved.recentLimit:5,display:saved.display==='compact'?'compact':'cards',...Object.fromEntries(Object.entries(financeBlockLabels).map(([key,fallback])=>[key,String(saved[key]||'').trim()||fallback]))};
}
export function pageFinanceRange(now=new Date()) {
 const to=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 const start=new Date(to+'T12:00:00Z');start.setUTCDate(start.getUTCDate()-29);
 return {from:start.toISOString().slice(0,10),to};
}
export function pageFinanceContext(state,current) {
 const workspace=state.workspaces?.find(item=>item.id===current.workspace);
 if(!workspace||!['personal','team'].includes(workspace.kind)||!current.ownerId)throw new Error('Пространство финансов недоступно. Обновите страницу.');
 return {workspaceId:workspace.id,workspaceName:workspace.kind==='personal'?'Личное пространство':workspace.name,kind:workspace.kind,ownerId:current.ownerId};
}
export function validatePageFinanceOverview(data,context) {
 if(!data||data.currency!=='RUB'||typeof data.balanceThrough!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(data.balanceThrough)||!Array.isArray(data.buckets)||!Array.isArray(data.balances)||!Array.isArray(data.entries)||!Array.isArray(data.expenses))throw new Error('Не удалось получить финансовый отчёт. Повторите загрузку.');
 if(context.kind==='team'&&(!data.scope||data.scope.kind!=='team'||data.scope.workspaceId!==context.workspaceId||!data.scope.sourceWorkspaceId||!data.scope.sourceAvailable))throw new Error('Источник финансов изменился или недоступен. Обновите блок.');
 if(context.kind==='personal'&&data.scope)throw new Error('Получен отчёт другого пространства. Обновите блок.');
 return data;
}
export function pageFinanceConfigMarkup(block,e) {
 const config=pageFinanceConfig(block);
 return `<fieldset class="page-finance-config"><legend>Что показывать</legend>${[['showTotal','Общий остаток'],['showAccounts','Счета и остатки'],['showRecent','Последние операции'],['showActions','Быстрый доход и расход']].map(([key,label])=>`<label class="app-field-check"><input type="checkbox" data-finance-property="${key}" ${config[key]?'checked':''}> ${label}</label>`).join('')}<div class="form-grid two"><label>Счета<select data-finance-property="display"><option value="cards" ${config.display==='cards'?'selected':''}>Карточки</option><option value="compact" ${config.display==='compact'?'selected':''}>Компактный список</option></select></label><label>Последних операций<input type="number" min="1" max="10" required data-finance-property="recentLimit" value="${config.recentLimit}"></label></div></fieldset><details class="page-finance-labels"><summary>Подписи блока</summary>${Object.entries(financeBlockLabels).map(([key,label])=>`<label>${label}<input data-finance-property="${key}" value="${e(config[key])}" maxlength="80"></label>`).join('')}</details><p class="muted">Блок показывает финансы пространства этой страницы. В личном пространстве — ваши, в команде — общий учёт и выбранный в настройках команды источник. Набор переносит только оформление; счета и операции автора не копируются.</p>`;
}
export function updatePageFinanceConfig(input,block) {
 const key=input.dataset?.financeProperty;
 if(!key||!['showTotal','showAccounts','showRecent','showActions','recentLimit','display',...Object.keys(financeBlockLabels)].includes(key))return false;
 block.finance||={};block.finance[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;
 return true;
}
export function pageFinancePreviewMarkup(block,e) {
 const config=pageFinanceConfig(block);
 return `<div class="page-finance-block"><p class="page-finance-scope">Финансы пространства, в котором установлена страница</p>${config.showTotal?`<div class="page-finance-total"><span data-app-element="financeLabel">${e(config.totalLabel)}</span><strong data-app-element="financeValue">—</strong></div>`:''}${config.showAccounts?`<h3 data-app-element="financeLabel">${e(config.accountsLabel)}</h3><p class="muted">Здесь появятся ваши счета и остатки.</p>`:''}${config.showRecent?`<h3 data-app-element="financeLabel">${e(config.recentLabel)}</h3><p class="muted">До ${config.recentLimit} операций за последние 30 дней.</p>`:''}<p class="muted">Набор содержит настройки блока. Деньги, счета, операции и доступ автора не переносятся.</p><button type="button" class="secondary" data-app-element="financeButton" disabled>${e(config.openLabel)}</button></div>`;
}
export function pageFinanceOverviewMarkup(block,data,context,e,icon,canAct=true) {
 const config=pageFinanceConfig(block),accounts=financeAccountBalances(data),visible=accounts.filter(item=>!item.archived||item.balanceMinor!==0n),total=accounts.reduce((sum,item)=>sum+item.balanceMinor,0n);
 const recent=financeJournal(data).filter(item=>!item.voided).slice(0,config.recentLimit),write=context.kind==='personal'||Boolean(data.scope?.canWrite&&!data.scope.linked);
 const label=context.kind==='personal'?'Личные финансы · только вы':data.scope?.linked?`Источник: ${data.scope.sourceWorkspaceName} · просмотр`:`Финансы команды «${data.scope?.workspaceName||context.workspaceName}»${write?'':' · просмотр'}`;
 const date=value=>new Date(value+'T12:00:00').toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
 const teamTotals=context.kind==='team'?financeTeamSummary(data):null;
 const lifetimeDetails=teamTotals?`<div class="page-finance-team-totals">${[['Вложено',teamTotals.contributionMinor],['Доходы от работы',teamTotals.revenueMinor],['Расходы',teamTotals.spentMinor]].map(([label,value])=>`<div><span data-app-element="financeLabel">${e(label)}</span><strong data-app-element="financeValue">${e(financeMoney(value))}</strong></div>`).join('')}</div>${teamTotals.otherMinor||teamTotals.unclassifiedMinor||teamTotals.workerMinor?`<p class="page-finance-period">${[teamTotals.otherMinor?`Другие поступления: ${financeMoney(teamTotals.otherMinor)}`:'',teamTotals.unclassifiedMinor?`Прежние поступления: ${financeMoney(teamTotals.unclassifiedMinor)}`:'',teamTotals.workerMinor?`Исполнителям до зачисления: ${financeMoney(teamTotals.workerMinor)}`:''].filter(Boolean).map(e).join(' · ')}</p>`:''}`:'';
 return `<div class="page-finance-block page-finance-${config.display}"><div class="page-finance-context"><p class="page-finance-scope">${e(label)}</p><button type="button" class="icon-button" data-page-finance-refresh aria-label="Обновить финансовый блок">${icon('rotate')}</button></div>${config.showTotal?`<section class="page-finance-total"><span data-app-element="financeLabel">${e(config.totalLabel)}</span><strong data-app-element="financeValue">${e(financeMoney(teamTotals ? teamTotals.balanceMinor : total))}</strong><small>${teamTotals ? 'Все записанные операции, включая будущие даты' : `На ${e(date(data.balanceThrough))} · по записям за всё время`}</small>${lifetimeDetails}</section>`:''}${config.showAccounts?`<section><h3 data-app-element="financeLabel">${e(config.accountsLabel)}</h3><div class="page-finance-accounts">${visible.map(item=>`<article data-app-element="financeAccount"><span data-app-element="financeLabel">${e(item.name)}${item.archived?' · архив':''}</span><strong data-app-element="financeValue" class="${item.balanceMinor<0n?'is-negative':''}">${e(financeMoney(item.balanceMinor))}</strong></article>`).join('')||'<p class="muted">Счетов пока нет. Откройте финансы, чтобы начать учёт.</p>'}</div></section>`:''}${config.showRecent?`<section><h3 data-app-element="financeLabel">${e(config.recentLabel)}</h3><p class="page-finance-period">За последние 30 дней</p><div class="page-finance-recent">${recent.map(item=>`<article><div><strong>${e(item.kind==='income'?item.payer||(item.receiptKind?financeReceiptKindLabel(item.receiptKind):item.sourceName)||'Доход':item.payee||item.bucketName||'Расход')}</strong><small>${e(date(item.date))}${item.note?' · '+e(item.note):''}</small></div><strong class="page-finance-operation-value">${item.kind==='expense'?'−':'+'}${e(financeMoney(item.journalAmountMinor))}</strong></article>`).join('')||'<p class="muted">За последние 30 дней операций нет.</p>'}</div></section>`:''}<footer class="page-finance-actions"><button type="button" class="secondary" data-app-element="financeButton" data-page-finance-action="open" ${canAct?'':'disabled'}>${e(config.openLabel)}</button>${config.showActions&&write?`<button type="button" class="text-button" data-app-element="financeButton" data-page-finance-action="income" ${canAct?'':'disabled'}>${icon('plus')} ${e(config.incomeLabel)}</button><button type="button" class="text-button" data-app-element="financeButton" data-page-finance-action="expense" ${canAct?'':'disabled'}>${icon('minus')} ${e(config.expenseLabel)}</button>`:''}</footer></div>`;
}
export function createPageFinanceUI({state,api,escapeHTML:e,icon,onFinanceAction,now=()=>new Date(),eventTarget=globalThis}) {
 const views=new Map();let listening=false,generation=0;
 const unlisten=()=>{if(listening){eventTarget.removeEventListener('tessavie-finance-changed',changed);listening=false;}};
 const prune=()=>{for(const [host,view]of views)if(!view.alive())views.delete(host);if(!views.size)unlisten();};
 const refreshAll=()=>{prune();for(const view of views.values())void view.load();};
 // A settings change is emitted with the previous source. Match the page
 // workspace first, then resolve the new source through its authenticated API.
 function changed(event){
  prune();const detail=event.detail;
  if(!detail||detail.owner!==state.me?.id||!['personal','team'].includes(detail.kind)||typeof detail.workspaceId!=='string')return;
  for(const view of views.values())if(view.matches(detail))void view.load();
 }
 const reset=()=>{generation+=1;views.clear();unlisten();};
 function mount(root,definition,current) {
  prune();
  for(const block of definition.blocks.filter(item=>item.kind==='finance')) {
   const host=root.querySelector(`[data-app-finance="${block.id}"]`);if(!host)continue;
   let turn=0,data=null,context,linkedSource='';const epoch=generation,token={};
   const alive=()=>epoch===generation&&views.get(host)?.token===token&&host.isConnected&&state.me?.id===current.ownerId&&state.activeWorkspaceId===current.workspace&&state.view===`page:${current.page.id}`;
   const call=()=>{
    context=pageFinanceContext(state,current);const range=pageFinanceRange(now());
    const path=context.kind==='personal'?'/api/personal/finance':'/api/workspace/finance';
    return api(`${path}?from=${range.from}&to=${range.to}`,{headers:{'X-Workspace-ID':context.workspaceId,'X-Outbox-Owner':String(context.ownerId)}});
   };
   const load=async()=>{
    if(!alive())return;const revision=++turn;data=null;host.innerHTML='<p role="status" class="muted">Загружаем финансы этого пространства…</p>';
    try{const result=await call();if(!alive()||revision!==turn)return;data=validatePageFinanceOverview(result,context);linkedSource=data.scope?.linked?data.scope.sourceWorkspaceId:'';draw();}
    catch(error){if(!alive()||revision!==turn)return;host.innerHTML=`<p role="alert">${e(error.message)}</p><button type="button" class="secondary" data-page-finance-retry>Повторить</button>`;host.querySelector('[data-page-finance-retry]').onclick=load;}
   };
   const draw=()=>{
    if(!alive()||!data)return;
    host.innerHTML=pageFinanceOverviewMarkup(block,data,context,e,icon,typeof onFinanceAction==='function');applyElementStyles(root,definition);
    host.querySelector('[data-page-finance-refresh]').onclick=load;
    host.querySelectorAll('[data-page-finance-action]').forEach(button=>button.onclick=async()=>{
     if(!alive()||!data||!button.isConnected||button.disabled||typeof onFinanceAction!=='function')return;
     const snapshot=data,action=button.dataset.pageFinanceAction;
     if(action!=='open'&&context.kind==='team'&&(!snapshot.scope.canWrite||snapshot.scope.linked))return;
     button.disabled=true;
     try{await onFinanceAction({action,workspaceId:context.workspaceId,ownerId:context.ownerId,sourceWorkspaceId:snapshot.scope?.sourceWorkspaceId||context.workspaceId,sourceRevision:snapshot.scope?.revision??0,onChanged:refreshAll});}
     catch(error){if(alive()){let errorLine=host.querySelector('[data-page-finance-error]');if(!errorLine){errorLine=document.createElement('p');errorLine.dataset.pageFinanceError='';errorLine.setAttribute('role','alert');host.append(errorLine);}errorLine.textContent=error.message;}}
     finally{if(alive()&&button.isConnected)button.disabled=false;}
    });
   };
   const matches=detail=>alive()&&context?.kind===detail.kind&&(context.workspaceId===detail.workspaceId||(detail.kind==='team'&&linkedSource===detail.workspaceId));
   views.set(host,{alive,load,matches,token});void load();
  }
  if(views.size&&!listening&&typeof eventTarget.addEventListener==='function'&&typeof eventTarget.removeEventListener==='function'){eventTarget.addEventListener('tessavie-finance-changed',changed);listening=true;}
 }
 return {mount,refresh:refreshAll,reset};
}
