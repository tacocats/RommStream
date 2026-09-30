import {
  findNextFocus,
  focusableElements,
  moveFocus,
  shouldLeaveTextField,
} from '../spatialNavigation';

// jsdom has no layout, so every element gets its box from here.
function place(
  element: HTMLElement,
  left: number,
  top: number,
  width = 100,
  height = 100,
) {
  element.getBoundingClientRect = () =>
    ({
      left,
      top,
      width,
      height,
      right: left + width,
      bottom: top + height,
      x: left,
      y: top,
      toJSON: () => ({}),
    } as DOMRect);
  element.scrollIntoView = jest.fn();
}

function button(id: string, left: number, top: number, parent?: HTMLElement) {
  const element = document.createElement('div');
  element.tabIndex = 0;
  element.dataset.testid = id;
  place(element, left, top);
  (parent ?? document.body).appendChild(element);
  return element;
}

function focusedId() {
  return (document.activeElement as HTMLElement).dataset.testid;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('findNextFocus', () => {
  // A 3x2 grid of tiles, 120px apart.
  function grid() {
    const tiles: HTMLElement[][] = [];
    for (let row = 0; row < 2; row++) {
      tiles.push([]);
      for (let col = 0; col < 3; col++) {
        tiles[row].push(button(`${row}-${col}`, col * 120, row * 120));
      }
    }
    return tiles;
  }

  it('moves to the neighbour in each direction', () => {
    const tiles = grid();
    const all = tiles.flat();
    const from = tiles[0][1];

    expect(findNextFocus(from, 'right', all)).toBe(tiles[0][2]);
    expect(findNextFocus(from, 'left', all)).toBe(tiles[0][0]);
    expect(findNextFocus(from, 'down', all)).toBe(tiles[1][1]);
    expect(findNextFocus(tiles[1][1], 'up', all)).toBe(tiles[0][1]);
  });

  it('returns null at the edge', () => {
    const tiles = grid();
    expect(findNextFocus(tiles[0][0], 'up', tiles.flat())).toBeNull();
    expect(findNextFocus(tiles[0][2], 'right', tiles.flat())).toBeNull();
  });

  it('prefers a tile in line over a nearer diagonal one', () => {
    const from = button('from', 0, 0);
    const diagonal = button('diagonal', 110, 150);
    const inLine = button('in-line', 200, 0);

    expect(findNextFocus(from, 'right', [diagonal, inLine])).toBe(inLine);
  });
});

describe('moveFocus', () => {
  it('focuses the first element when nothing has focus', () => {
    button('first', 0, 0);
    button('second', 0, 120);

    expect(moveFocus('down')).toBe(true);
    expect(focusedId()).toBe('first');
  });

  it('moves focus and scrolls the new element into view', () => {
    const first = button('first', 0, 0);
    const second = button('second', 0, 120);
    first.focus();

    expect(moveFocus('down')).toBe(true);
    expect(focusedId()).toBe('second');
    expect(second.scrollIntoView).toHaveBeenCalled();
  });

  it('stays inside a focus trap', () => {
    const outside = button('outside', 0, 240);
    const trap = document.createElement('div');
    trap.dataset.focusTrap = 'true';
    place(trap, 0, 0, 300, 220);
    document.body.appendChild(trap);
    const top = button('top', 0, 0, trap);
    button('bottom', 0, 120, trap);
    top.focus();

    expect(moveFocus('down')).toBe(true);
    expect(focusedId()).toBe('bottom');
    expect(moveFocus('down')).toBe(false);
    expect(document.activeElement).not.toBe(outside);
  });

  it('skips disabled and hidden elements', () => {
    const from = button('from', 0, 0);
    button('disabled', 0, 120).setAttribute('aria-disabled', 'true');
    place(button('hidden', 0, 240), 0, 240, 0, 0);
    button('target', 0, 360);
    from.focus();

    moveFocus('down');
    expect(focusedId()).toBe('target');
  });
});

describe('focusableElements', () => {
  it('leaves out elements removed from the tab order', () => {
    button('in', 0, 0);
    button('out', 0, 120).tabIndex = -1;
    expect(focusableElements().map(e => e.dataset.testid)).toEqual(['in']);
  });
});

describe('shouldLeaveTextField', () => {
  function input(value: string, caret: number) {
    const element = document.createElement('input');
    element.value = value;
    document.body.appendChild(element);
    element.setSelectionRange(caret, caret);
    return element;
  }

  it('always leaves on up and down', () => {
    expect(shouldLeaveTextField(input('abc', 1), 'up')).toBe(true);
    expect(shouldLeaveTextField(input('abc', 1), 'down')).toBe(true);
  });

  it('leaves sideways only from that end of the text', () => {
    expect(shouldLeaveTextField(input('abc', 1), 'left')).toBe(false);
    expect(shouldLeaveTextField(input('abc', 0), 'left')).toBe(true);
    expect(shouldLeaveTextField(input('abc', 1), 'right')).toBe(false);
    expect(shouldLeaveTextField(input('abc', 3), 'right')).toBe(true);
  });

  it('keeps the key while text is selected', () => {
    const field = input('abc', 0);
    field.setSelectionRange(0, 3);
    expect(shouldLeaveTextField(field, 'right')).toBe(false);
  });
});
