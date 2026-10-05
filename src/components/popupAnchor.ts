import { Dimensions, View } from 'react-native';
import type { PopupMenuAnchor } from './PopupMenu';

/**
 * Where a PopupMenu should sit to open to the right of `view`, `gap` px away,
 * with their bottom edges aligned. Measured in window coordinates, which is
 * what the Modal the menu renders in uses. Resolves null if `view` isn't
 * mounted.
 */
export function anchorBeside(
  view: View | null,
  gap: number,
): Promise<PopupMenuAnchor | null> {
  return new Promise(resolve => {
    if (!view) {
      resolve(null);
      return;
    }
    view.measureInWindow((x, y, width, height) => {
      const windowHeight = Dimensions.get('window').height;
      resolve({
        left: x + width + gap,
        bottom: Math.max(windowHeight - (y + height), 0),
      });
    });
  });
}
