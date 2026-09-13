import { habitStateLabel, habitScheduleLabel } from './habit-tracker.js?v=20260914-field-conversion-1';
import { todayPlanGroups } from './personal-today.js?v=20260914-field-conversion-1';

export const dataSources={habits:'Мои привычки',plans:'Мои дела и планы',work:'Моя работа в проектах',reading:'Чтение и мой дневник'};
export const dataFields={title:'Название',description:'Подробности',status:'Состояние',progress:'Прогресс',date:'Дата'};
export const defaultDataConfig=()=>({source:'habits',filter:'today',layout:'list',fields:['title','description','status'],limit:20,search:true});
export function dataConfigMarkup(block,e){
 const d=block.data||defaultDataConfig();
 const select=(key,label,items)=>`<label>${label}<select data-source-property="${key}">${Object.entries(items).map(([value,name])=>`<option value="${value}" ${d[key]===value?'selected':''}>${e(name)}</option>`).join('')}</select></label>`;
 return `<p class="muted">Источник даёт данные текущего пользователя. Вид, поля и действия настраиваются отдельно; личные записи в набор не входят.</p>${select('source','Источник данных',dataSources)}${d.source==='reading'?`<label class="app-field-check"><input type="checkbox" data-source-property="hideReader" ${d.hideReader?'checked':''}> Скрыть чтение текста</label><label>Подпись чтения<input data-source-property="readLabel" maxlength="80" value="${e(d.readLabel||'')}" placeholder="Читать"></label><label>Размер текста главы, px<input type="number" data-source-property="readerSize" min="0" max="72" value="${d.readerSize||0}"></label>`:''}<div class="form-grid two">${select('filter','Какие записи',d.source==='work'?{today:'Работа и сигналы дня'}:{today:'Сегодня',open:'Незавершённые',all:'Все доступные'})}${select('layout','Представление',{list:'Список',cards:'Карточки'})}</div><p class="muted">Для привычек «Сегодня» учитывает расписание. Для чтения показаны главы выбранной книги; «Сегодня» — уже отмеченные сегодня.</p><fieldset><legend>Поля записи</legend>${Object.entries(dataFields).map(([key,name])=>`<label class="app-field-check"><input type="checkbox" data-source-field="${key}" ${d.fields?.includes(key)?'checked':''}> ${name}</label>`).join('')}</fieldset><label class="app-field-check"><input type="checkbox" data-source-property="search" ${d.search?'checked':''}> Поиск по записям</label><label class="app-field-check"><input type="checkbox" data-source-property="hideAction" ${d.hideAction?'checked':''}> Скрыть действие записи</label><label>Подпись действия<input data-source-property="actionLabel" maxlength="80" value="${e(d.actionLabel||'')}" placeholder="По смыслу источника"></label><div class="form-grid two">${[['limit','Записей до кнопки «Показать ещё»',1,100,20],['textSize','Размер текста записи, px',0,72,0],['actionSize','Размер текста действия, px',0,48,0]].map(([key,label,min,max,fallback])=>`<label>${label}<input type="number" data-source-property="${key}" min="${min}" max="${max}" value="${d[key]??fallback}"></label>`).join('')}${[['textColor','Цвет текста записи'],['actionColor','Цвет текста действия'],['actionBackground','Фон действия']].map(([key,label])=>`<label>${label}<input data-source-property="${key}" maxlength="7" value="${e(d[key]||'')}" placeholder="#176b58 или пусто"></label>`).join('')}</div>`;
}
export function updateDataConfig(input,block){
 if(!input.hasAttribute('data-source-property')&&!input.hasAttribute('data-source-field'))return false;
 block.data ||= defaultDataConfig();const d=block.data;
 if(input.dataset.sourceField){const key=input.dataset.sourceField;d.fields=input.checked?[...new Set([...(d.fields||[]),key])]:(d.fields||[]).filter(f=>f!==key);}
 else {const key=input.dataset.sourceProperty;d[key]=input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value;if(key==='source')d.filter=input.value==='reading'?'open':'today';}
 return true;
}
export function personalDataRows(source,personal,day,filter='today'){
 if(source==='habits')return (personal.habits||[]).filter(h=>!h.archivedAt&&!h.paused).map(h=>{
  const current=h.days?.find(d=>d.date===h.today),quick=current?.editable&&['pending','snoozed','partial'].includes(current.state)&&['build','quit'].includes(h.rule?.mode);
  return {id:h.id,title:h.title,description:habitScheduleLabel(h.rule||{}),status:current?habitStateLabel(current):'Вне расписания',progress:h.currentStreak?`Серия: ${h.currentStreak}`:'',date:h.today,done:current?.state==='success',today:!!current?.planned,action:quick?'Отметить':'Открыть',habit:h,quick};
 }).filter(row=>filter==='all'||(filter==='open'?!row.done:row.today));
 if(source==='work')return [...(day?.projectWork?.items||[]),...(day?.projectAttention?.items||[])].filter((r,i,a)=>a.findIndex(x=>x.id===r.id&&x.workspaceId===r.workspaceId)===i).map(r=>({id:r.id,title:r.title,description:r.workspace,status:r.reason,workspace:r.workspaceId,action:'Открыть'}));
 const groups=todayPlanGroups(personal.plans||[],day),todayIDs=new Set([...groups.today,...groups.events,...groups.completed].map(p=>p.id));
 const all=[...(personal.plans||[]),...(day?.recurrences||[])].filter((p,i,a)=>a.findIndex(x=>x.id===p.id)===i);
 return all.filter(p=>p.status!=='archived'&&(filter==='all'||(filter==='open'?p.status!=='done':todayIDs.has(p.id)))).map(p=>({id:p.id,title:p.title,description:p.notes||'',status:p.status==='done'?'Выполнено':p.itemKind==='event'?'Событие':'Запланировано',progress:p.plannedMinutes?`${p.actualMinutes||0} / ${p.plannedMinutes} мин`:'',date:p.startsAt||p.startDate||p.dueAt||'',done:p.status==='done',plan:p,action:p.calendarKind==='recurrence'?'Открыть повторение':p.status==='done'?'Вернуть в работу':'Выполнено'}));
}
export function dataRowsMarkup(rows,config,e){
 return rows.map(row=>`<article class="app-data-row" data-source-row="${e(row.id)}"><div class="app-data-values">${(config.fields||[]).filter(key=>row[key]!==undefined&&row[key]!=='').map(key=>key==='title'?`<strong>${e(row[key])}</strong>`:`<span class="app-data-${key}">${e(row[key])}</span>`).join('')}</div><div class="app-data-actions">${row.reader&&!config.hideReader?`<button type="button" class="secondary app-data-action" data-source-read="${e(row.id)}" aria-expanded="false" aria-label="${e(config.readLabel||'Читать')}: ${e(row.title)}">${e(config.readLabel||'Читать')}</button>`:''}${config.hideAction?'':`<button type="button" class="secondary app-data-action" data-source-action="${e(row.id)}" ${row.disabled?'disabled':''} aria-label="${e(config.actionLabel||row.action)}: ${e(row.title)}">${e(config.actionLabel||row.action)}</button>`}</div>${row.reader&&!config.hideReader?'<section class="app-data-reader" data-source-reader hidden></section>':''}</article>`).join('');
}

export function readingCompletionRequest(reading,book,chapter){
 const existing=[...(reading.entries||[]),...(reading.cancelledEntries||[])].find(x=>x.book===book&&x.chapter===chapter&&x.day===reading.today);
 return existing?{path:'/api/reading/entries/'+existing.id,method:'PATCH',body:{expectedUpdatedAt:existing.updatedAt,complete:true,note:existing.note,shared:existing.shared,restore:!!existing.cancelledAt}}:{path:'/api/reading/entries',method:'POST',body:{day:reading.today,book,first:chapter,last:chapter,complete:true,stream:'personal',note:'',shared:false}};
}
export function createPageDataUI(deps){
 const {state,api,escapeHTML:e,loadPersonal,habitUI,openPlan,togglePlan,openRecurrence,openWork,enhance}=deps;
 let generation=0;const choices=new Map(),books=new Map();
 async function textBook(id){if(!books.has(id)){const request=fetch(`/vendor/synodal/${Number(id)}.json`).then(r=>{if(!r.ok)throw new Error('Не удалось загрузить текст главы. Попробуйте ещё раз.');return r.json();}).catch(error=>{books.delete(id);throw error;});books.set(id,request);}return books.get(id);}
 async function mount(root,definition,context){
  const version=++generation,owner=state.me?.id,view=state.view;
  const alive=host=>version===generation&&owner===state.me?.id&&view===state.view&&context.workspace===state.activeWorkspaceId&&host.isConnected;
  const blocks=definition.blocks.filter(b=>b.kind==='data'&&!b.hidden);if(!blocks.length)return;
  const headers={'X-Outbox-Owner':String(owner)};
  let personalRequest=null,dayRequest=null;
  const personal=()=>personalRequest||=(async()=>{await loadPersonal();if(state.personalError)throw new Error(state.personalError);return state.personal;})();
  const day=()=>dayRequest||=api('/api/personal/day?timezone='+encodeURIComponent(Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC'),{headers});
  await Promise.all(blocks.map(async block=>{
   const host=root.querySelector(`[data-app-data="${block.id}"]`);if(!host)return;
   const config=block.data||defaultDataConfig(),key=`${owner}:${context.workspace}:${context.page.id}:${block.id}`;
   if(!choices.has(key)){let workspace='';try{workspace=localStorage.getItem('page-data-reading:'+key)||'';}catch{}choices.set(key,{query:'',limit:config.limit||20,workspace,book:0});}
   const choice=choices.get(key);let rows=[],reading=null,sequence=0;
   host.innerHTML='<p role="status">Загружаем ваши данные…</p>';
   const refresh=()=>mount(root,definition,context);
   function styles(){host.style.setProperty('--data-reader-size',(config.readerSize||18)+'px');host.style.setProperty('--data-text-size',config.textSize?config.textSize+'px':'inherit');host.style.setProperty('--data-text-color',config.textColor||'inherit');host.style.setProperty('--data-action-size',config.actionSize?config.actionSize+'px':'inherit');host.style.setProperty('--data-action-color',config.actionColor||'var(--accent)');host.style.setProperty('--data-action-bg',config.actionBackground||'var(--surface)');}
   function draw(){
    if(!alive(host))return;styles();
    const query=choice.query.toLocaleLowerCase(),shown=rows.filter(r=>!query||Object.keys(dataFields).some(f=>String(r[f]||'').toLocaleLowerCase().includes(query)));
    const teams=state.workspaces.filter(w=>w.readingEnabled);
    host.innerHTML=`<p class="app-data-private">Только ваши данные · ${e(dataSources[config.source])}</p>${config.source==='reading'?`<div class="app-data-toolbar"><label>Команда чтения<select data-reading-source><option value="">Выберите команду</option>${teams.map(w=>`<option value="${e(w.id)}" ${w.id===choice.workspace?'selected':''}>${e(w.name)}</option>`).join('')}</select></label>${reading?`<label>Книга<select data-reading-book>${reading.books.map(b=>`<option value="${b.id}" ${b.id===choice.book?'selected':''}>${e(b.name)}</option>`).join('')}</select></label>`:''}</div>${!teams.length?'<p class="muted">В доступных командах чтение ещё не включено.</p>':!choice.workspace?'<p class="muted">Выбор команды личный и не передаётся в наборе.</p>':reading&&!reading.groupId?`<form data-reading-join class="app-data-toolbar"><label>Ваша группа<select name="groupId">${reading.groups.map(g=>`<option value="${e(g.id)}">${e(g.name)}</option>`).join('')}</select></label><button type="submit" class="secondary" ${reading.groups.length?'':'disabled'}>Выбрать группу</button><p class="muted">Отметки и мысли остаются личными; в рейтинг группы попадает количество глав.</p></form>`:''}`:''}${config.search?`<input data-source-search type="search" aria-label="Поиск: ${e(block.title||dataSources[config.source])}" placeholder="Найти в этом блоке">`:''}<div class="app-data-rows ${config.layout==='cards'?'is-cards':''}">${dataRowsMarkup(shown.slice(0,choice.limit),config,e)||'<p class="muted">В этом представлении записей нет. Фильтр и источник можно изменить в конструкторе.</p>'}</div>${shown.length>choice.limit?'<button type="button" class="text-button" data-source-more>Показать ещё</button>':''}${config.source==='work'?'<p class="muted">Назначенная вам работа и сигналы дня из доступных проектов. Все задачи проекта доступны в блоке «Список записей».</p>':''}<p role="status" data-source-status></p><button type="button" class="text-button" data-source-refresh>Обновить данные</button>`;
    const search=host.querySelector('[data-source-search]');if(search){search.value=choice.query;search.oninput=()=>{choice.query=search.value;const start=search.selectionStart;draw();const input=host.querySelector('[data-source-search]');input.focus();if(input.type==='text')input.setSelectionRange(start,start);};}
    host.querySelector('[data-source-more]')?.addEventListener('click',()=>{choice.limit+=(config.limit||20);draw();});
    host.querySelector('[data-source-refresh]').onclick=async()=>{await loadPersonal({force:true});if(alive(host))refresh();};
    host.querySelector('[data-reading-source]')?.addEventListener('change',event=>{choice.workspace=event.target.value;choice.book=0;try{localStorage.setItem('page-data-reading:'+key,choice.workspace);}catch{}void loadReading();});
    host.querySelector('[data-reading-join]')?.addEventListener('submit',async event=>{event.preventDefault();const form=event.target;const groupId=form.elements.groupId.value;form.querySelector('button').disabled=true;try{await api('/api/reading/join',{method:'POST',headers:{...headers,'X-Workspace-ID':choice.workspace},body:JSON.stringify({groupId})});if(alive(host))await loadReading();}catch(error){if(alive(host))host.querySelector('[data-source-status]').textContent=error.message;}finally{if(form.isConnected)form.querySelector('button').disabled=false;}});
    host.querySelector('[data-reading-book]')?.addEventListener('change',event=>{choice.book=Number(event.target.value);choice.limit=config.limit||20;readingRows();draw();});
    host.querySelectorAll('[data-source-action]').forEach(button=>{const row=rows.find(r=>r.id===button.dataset.sourceAction);if(!row)return;
     if(config.source==='habits'){button.setAttribute(row.quick?'data-habit-quick':'data-habit-open',row.id);if(!row.quick)button.setAttribute('data-habit-date',row.habit.today);}
     else button.onclick=async()=>{if(!alive(host))return;button.disabled=true;try{
      if(config.source==='plans'){if(row.plan.calendarKind==='recurrence')await openRecurrence(row.plan);else await togglePlan(row.id);}
      else if(config.source==='work')await openWork(row.id,row.workspace);
      else if(config.source==='reading'){
       const change=readingCompletionRequest(reading,choice.book,row.chapter);
       const saved=await api(change.path,{method:change.method,headers:{...headers,'X-Workspace-ID':choice.workspace},body:JSON.stringify(change.body)});
       if(alive(host)){await loadReading();host.querySelector('[data-source-status]').textContent=(change.method==='PATCH'||saved.added)?'Глава отмечена прочитанной.':'Эта глава уже отмечена сегодня.';}
      }
     }catch(error){if(alive(host))host.querySelector('[data-source-status]').textContent=error.message;}finally{if(button.isConnected&&alive(host))button.disabled=false;}};
    });
    host.querySelectorAll('[data-source-read]').forEach(button=>{button.onclick=async()=>{
     const row=rows.find(r=>r.id===button.dataset.sourceRead),panel=button.closest('article').querySelector('[data-source-reader]');
     if(!panel.hidden){panel.hidden=true;button.setAttribute('aria-expanded','false');return;}
     panel.hidden=false;button.setAttribute('aria-expanded','true');panel.innerHTML='<p role="status">Загружаем текст…</p>';const bookId=choice.book;
     try{const book=await textBook(bookId);if(!alive(host)||!panel.isConnected||bookId!==choice.book)return;
      const verses=book.chapters[row.chapter-1];if(!verses)throw new Error('Глава отсутствует в этом издании.');
      panel.innerHTML=`<h4>${e(row.title)}</h4><p class="muted">${e(book.translation)} · <a href="https://ebible.org/russyn/" target="_blank" rel="noopener noreferrer">Источник текста</a></p>${verses.map(v=>`<p><sup>${v.verse}</sup> ${e(v.text)}</p>`).join('')}<p class="muted">Открытие текста не отмечает главу прочитанной.</p>`;
     }catch(error){if(alive(host)&&panel.isConnected)panel.innerHTML=`<p role="alert">${e(error.message)}</p>`;}
    };});
    if(config.source==='habits')habitUI.bind(host);
    if(config.source==='plans')host.querySelectorAll('[data-source-row]').forEach(node=>{const row=rows.find(r=>r.id===node.dataset.sourceRow);const title=node.querySelector('strong');if(title){const b=document.createElement('button');b.type='button';b.className='text-button app-data-title';b.textContent=title.textContent;b.onclick=()=>row.plan.calendarKind==='recurrence'?openRecurrence(row.plan):openPlan(row.id);title.replaceWith(b);}});
    enhance(host);
   }
   function readingRows(){if(!reading){rows=[];return;}const book=reading.books.find(b=>b.id===choice.book)||reading.books[0];if(!book){rows=[];return;}choice.book=book.id;
    rows=Array.from({length:book.chapters},(_,i)=>{const chapter=i+1,entries=reading.entries.filter(x=>x.book===book.id&&x.chapter===chapter),last=entries.map(x=>x.day).sort().at(-1)||'',today=entries.some(x=>x.day===reading.today&&x.complete);return{id:String(chapter),chapter,reader:true,title:`${book.name} ${chapter}`,description:'Отметка в дневнике чтения',status:today?'Прочитано сегодня':last?'Читали ранее':'Ещё не отмечено',date:last,progress:`${chapter} / ${book.chapters}`,done:today,disabled:today||!reading.groupId,action:'Прочитано'};}).filter(r=>config.filter==='today'?r.done:config.filter==='open'?!r.done:true);
   }
   async function loadReading(){const turn=++sequence,workspace=choice.workspace;reading=null;rows=[];draw();if(!workspace)return;
    try{const value=await api('/api/reading?period=week',{headers:{...headers,'X-Workspace-ID':workspace}});if(!alive(host)||turn!==sequence||workspace!==choice.workspace)return;reading=value;if(!choice.book)choice.book=reading.nextBook||43;readingRows();draw();}
    catch(error){if(alive(host)&&turn===sequence)host.querySelector('[data-source-status]').textContent=error.message;}
   }
   try{if(config.source==='reading'){await loadReading();return;}const [p,d]=await Promise.all([personal(),config.source==='habits'?Promise.resolve(null):day()]);if(!alive(host))return;rows=personalDataRows(config.source,p,d,config.filter||'today');draw();}
   catch(error){if(alive(host)){host.innerHTML=`<p role="alert">${e(error.message)}</p><button class="secondary" type="button">Повторить</button>`;host.querySelector('button').onclick=async()=>{if(!alive(host))return;host.querySelector('button').disabled=true;await loadPersonal({force:true});if(alive(host))refresh();};}}
  }));
 }
 return {mount};
}
