import type { View } from 'react-native';
import { focusableElements, focusElement } from './web/spatialNavigation';

/**
 * Web counterpart of tvFocus.ts. react-native-web's host instances are DOM
 * elements, so "focus this view" means focusing it if it's focusable itself,
 * or else the first focusable thing inside it (a TVFocusGuideView wrapping a
 * menu, say) — which is what Android's focus search would land on.
 */
export function requestTVFocus(view: View | null | undefined): void {
  const element = view as unknown as HTMLElement | null | undefined;
  if (!(element instanceof HTMLElement)) {
    return;
  }
  if (element.contains(document.activeElement)) {
    return;
  }
  const target =
    element.tabIndex >= 0 ? element : focusableElements(element)[0];
  if (target) {
    focusElement(target);
  }
}
