const referenceKinds={project:{field:'projectId',collection:'projects',label:'Личный проект',icon:'folder'},goal:{field:'goalId',collection:'goals',label:'Цель',icon:'target'},parent:{field:'parentId',collection:'plans',history:'parents',label:'Родительское дело',icon:'checkSquare'}};

// historicalReferences contains only the current owner's referenced archives.
// It supplies labels for existing relationships, never a new choice catalogue.
export function personalPlanReference(personal,kind,id){
 const config=referenceKinds[kind];
 if(!config||!id)return null;
 const active=(personal?.[config.collection]||[]).find(item=>item.id===id&&item.status!=='archived');
 if(active)return {...active,state:'active'};
 const archived=(personal?.historicalReferences?.[config.history||config.collection]||[]).find(item=>item.id===id);
 return archived?{...archived,state:'archived'}:{id,state:'unavailable'};
}

export function personalPlanReferenceOptions(personal,plan,kind,e){
 const config=referenceKinds[kind],current=plan[config.field]||'';
 const choices=(personal?.[config.collection]||[]).filter(item=>item.status!=='archived'&&(kind!=='parent'||item.id!==plan.id&&item.status==='planned')).map(item=>({...item,state:'active'}));
 if(current&&!choices.some(item=>item.id===current))choices.push(personalPlanReference(personal,kind,current));
 return choices.map(item=>{
  const label=item.state==='unavailable'?'Недоступная связь — уберите или замените':`${item.title}${item.state==='archived'?' · в архиве':kind==='parent'&&item.status==='done'?' · завершено':''}`;
  return `<option value="${e(item.id)}" ${current===item.id?'selected':''}>${e(label)}</option>`;
 }).join('');
}

export function restorePersonalPlanReferenceChoice(field,value){
 const wanted=String(value??'');
 if(!wanted||[...field.options].some(option=>option.value===wanted))return;
 const option=field.ownerDocument.createElement('option');
 option.value=wanted;option.textContent='Связь из черновика недоступна — уберите или замените';
 field.append(option);
}

export function personalPlanReferenceError(personal,plan,values){
 for(const [kind,config] of Object.entries(referenceKinds)){
  const id=String((typeof values?.get==='function'?values.get(config.field):values?.[config.field])||'');
  if(!id)continue;
  const reference=personalPlanReference(personal,kind,id);
  if(reference.state==='unavailable'||reference.state==='archived'&&id!==plan[config.field]||kind==='parent'&&id===plan.id)return{field:config.field,message:`${config.label}: связь недоступна. Уберите её или выберите доступную.`};
 }
 return null;
}

export function bindPersonalPlanReferenceFields(form,personal,plan){
 for(const [kind,config] of Object.entries(referenceKinds)){
  const field=form.elements[config.field],notice=form.querySelector(`[data-personal-reference-notice="${kind}"]`);
  if(!field||!notice)continue;
  const update=()=>{
   const id=field.value,reference=personalPlanReference(personal,kind,id),allowedArchive=reference?.state==='archived'&&id===plan[config.field];
   const error=personalPlanReferenceError(personal,plan,{[config.field]:id});
   field.setCustomValidity(error?.message||'');
   const relationNote=kind==='project'&&form.elements.goalId?.value?'Если цель связана с проектом, «Без проекта» сохранит проект цели. Чтобы убрать обе связи, сначала выберите «Без цели».':'';
   notice.textContent=error?error.message:[allowedArchive?'В архиве. Можно оставить эту связь, заменить или убрать её.':kind==='parent'&&reference?.status==='done'?'Родительское дело завершено. Сохранённая связь останется.':'',relationNote].filter(Boolean).join(' ');
   notice.hidden=!notice.textContent;
  };
  field.addEventListener('change',update);if(kind==='project')form.elements.goalId?.addEventListener('change',update);update();
 }
}

export function bindPersonalPlanDraftReview(form,personal,plan,{escapeHTML:e,schedule='',owns=()=>true,onDiscard=null,onRefresh=null,conflicted=false}){
 const version=form.elements.expectedUpdatedAt;
 if(!version||!conflicted&&version.value&&version.value===plan.updatedAt)return;
 form.querySelector('.personal-plan-draft-review')?.remove();
 form.personalPlanReviewRequired=true;
 const panel=form.ownerDocument.createElement('section');panel.className='personal-plan-draft-review';
 if(conflicted){
  panel.innerHTML='<h3>Дело изменилось в другом окне</h3><p>Ваши изменения остались в форме. Загрузите сохранённое дело и сравните его с черновиком перед повторной отправкой.</p><button type="button" class="secondary" data-personal-plan-refresh-draft>Загрузить сохранённое дело для сравнения</button>';
  panel.querySelector('[data-personal-plan-refresh-draft]').onclick=async event=>{if(!owns())return;const button=event.currentTarget;button.disabled=true;try{await onRefresh?.();}finally{button.disabled=false;}};
  form.prepend(panel);return;
 }
 const references=Object.entries(referenceKinds).map(([kind,config])=>personalPlanReferenceSummary(personal,kind,plan[config.field])).filter(Boolean);
 const reviewedVersion=plan.updatedAt;
 const explanation=version.value?'После создания черновика дело изменилось. Сравните ваши поля с сохранённым делом перед отправкой.':'Этот черновик создан раньше, и мы не можем определить, менялось ли дело после него. Сравните восстановленные поля с сохранённым делом перед отправкой.';
 panel.innerHTML=`<h3>Проверьте восстановленный черновик</h3><p>${explanation}</p><details><summary>Сравнить с сохранённым делом</summary><h4>${e(plan.title||'Без названия')}</h4><p class="personal-plan-saved-notes">${e(plan.notes||'Без описания')}</p><p>${e([schedule,...references].filter(Boolean).join(' · '))}</p><p>План: ${Number(plan.plannedMinutes)||0} мин. Факт: ${Number(plan.actualMinutes)||0} мин.</p></details><button type="button" class="secondary" data-personal-plan-review-draft>Я сравнил, продолжить с черновиком</button>${onDiscard?'<button type="button" class="text-button" data-personal-plan-discard-draft>Удалить черновик и открыть сохранённое</button>':''}`;
 form.prepend(panel);
 panel.querySelector('[data-personal-plan-review-draft]').onclick=()=>{if(!owns())return;version.value=reviewedVersion;form.personalPlanReviewRequired=false;panel.remove();form.dispatchEvent(new Event('input',{bubbles:true}));};
 const discard=panel.querySelector('[data-personal-plan-discard-draft]');if(discard&&onDiscard)discard.onclick=()=>{if(owns())onDiscard();};
}

export function personalPlanReferenceSummary(personal,kind,id){
 const reference=personalPlanReference(personal,kind,id);
 if(!reference)return '';
 if(reference.state==='unavailable')return `${referenceKinds[kind].label}: связь недоступна`;
 return `${reference.title}${reference.state==='archived'?' · в архиве':''}`;
}

export function personalPlanReferenceDetails(personal,plan,e,icon){
 const items=Object.entries(referenceKinds).map(([kind,config])=>{
  const reference=personalPlanReference(personal,kind,plan[config.field]);if(!reference)return '';
  const attributes=`class="personal-context-link" data-personal-reference-state="${reference.state}"`;
  if(reference.state==='active')return `<button type="button" ${attributes} ${kind==='parent'?`data-plan-parent="${e(reference.id)}"`:`data-personal-edit="${kind}" data-personal-id="${e(reference.id)}"`}>${icon(config.icon)}<span>${e(config.label)}: ${e(reference.title)}${kind==='parent'&&reference.status==='done'?'<small>Завершено</small>':''}</span></button>`;
  return `<div ${attributes}>${icon(config.icon)}<span>${e(config.label)}${reference.state==='archived'?`: ${e(reference.title)}<small>В архиве · связь сохранена</small>`:': связь недоступна<small>Уберите или замените связь в редакторе дела.</small>'}</span></div>`;
 }).filter(Boolean).join('');
 return items?`<div class="personal-plan-references">${items}</div>`:'';
}
