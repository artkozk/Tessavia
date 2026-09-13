// Stable UI labels only. Amounts, dates and record contents never become captions.
const originals = new WeakMap();
const validKey = /^[a-zA-Z0-9_:-]{1,94}$/;

export function pageLabelTargets(root) {
  const result = new Map();
  for (const node of root.querySelectorAll('[data-page-label]')) {
    const key = node.getAttribute('data-page-label');
    if (!validKey.test(key || '') || node.children.length || node.matches('input,textarea,select')) continue;
    if (!originals.has(node)) originals.set(node, node.textContent.trim());
    const original = originals.get(node);
    if (!original) continue;
    const id = `label:${key}`;
    if (!result.has(id)) result.set(id, { key: id, original, nodes: [] });
    result.get(id).nodes.push(node);
  }
  return [...result.values()];
}

export function applyPageLabels(root, texts = {}, editing = false) {
  const targets = pageLabelTargets(root);
  for (const target of targets) for (const node of target.nodes) {
    const text = texts[target.key] || target.original;
    if (node.textContent !== text) node.textContent = text;
    node.classList.toggle('page-label-editable', editing);
  }
  return targets;
}

export function updatePageTexts(previous, edits) {
  const texts = { ...previous };
  for (const { key, original, value } of edits) {
    if (!/^[a-zA-Z0-9_:-]{1,100}$/.test(key || '')) continue;
    const text = [...String(value ?? '').trim()].slice(0, 160).join('');
    if (!text || text === original) delete texts[key];
    else texts[key] = text;
  }
  return texts;
}
