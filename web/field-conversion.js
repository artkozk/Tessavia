export const collectionFieldTypeNames = {
  text: 'Короткий текст', long_text: 'Большой текст', number: 'Число', money: 'Сумма',
  date: 'Дата', datetime: 'Дата и время', select: 'Один вариант', multi_select: 'Несколько вариантов',
  user: 'Участник', checkbox: 'Да / нет', url: 'Ссылка', email: 'Почта', phone: 'Телефон', relation: 'Связанная карточка',
};
const conversions = {text:['long_text'], long_text:['text'], number:['money'], money:['number'], select:['multi_select'], multi_select:['select']};
export function fieldConversionChoices(type) { return [type, ...(conversions[type] || [])]; }
export function incompatibleChoiceDraft(value, options) {
  const values = Array.isArray(value) ? value : value === '' || value == null ? [] : [String(value)];
  return values.length > 1 || values.some(item => !options.includes(String(item)));
}
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function fieldConversionValue(value, field) {
  if (value === null || value === undefined) return 'Не задано';
  if (value === '' || (Array.isArray(value) && value.length === 0)) return 'Пусто';
  if (Array.isArray(value)) return value.map(item => fieldConversionValue(item,field)).join(', ');
  if (['select','multi_select'].includes(field.fieldType)) return field.options?.find(option => option.id === value)?.name || String(value);
  return typeof value === 'boolean' ? (value ? 'Да' : 'Нет') : String(value);
}
export function fieldConversionPreviewHTML(preview, field) {
  const format = (value, raw) => esc(['number','money'].includes(field.fieldType) && raw && raw !== 'null' ? raw : fieldConversionValue(value,field));
  const title = type => esc(collectionFieldTypeNames[type] || type);
  return `<h3>Проверьте изменения</h3><p><strong>${title(preview.from)}</strong> → <strong>${title(preview.to)}</strong></p>
    <p>Карточек с сохранённым значением: <strong>${Number(preview.affected) || 0}</strong>. Формат изменится у ${Number(preview.changed) || 0}.</p>
    ${preview.archived ? `<p class="muted">В том числе архивных: ${Number(preview.archived)}.</p>` : ''}
    ${preview.detached ? `<p class="muted">Ранее убраны с доски, но сохранили значение: ${Number(preview.detached)}.</p>` : ''}
    ${(preview.examples || []).length ? `<div class="field-conversion-examples">${preview.examples.map(row => `<article><strong>${esc(row.recordTitle || 'Карточка')}</strong><dl><div><dt>Сейчас</dt><dd>${format(row.value,row.valueRaw)}</dd></div><div><dt>После изменения</dt><dd>${format(row.converted,row.convertedRaw)}</dd></div></dl></article>`).join('')}</div>` : '<p class="muted">Заполненных карточек пока нет.</p>'}
    <div class="field-conversion-default"><strong>Начальное значение для новых карточек</strong><p>${format(preview.defaultBefore,preview.defaultBeforeRaw)} → ${format(preview.defaultAfter,preview.defaultAfterRaw)}</p></div>
    <p class="muted">Сохранённые значения и варианты остаются. Изменение типа применяется ко всей доске. Если данные изменятся до подтверждения, потребуется новый предпросмотр.</p>`;
}
