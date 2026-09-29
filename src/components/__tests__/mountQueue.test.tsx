import { act, render, screen } from '@testing-library/react-native';
import React from 'react';
import { Text } from 'react-native';
import { useMountTurn } from '../mountQueue';

function Item({ id, enabled = true }: { id: string; enabled?: boolean }) {
  const turn = useMountTurn(enabled);
  return <Text testID={id}>{turn ? 'ready' : 'waiting'}</Text>;
}

describe('useMountTurn', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('grants turns one per tick, in mount order', async () => {
    await render(
      <>
        <Item id="a" />
        <Item id="b" />
        <Item id="c" />
      </>,
    );
    expect(screen.getByTestId('a')).toHaveTextContent('waiting');

    await act(async () => {
      jest.advanceTimersToNextTimer();
    });
    expect(screen.getByTestId('a')).toHaveTextContent('ready');
    expect(screen.getByTestId('b')).toHaveTextContent('waiting');

    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.getByTestId('b')).toHaveTextContent('ready');
    expect(screen.getByTestId('c')).toHaveTextContent('ready');
  });

  it('never grants a turn when disabled', async () => {
    await render(<Item id="a" enabled={false} />);
    await act(async () => {
      jest.runAllTimers();
    });
    expect(screen.getByTestId('a')).toHaveTextContent('waiting');
  });
});
