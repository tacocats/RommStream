/**
 * D-pad focus movement for the web build, standing in for the TV focus engine
 * react-native-tvos gets from Android/tvOS. Pressing a direction moves DOM
 * focus to the nearest focusable element that way; react-native-web turns
 * that into the onFocus/onBlur that FocusablePressable draws its ring from,
 * and Enter on a focused Pressable presses it.
 *
 * Nearest means: the candidate must lie beyond the current element in the
 * direction of travel, and among those the one with the least distance along
 * that axis wins, with sideways offset counting double so a straight line
 * (the tile directly below) beats a diagonal one. Candidates that overlap the
 * current element sideways count as perfectly aligned.
 */

export type Direction = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE_SELECTOR = [
  'input:not([disabled])',
  'textarea:not([disabled])',
  'select:not([disabled])',
  'button:not([disabled])',
  'a[href]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** See TVFocusGuideView in web/shims/react-native.tsx. */
const FOCUS_TRAP_SELECTOR = '[data-focus-trap="true"]';

const SIDEWAYS_WEIGHT = 2;

function isVisible(element: Element): boolean {
  if (typeof (element as HTMLElement).checkVisibility === 'function') {
    if (
      !(element as HTMLElement).checkVisibility({ visibilityProperty: true })
    ) {
      return false;
    }
  }
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function isCandidate(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    element.getAttribute('aria-disabled') !== 'true' &&
    isVisible(element)
  );
}

/** Focusable elements under `root`, in document order. */
export function focusableElements(root: ParentNode = document): HTMLElement[] {
  return Array.from(root.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    isCandidate,
  );
}

/**
 * Where focus may move to: inside the innermost focus trap if there is one
 * on screen (a modal, the in-game menu), else anywhere.
 */
function searchRoot(): ParentNode {
  const traps = Array.from(
    document.querySelectorAll(FOCUS_TRAP_SELECTOR),
  ).filter(isVisible);
  return traps.length > 0 ? traps[traps.length - 1] : document;
}

function scoreCandidate(
  from: DOMRect,
  to: DOMRect,
  direction: Direction,
): number | null {
  const horizontal = direction === 'left' || direction === 'right';
  const fromCentre = horizontal
    ? from.left + from.width / 2
    : from.top + from.height / 2;
  const toCentre = horizontal ? to.left + to.width / 2 : to.top + to.height / 2;
  const forward = direction === 'right' || direction === 'down';

  // Must be further along than the current element's centre.
  if (forward ? toCentre <= fromCentre : toCentre >= fromCentre) {
    return null;
  }

  const gap = Math.max(
    0,
    horizontal
      ? forward
        ? to.left - from.right
        : from.left - to.right
      : forward
      ? to.top - from.bottom
      : from.top - to.bottom,
  );

  const [fromStart, fromEnd, toStart, toEnd] = horizontal
    ? [from.top, from.bottom, to.top, to.bottom]
    : [from.left, from.right, to.left, to.right];
  const overlaps = toStart < fromEnd && toEnd > fromStart;
  const sideways = overlaps
    ? 0
    : Math.abs((toStart + toEnd) / 2 - (fromStart + fromEnd) / 2);

  return gap + sideways * SIDEWAYS_WEIGHT;
}

/** The best element to move to from `from`, or null at the edge. */
export function findNextFocus(
  from: Element,
  direction: Direction,
  candidates: HTMLElement[],
): HTMLElement | null {
  const fromRect = from.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const candidate of candidates) {
    if (candidate === from || candidate.contains(from)) {
      continue;
    }
    const score = scoreCandidate(
      fromRect,
      candidate.getBoundingClientRect(),
      direction,
    );
    if (score !== null && score < bestScore) {
      best = candidate;
      bestScore = score;
    }
  }
  return best;
}

export function focusElement(element: HTMLElement): void {
  element.focus({ preventScroll: true });
  // Nearest keeps a shelf or grid from jumping about as focus moves through it.
  element.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}

/** Focus the first focusable thing, e.g. when nothing has focus yet. */
export function focusFirst(): boolean {
  const [first] = focusableElements(searchRoot());
  if (!first) {
    return false;
  }
  focusElement(first);
  return true;
}

/**
 * Move focus one step in `direction`. Returns false when there was nowhere
 * to go, so the caller can leave the key to the page (e.g. to scroll).
 */
export function moveFocus(direction: Direction): boolean {
  const root = searchRoot();
  const current = document.activeElement;
  const hasFocus =
    current instanceof HTMLElement &&
    current !== document.body &&
    (root === document || (root as Element).contains(current));
  if (!hasFocus) {
    return focusFirst();
  }
  const next = findNextFocus(current, direction, focusableElements(root));
  if (!next) {
    return false;
  }
  focusElement(next);
  return true;
}

/**
 * Whether an arrow key pressed in a text field should move focus rather than
 * the caret: always for up/down, and for left/right once the caret is at
 * that end of the text.
 */
export function shouldLeaveTextField(
  field: HTMLInputElement | HTMLTextAreaElement,
  direction: Direction,
): boolean {
  if (direction === 'up' || direction === 'down') {
    return !(field instanceof HTMLTextAreaElement);
  }
  const { selectionStart, selectionEnd, value } = field;
  if (selectionStart === null || selectionEnd === null) {
    return true;
  }
  if (selectionStart !== selectionEnd) {
    return false;
  }
  return direction === 'left'
    ? selectionStart === 0
    : selectionEnd === value.length;
}
