const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, low, high) => Math.max(low, Math.min(value, high));

// Coordinates use the layout viewport, like getBoundingClientRect and fixed popovers.
// visualViewport offsets locate the portion still visible after zoom or the keyboard.
export function selectMenuPosition({ anchor, viewport, contentHeight, safeInsets = {}, maxHeight = 320, minWidth = 180, gap = 6, margin = 12 }) {
  const leftBoundary = finite(viewport.left) + Math.max(margin, finite(safeInsets.left));
  const topBoundary = finite(viewport.top) + Math.max(margin, finite(safeInsets.top));
  const rightBoundary = Math.max(leftBoundary, finite(viewport.left) + finite(viewport.width) - Math.max(margin, finite(safeInsets.right)));
  const bottomBoundary = Math.max(topBoundary, finite(viewport.top) + finite(viewport.height) - Math.max(margin, finite(safeInsets.bottom)));
  const width = Math.min(rightBoundary - leftBoundary, Math.max(minWidth, finite(anchor.width)));
  const left = clamp(finite(anchor.left), leftBoundary, rightBoundary - width);
  const desiredHeight = Math.max(0, Math.min(maxHeight, finite(contentHeight)));
  const above = Math.max(0, finite(anchor.top) - topBoundary - gap);
  const below = Math.max(0, bottomBoundary - finite(anchor.bottom) - gap);
  const hidden = anchor.bottom <= topBoundary || anchor.top >= bottomBoundary || anchor.right <= leftBoundary || anchor.left >= rightBoundary;
  // Less than two touch rows would turn an ordinary choice into a tiny scroll slit.
  const fallback = hidden || Math.max(above, below) < Math.min(88, desiredHeight);
  if (fallback) {
    const height = Math.min(desiredHeight, bottomBoundary - topBoundary);
    return { left, top: topBoundary + (bottomBoundary - topBoundary - height) / 2, width, height, placement: 'viewport', reason: hidden ? 'anchor-hidden' : 'space' };
  }
  const placement = below < desiredHeight && above > below ? 'above' : 'below';
  const height = Math.min(desiredHeight, placement === 'above' ? above : below);
  return { left, top: placement === 'above' ? anchor.top - gap - height : anchor.bottom + gap, width, height, placement, reason: '' };
}

// Scroll only the list. Element.scrollIntoView can move every ancestor, including
// the form and the document, and loses the visual connection to the edited field.
export function selectOptionScrollTop({ scrollTop, clientHeight, scrollHeight, menuTop, optionTop, optionBottom, padding = 6, topInset = 0 }) {
  const top = optionTop - menuTop;
  const bottom = optionBottom - menuTop;
  const topBoundary = padding + Math.max(0, topInset);
  const change = top < topBoundary ? top - topBoundary : bottom > clientHeight - padding ? bottom - clientHeight + padding : 0;
  return clamp(scrollTop + change, 0, Math.max(0, scrollHeight - clientHeight));
}
