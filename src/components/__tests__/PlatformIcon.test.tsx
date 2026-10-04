import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import React from 'react';
import { fetchCall, fetchMock, mockFetchOnce } from '../../testUtils/fetchMock';
import { PlatformIcon } from '../PlatformIcon';
import { iconCandidates, resetPlatformIconCache } from '../platformIconCache';

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><style>.cls-1{fill:#c1c1c1;}</style>' +
  '<path class="cls-1" d="M0 0"/></svg>';
// An .ico starts with a zero byte, never with markup.
const ICO = String.fromCharCode(0, 0, 1, 0) + 'binary';
const HTML = '<!doctype html><html><body>RomM</body></html>';

const BASE = 'https://romm.test/assets/platforms';
const KEY_PREFIX = 'rommstream.platformIcon.v1:https://romm.test|';

beforeEach(() => {
  resetPlatformIconCache();
});

describe('iconCandidates', () => {
  it('mirrors the web UI order: fs_slug before slug, vector before ico', () => {
    expect(
      iconCandidates('https://romm.test', ['SNES-roms', 'snes']).map(
        c => c.url,
      ),
    ).toEqual([
      `${BASE}/snes-roms.svg`,
      `${BASE}/systematic/snes-roms.svg`,
      `${BASE}/snes-roms.ico`,
      `${BASE}/snes.svg`,
      `${BASE}/systematic/snes.svg`,
      `${BASE}/snes.ico`,
    ]);
  });

  it('collapses duplicate, empty and differently-cased slugs', () => {
    expect(
      iconCandidates('https://romm.test', ['PSVita', undefined, '', 'psvita']),
    ).toHaveLength(3);
  });
});

describe('PlatformIcon', () => {
  it('loads the fs_slug icon first and hands SvgXml the inlined markup', async () => {
    mockFetchOnce({ text: SVG });

    await render(
      <PlatformIcon
        serverUrl="https://romm.test"
        name="Super Nintendo"
        fsSlug="SNES"
        slug="snes"
      />,
    );

    const icon = await screen.findByTestId('svg-xml');
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchCall()[0]).toBe(`${BASE}/snes.svg`);
    expect(icon.props.xml).toContain('style="fill:#c1c1c1;"');
    expect(icon.props.xml).not.toContain('<style');
    expect(icon.props.width).toBe(56);
    expect(icon.props.height).toBe(56);
  });

  it('falls back to the systematic vector set when the classic svg is missing', async () => {
    mockFetchOnce({ status: 404 });
    mockFetchOnce({ text: SVG });

    await render(
      <PlatformIcon
        serverUrl="https://romm.test"
        name="PlayStation Vita"
        fsSlug="psvita"
        slug="psvita"
      />,
    );

    await screen.findByTestId('svg-xml');
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(fetchCall(0)[0]).toBe(`${BASE}/psvita.svg`);
    expect(fetchCall(1)[0]).toBe(`${BASE}/systematic/psvita.svg`);
  });

  it('renders the .ico as an image when no svg exists', async () => {
    mockFetchOnce({ status: 404 });
    mockFetchOnce({ status: 404 });
    mockFetchOnce({ text: ICO });

    await render(
      <PlatformIcon
        serverUrl="https://romm.test"
        name="Browser"
        slug="browser"
      />,
    );

    const image = await screen.findByTestId('platform-icon-image');
    expect(image.props.source).toEqual({ uri: `${BASE}/browser.ico` });
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });

  it('skips an .ico answered by the SPA page and moves on to the slug', async () => {
    mockFetchOnce({ status: 404 });
    mockFetchOnce({ status: 404 });
    mockFetchOnce({ text: HTML });
    mockFetchOnce({ text: SVG });

    await render(
      <PlatformIcon
        serverUrl="https://romm.test"
        name="Nintendo 64"
        fsSlug="N64-roms"
        slug="n64"
      />,
    );

    await screen.findByTestId('svg-xml');
    expect(fetchCall(2)[0]).toBe(`${BASE}/n64-roms.ico`);
    expect(fetchCall(3)[0]).toBe(`${BASE}/n64.svg`);
  });

  it('treats a 200 that is not svg markup (the SPA fallback page) as missing', async () => {
    mockFetchOnce({ text: HTML });
    mockFetchOnce({ text: SVG });

    await render(
      <PlatformIcon
        serverUrl="https://romm.test"
        name="Saturn"
        slug="saturn"
      />,
    );

    const icon = await screen.findByTestId('svg-xml');
    expect(icon.props.xml).toContain('<path');
    expect(fetchCall(1)[0]).toBe(`${BASE}/systematic/saturn.svg`);
  });

  it('shows a letter badge when no icon can be loaded', async () => {
    for (let i = 0; i < 6; i += 1) {
      mockFetchOnce({ status: i === 5 ? 500 : 404 });
    }

    await render(
      <PlatformIcon
        serverUrl="https://romm.test"
        name="arcade"
        fsSlug="arcade"
        slug="mame"
        size={40}
      />,
    );

    await screen.findByText('A');
    expect(fetchMock()).toHaveBeenCalledTimes(6);
    expect(screen.queryByTestId('svg-xml')).toBeNull();
    expect(screen.queryByTestId('platform-icon-image')).toBeNull();
  });

  it('shows a letter badge straight away when the platform has no slugs', async () => {
    await render(
      <PlatformIcon serverUrl="https://romm.test" name="homebrew" />,
    );

    await screen.findByText('H');
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('resolves each platform once per session and persists the result', async () => {
    mockFetchOnce({ text: SVG });

    await render(
      <>
        <PlatformIcon serverUrl="https://romm.test" name="Game Boy" slug="gb" />
        <PlatformIcon serverUrl="https://romm.test" name="Game Boy" slug="gb" />
      </>,
    );

    // Both icons share one fetch but set their state separately, so they can
    // land in different commits: findAll would settle on the first alone.
    await waitFor(() =>
      expect(screen.getAllByTestId('svg-xml')).toHaveLength(2),
    );
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const stored = await AsyncStorage.getItem(`${KEY_PREFIX}gb`);
    expect(JSON.parse(String(stored))).toEqual({
      kind: 'svg',
      xml: expect.stringContaining('<path'),
    });
  });

  it('uses a persisted icon on a fresh session without touching the network', async () => {
    await AsyncStorage.setItem(
      `${KEY_PREFIX}gb`,
      JSON.stringify({ kind: 'svg', xml: '<svg><path d="M1 1"/></svg>' }),
    );

    await render(
      <PlatformIcon serverUrl="https://romm.test" name="Game Boy" slug="gb" />,
    );

    const icon = await screen.findByTestId('svg-xml');
    expect(icon.props.xml).toContain('M1 1');
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('does not persist a miss, so a later RomM release can fill it in', async () => {
    mockFetchOnce({ status: 404 });
    mockFetchOnce({ status: 404 });
    mockFetchOnce({ status: 404 });

    await render(
      <PlatformIcon serverUrl="https://romm.test" name="Homebrew" slug="hb" />,
    );

    await screen.findByText('H');
    expect(await AsyncStorage.getItem(`${KEY_PREFIX}hb`)).toBeNull();
  });

  it('forgets a cached .ico that fails to render and shows the badge', async () => {
    await AsyncStorage.setItem(
      `${KEY_PREFIX}browser`,
      JSON.stringify({ kind: 'ico', url: `${BASE}/browser.ico` }),
    );

    await render(
      <PlatformIcon
        serverUrl="https://romm.test"
        name="Browser"
        slug="browser"
      />,
    );

    const image = await screen.findByTestId('platform-icon-image');
    await act(async () => {
      fireEvent(image, 'error');
    });

    await screen.findByText('B');
    expect(await AsyncStorage.getItem(`${KEY_PREFIX}browser`)).toBeNull();
  });

  it('ignores a response that arrives after unmounting', async () => {
    let resolveFetch: (value: unknown) => void = () => {};
    fetchMock().mockReturnValueOnce(
      new Promise(resolve => {
        resolveFetch = resolve;
      }),
    );
    const { unmount } = await render(
      <PlatformIcon serverUrl="https://romm.test" name="Game Boy" slug="gb" />,
    );

    unmount();
    resolveFetch({ ok: true, text: async () => SVG });

    await waitFor(() => expect(screen.queryByTestId('svg-xml')).toBeNull());
  });
});
