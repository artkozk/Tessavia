export const blockKindSafetyMessage = 'В этом списке настроены действия. Добавьте блок нужного типа рядом; этот список можно скрыть, сохранив настройки.';

// A select can emit input followed by change, or change only through our custom
// picker. Reject before either handler persists or rewrites block properties.
export function createBlockKindGuard(block, onBlocked) {
  const rejected = new WeakMap();
  return event => {
    const input = event.target;
    if (input?.name !== 'kind') return false;
    if (block.kind !== 'records' || !block.actions?.length) {
      rejected.delete(input);
      return false;
    }
    if (rejected.get(input) === block.kind && input.value === block.kind) {
      if (event.type === 'change') rejected.delete(input);
      return true;
    }
    if (input.value === block.kind) return false;
    const requested = input.value;
    input.value = block.kind;
    if (event.type === 'input') rejected.set(input, block.kind);
    else rejected.delete(input);
    onBlocked(requested);
    return true;
  };
}

export function showBlockKindWarning(form, blockId, openCatalog) {
  let warning = form.querySelector('[data-block-kind-warning]');
  if (!warning) {
    warning = document.createElement('section');
    warning.className = 'app-draft-notice';
    warning.dataset.blockKindWarning = '';
    warning.id = `block-kind-safety-${blockId}`;
    warning.setAttribute('role', 'status');
    warning.setAttribute('aria-live', 'polite');
    const message = document.createElement('p');
    message.textContent = blockKindSafetyMessage;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.dataset.blockKindCatalog = '';
    button.textContent = 'Выбрать другой блок';
    warning.append(message, button);
    const select = form.elements.kind;
    const anchor = select.closest('.form-grid') || select.closest('label');
    anchor.insertAdjacentElement('afterend', warning);
    select.setAttribute('aria-describedby', warning.id);
    select.closest('.custom-select')?.querySelector('.custom-select-trigger')?.setAttribute('aria-describedby', warning.id);
  }
  warning.querySelector('[data-block-kind-catalog]').onclick = openCatalog;
  return warning;
}
