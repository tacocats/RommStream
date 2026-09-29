import { useEffect, useState } from 'react';

// Mounting a react-native-svg icon is expensive (the SVG is parsed, then
// every shape becomes a native view), and a grid of them mounted in one
// render blocks the JS thread for seconds. Callers wait here for a turn and
// get one per tick, so input and painting can run in between.
const waiting: Array<() => void> = [];
let scheduled = false;

function pump() {
  if (scheduled || waiting.length === 0) {
    return;
  }
  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    waiting.shift()?.();
    pump();
  }, 0);
}

/** True once it is this component's turn to mount something heavy. */
export function useMountTurn(enabled: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const turn = () => setReady(true);
    waiting.push(turn);
    pump();
    return () => {
      const i = waiting.indexOf(turn);
      if (i >= 0) {
        waiting.splice(i, 1);
      }
    };
  }, [enabled]);

  return enabled && ready;
}
