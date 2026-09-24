import { fireEvent, render, screen } from '@testing-library/react-native';
import React from 'react';
import { resolveCoverUrl, RomGrid } from '../RomGrid';

const ROMS = [
  {
    id: 1,
    name: 'Zelda',
    platform_id: 3,
    platform_slug: 'snes',
    url_cover: '/assets/romm/resources/1/cover.png',
  },
  {
    id: 2,
    name: 'Mario',
    platform_id: 3,
    platform_slug: 'snes',
    url_cover: 'https://cdn.example/m.png',
  },
  { id: 3, name: 'Metroid', platform_id: 3 },
];

describe('RomGrid', () => {
  it('renders a tile per rom in the given order', async () => {
    await render(
      <RomGrid
        roms={ROMS}
        serverUrl="https://romm.test"
        onSelect={jest.fn()}
      />,
    );

    const tiles = screen.getAllByTestId(/^rom-tile-/);
    expect(tiles.map(tile => tile.props.testID)).toEqual([
      'rom-tile-1',
      'rom-tile-2',
      'rom-tile-3',
    ]);
    expect(screen.getByText('Zelda')).toBeOnTheScreen();
  });

  it('resolves cover URLs against the server and falls back to a placeholder', async () => {
    await render(
      <RomGrid
        roms={ROMS}
        serverUrl="https://romm.test"
        onSelect={jest.fn()}
      />,
    );

    expect(screen.getByTestId('rom-cover-1').props.source).toEqual({
      uri: 'https://romm.test/assets/romm/resources/1/cover.png',
    });
    expect(screen.getByTestId('rom-cover-2').props.source).toEqual({
      uri: 'https://cdn.example/m.png',
    });
    expect(screen.queryByTestId('rom-cover-3')).toBeNull();
    expect(screen.getByTestId('rom-cover-placeholder-3')).toBeOnTheScreen();
    expect(screen.getByTestId('rom-tile-3')).toHaveTextContent('Metroid');
  });

  it('reports the rom whose tile was pressed', async () => {
    const onSelect = jest.fn();
    await render(
      <RomGrid roms={ROMS} serverUrl="https://romm.test" onSelect={onSelect} />,
    );

    await fireEvent.press(screen.getByTestId('rom-tile-2'));

    expect(onSelect).toHaveBeenCalledWith(ROMS[1]);
  });
});

describe('resolveCoverUrl', () => {
  it('prefixes relative paths with the server URL', () => {
    expect(resolveCoverUrl('https://romm.test', '/a/b.png')).toBe(
      'https://romm.test/a/b.png',
    );
    expect(resolveCoverUrl('https://romm.test', 'a/b.png')).toBe(
      'https://romm.test/a/b.png',
    );
  });

  it('leaves absolute URLs alone', () => {
    expect(resolveCoverUrl('https://romm.test', 'http://cdn/x.png')).toBe(
      'http://cdn/x.png',
    );
  });
});
