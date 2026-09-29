import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { PlayerMenu } from '../PlayerMenu';

jest.mock('../../../input/tvFocus');

describe('PlayerMenu', () => {
  it('shows the rom name and the Resume/Exit actions', async () => {
    await render(
      <PlayerMenu romName="Zelda" onResume={jest.fn()} onExit={jest.fn()} />,
    );

    expect(screen.getByText('Zelda')).toBeOnTheScreen();
    expect(screen.getByTestId('player-menu-resume')).toBeOnTheScreen();
    expect(screen.getByTestId('player-menu-exit')).toBeOnTheScreen();
    expect(screen.queryByTestId(/player-menu-action-/)).toBeNull();
  });

  it('calls onResume and onExit when pressed', async () => {
    const onResume = jest.fn();
    const onExit = jest.fn();
    await render(
      <PlayerMenu romName="Zelda" onResume={onResume} onExit={onExit} />,
    );

    await fireEvent.press(screen.getByTestId('player-menu-resume'));
    await fireEvent.press(screen.getByTestId('player-menu-exit'));

    expect(onResume).toHaveBeenCalled();
    expect(onExit).toHaveBeenCalled();
  });

  it('renders extra actions between Resume and Exit and runs them on press', async () => {
    const onSelect = jest.fn();
    await render(
      <PlayerMenu
        romName="Zelda"
        onResume={jest.fn()}
        onExit={jest.fn()}
        extraActions={[{ id: 'extra', label: 'Extra Action', onSelect }]}
      />,
    );

    const menu = screen.getByTestId('player-menu-items');
    const testIds = menu.children.map(child =>
      typeof child === 'string' ? child : child.props.testID,
    );
    expect(testIds).toEqual([
      'player-menu-resume',
      'player-menu-action-extra',
      'player-menu-exit',
    ]);
    expect(screen.getByText('Extra Action')).toBeOnTheScreen();

    await fireEvent.press(screen.getByTestId('player-menu-action-extra'));
    expect(onSelect).toHaveBeenCalled();
  });
});
