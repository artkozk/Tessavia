import { applyElementStyle } from './page-element-styles.js?v=20260908-record-card-composition-1';

// Translate the earlier field-wide presentation once when entering the editor.
// A later reset can then return to the platform defaults, not a hidden legacy value.
export function migrateFormElementStyles(block) {
 for(const field of block.formFields||[]) {
  const text={};if(field.fontSize)text.fontSize=field.fontSize;if(field.color)text.color=field.color;
  const control={...text};if(field.background)control.background=field.background;
  if(Object.keys(text).length||Object.keys(control).length){
   block.elementStyles||={};
   for(const [prefix,style] of [['formLabel',text],['formControl',control]])if(Object.keys(style).length){const key=prefix+':'+field.key;block.elementStyles[key]={...style,...block.elementStyles[key]};}
  }
  delete field.fontSize;delete field.color;delete field.background;
 }
}

export function prepareFormElements(form,block) {
 const scope=form.dataset.captionScope||=crypto.randomUUID();
 for(const field of block.formFields||[]) {
  const cell=form.querySelector(`[data-form-field-key="${field.key}"]`);if(!cell)continue;
  const label=cell.querySelector(':scope > label'),legend=cell.querySelector('legend');
  let caption=legend;
  if(label){
   if(label.classList.contains('collection-checkbox'))caption=label.querySelector('span');
   else {
    caption=label.querySelector('[data-form-caption]');
    if(!caption){caption=document.createElement('span');caption.dataset.formCaption='';for(const node of [...label.childNodes]){if(node.nodeType!==3)break;caption.append(node);}label.prepend(caption);}
   }
  }
  if(caption){caption.dataset.appElement=`formLabel formLabel:${field.key}`;caption.id=`form-caption-${scope}-${field.key.replaceAll(':','-')}`;}
  const group=cell.querySelector('[data-multi-field]');
  if(group&&caption)group.setAttribute('aria-labelledby',caption.id);
  for(const control of cell.querySelectorAll('input,textarea,select')) {
   // A hidden visual caption must not remove the accessible field name.
   if(caption&&!group)control.setAttribute('aria-labelledby',caption.id);
   const surface=control.type==='checkbox'?control.closest('label')||control:control;surface.dataset.appElement=`formControl formControl:${field.key}`;
  }
 }
 const submit=form.querySelector('[type=submit]'),result=form.querySelector('[data-form-result]');
 if(submit)submit.dataset.appElement='formSubmit';if(result)result.dataset.appElement='formResult';
}

export function styleFormElements(form,block) {
 // Enhanced selects keep their real select hidden. Style the visible trigger,
 // never unhide the native select or replace a user's partially filled input.
 for(const select of form.querySelectorAll('select[data-app-element]')) {
  const trigger=select.closest('.custom-select')?.querySelector('.custom-select-trigger');
  if(trigger){trigger.dataset.appElement=select.dataset.appElement;const label=select.getAttribute('aria-labelledby');if(label)trigger.setAttribute('aria-labelledby',label);}
 }
 for(const node of form.querySelectorAll('[data-app-element]'))if(node.tagName!=='SELECT')applyElementStyle(block,node);
}
