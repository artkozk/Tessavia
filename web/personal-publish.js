export function publicationPayload(form, kind, id) {
  const values = new FormData(form);
  return { sourceType:kind, sourceId:id, expectedUpdatedAt:values.get('version'), workspaceId:values.get('workspace'), type:values.get('type'), title:String(values.get('title') || '').trim(), body:values.get('body') || '', attachmentIds:values.getAll('files').sort() };
}

export function createPersonalPublishUI({state,api,escapeHTML:esc,icon,renderMarkdown,openModal,closeDialog,flushDrafts,bindDraft,clearDraft,toast,openCopy}) {
  const q=(selector,root=document)=>root.querySelector(selector);
  async function open(kind,id) {
    const owner=state.me.id,dialog=q('#workspace-dialog'),content=q('#workspace-dialog-content');
    if(dialog.open && !flushDrafts(dialog)){toast('Не удалось сохранить черновик на устройстве',true);return;}
    content.innerHTML=`<div class="workspace-editor-shell personal-publish-dialog"><header><h2>Опубликовать в проект</h2><button type="button" class="icon-button" data-publish-close aria-label="Закрыть">${icon('x')}</button></header><div data-publish-content><p class="muted">Загружаем сохранённую запись…</p></div></div>`;
    const root=q('[data-publish-content]',content),alive=()=>owner===state.me?.id && root.isConnected && dialog.open;
    q('[data-publish-close]',content).onclick=()=>closeDialog(dialog);openModal(dialog);
    const read=(path,options={})=>api(path,{...options,headers:{'X-Outbox-Owner':String(owner)}});
    let source,projects,files;
    try {
      [source,projects,files]=await Promise.all([read(`/api/personal/publications/source/${kind}/${id}`),read('/api/workspaces'),kind==='note'?read(`/api/personal/notes/${id}/attachments`):Promise.resolve([])]);
      if(!alive())return;
      projects=projects.filter(item=>item.kind==='team' && ['owner','admin','member'].includes(item.role));files=files.filter(item=>!item.removedAt);
    } catch(error){if(alive())root.innerHTML=`<p role="alert">${esc(error.message)}</p><button type="button" class="secondary" data-publish-retry>Повторить</button>`;q('[data-publish-retry]',root)?.addEventListener('click',()=>open(kind,id));return;}
    if(!projects.length){root.innerHTML='<p>У вас пока нет проекта, в котором можно создавать карточки. Присоединитесь к проекту или создайте его в разделе «Команды и проекты».</p>';return;}
    root.innerHTML=`<p class="muted">Выберите, что попадёт в проект. Здесь используется сохранённая версия записи. Черновик в личном редакторе сохранится отдельно.</p><form class="personal-publish-form"><input type="hidden" name="version" value="${esc(source.updatedAt)}"><input type="hidden" name="requestKey"><input type="hidden" name="fingerprint"><input type="hidden" name="previewId"><div class="form-grid two"><label>Проект<select name="workspace" required><option value="">Выберите проект</option>${projects.map(item=>`<option value="${esc(item.id)}">${esc(item.name)}</option>`).join('')}</select></label><label>Создать как<select name="type"><option value="document">Документ</option><option value="idea">Идея</option><option value="task">Задача</option></select></label></div><label>Название копии<input name="title" maxlength="240" required value="${esc(source.title)}"></label><label>Текст копии<textarea name="body" rows="7" maxlength="100000">${esc(source.body)}</textarea></label><fieldset class="publication-files"><legend>Файлы в копии</legend>${files.length?files.map(file=>`<label><input type="checkbox" name="files" value="${esc(file.id)}"><span>${esc(file.name)}<small>${Math.max(1,Math.round(file.size/1024))} КБ</small></span></label>`).join(''):'<p class="muted">Нет сохранённых вложений.</p>'}</fieldset><p class="muted">Копию увидят все участники выбранного проекта, в том числе присоединившиеся позже. Личные связи, история и другие поля не публикуются. Дальнейшие правки оригинала и копии независимы.</p><div class="form-actions"><button type="submit" class="primary">Предпросмотр</button><button type="button" class="text-button" data-publication-refresh>Обновить версию оригинала</button></div></form><section data-publication-preview hidden></section><p role="alert" data-publication-error></p>`;
    const form=q('form',root),previewRoot=q('[data-publication-preview]',root),error=q('[data-publication-error]',root),scope=`personal:${owner}:publish:${kind}:${id}`;
    bindDraft(form,scope);
    let busy=false;
    const showError=failure=>{if(alive())error.textContent=failure.message;};
    const showForm=()=>{root.firstElementChild.hidden=false;form.hidden=false;previewRoot.hidden=true;error.textContent='';};
    function success(value){
      clearDraft(form);root.firstElementChild.hidden=true;form.hidden=true;previewRoot.hidden=false;
      previewRoot.innerHTML=`<h3>Копия создана в проекте</h3><p>${esc(value.title)}</p><p class="muted">Личная запись остаётся только у вас. Правки командной копии не меняют оригинал.</p><div class="form-actions"><button type="button" class="primary" data-published-open>Открыть копию</button><button type="button" class="secondary" data-published-close>Вернуться к личной записи</button></div>`;
      q('[data-published-close]',root).onclick=()=>closeDialog(dialog);
      q('[data-published-open]',root).onclick=async()=>{try{if(await closeDialog(dialog))await openCopy(value,owner);}catch(failure){toast(failure.message,true);}};
    }
    q('[data-publication-refresh]',form).onclick=async()=>{
      if(busy)return;busy=true;error.textContent='';
      try{
        if(form.elements.previewId.value){const previous=await read(`/api/personal/publications/${form.elements.previewId.value}`);if(!alive())return;if(previous.recordId){success(previous);return;}}
        const latest=await read(`/api/personal/publications/source/${kind}/${id}`);if(!alive())return;
        form.elements.version.value=latest.updatedAt;form.elements.requestKey.value='';form.elements.fingerprint.value='';form.elements.previewId.value='';
        form.dispatchEvent(new Event('input',{bubbles:true}));toast('Версия обновлена. Выбранный текст копии сохранён — проверьте его перед публикацией.');
      }catch(failure){showError(failure);}finally{busy=false;}
    };
    function showPreview(preview){
      root.firstElementChild.hidden=true;form.hidden=true;previewRoot.hidden=false;
      if(preview.recordId){success(preview);return;}
      previewRoot.innerHTML=`<p class="eyebrow">Предпросмотр публикации</p><h3>${esc(preview.title)}</h3><p><strong>${esc(preview.workspaceName)}</strong> · ${esc({document:'Документ',idea:'Идея',task:'Задача'}[preview.type])}</p><div class="publication-text markdown-body">${renderMarkdown(preview.body) || '<p class="muted">Без текста</p>'}</div><div class="publication-selected-files"><strong>Выбранные файлы: ${preview.files.length}</strong>${preview.files.map(file=>`<p>${icon('fileText')} ${esc(file.name)}</p>`).join('')}</div><p>Видно всем участникам этого проекта, включая будущих. Участники смогут редактировать копию.</p><p class="muted">Это отдельная карточка. Оригинал, личные связи, история, даты и показатели остаются в личном пространстве. Автоматической синхронизации не будет.</p><div class="form-actions"><button type="button" class="primary" data-publish-confirm>Подтвердить публикацию</button><button type="button" class="secondary" data-publish-back>Изменить выбор</button></div>`;
      const confirm=q('[data-publish-confirm]',root),back=q('[data-publish-back]',root);
      back.onclick=showForm;
      confirm.onclick=async()=>{
        if(busy)return;busy=true;confirm.disabled=true;back.disabled=true;error.textContent='';
        try{const value=await read(`/api/personal/publications/${preview.id}/apply`,{method:'POST',body:JSON.stringify({confirm:true})});if(alive())success(value);}
        catch(failure){if(alive()){showError(failure);confirm.textContent='Повторить подтверждение';}}
        finally{busy=false;confirm.disabled=false;back.disabled=false;}
      };
    }
    form.addEventListener('submit',async event=>{
      event.preventDefault();if(busy || !form.reportValidity())return;
      if(new FormData(form).getAll('files').length>20){error.textContent='За одну публикацию можно выбрать до 20 файлов.';return;}
      busy=true;const button=q('[type=submit]',form);button.disabled=true;error.textContent='';
      try{
        const payload=publicationPayload(form,kind,id),fingerprint=JSON.stringify(payload);
        if(form.elements.fingerprint.value!==fingerprint || !form.elements.requestKey.value){form.elements.fingerprint.value=fingerprint;form.elements.requestKey.value=crypto.randomUUID().replaceAll('-','');}
        // Persist the exact key before any network write, including the initial unchanged form.
        form.dispatchEvent(new Event('input',{bubbles:true}));
        if(!flushDrafts(dialog))throw new Error('Не удалось сохранить состояние публикации на устройстве. Повторите после освобождения места.');
        const preview=await read('/api/personal/publications/preview',{method:'POST',body:JSON.stringify({...payload,requestKey:form.elements.requestKey.value})});
        if(alive()){
          form.elements.previewId.value=preview.id;form.dispatchEvent(new Event('input',{bubbles:true}));
          if(!flushDrafts(dialog))throw new Error('Не удалось сохранить предпросмотр на устройстве. Повторите перед подтверждением.');
          showPreview(preview);
        }
      }catch(failure){showError(failure);}finally{busy=false;button.disabled=false;}
    });
  }
  return {open};
}
