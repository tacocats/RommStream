import {
  getConfig,
  getHeartbeat,
  getStreamingConfig,
} from '../../api/rommClient';
import { RommRomDetail } from '../../api/types';
import { resolvePlayPath } from '../resolvePlayPath';

jest.mock('../../api/rommClient');

const mockedGetHeartbeat = jest.mocked(getHeartbeat);
const mockedGetConfig = jest.mocked(getConfig);
const mockedGetStreamingConfig = jest.mocked(getStreamingConfig);

const SERVER = 'https://romm.test';

/** Mirrors AuthContext's `withAuth`, calling straight through. */
const withAuth = jest.fn(
  (fn: (url: string, token: string) => Promise<unknown>) =>
    fn(SERVER, 'access-token'),
) as unknown as Parameters<typeof resolvePlayPath>[0];

const ROM: RommRomDetail = {
  id: 5,
  name: 'Zelda',
  platform_id: 1,
  platform_slug: 'snes',
  has_file_on_disk: true,
};

beforeEach(() => {
  mockedGetHeartbeat.mockResolvedValue({ EMULATION: {} });
  mockedGetConfig.mockResolvedValue({});
  mockedGetStreamingConfig.mockResolvedValue({
    enabled: false,
    containers: [],
  });
});

describe('resolvePlayPath', () => {
  it('returns null when there is no rom', async () => {
    expect(await resolvePlayPath(withAuth, null, 'snes', true)).toBeNull();
  });

  it('resolves the in-browser EmulatorJS path by default', async () => {
    expect(await resolvePlayPath(withAuth, ROM, 'snes', true)).toBe(
      '/rom/5/ejs',
    );
  });

  it('prefers the stream when the platform has a streaming container', async () => {
    mockedGetStreamingConfig.mockResolvedValue({
      enabled: true,
      containers: [{ platform: 'snes', container: 'romm-snes' }],
    });

    expect(await resolvePlayPath(withAuth, ROM, 'snes', true)).toBe(
      '/rom/5/stream',
    );
  });

  it('honours an emulator the server has switched off', async () => {
    mockedGetHeartbeat.mockResolvedValue({
      EMULATION: { DISABLE_EMULATOR_JS: true },
    });

    expect(await resolvePlayPath(withAuth, ROM, 'snes', true)).toBeNull();
  });

  it('still resolves when the server lookups fail', async () => {
    // An older RomM has no /api/streaming/config; that must not stop the
    // launch, it just leaves streaming off.
    mockedGetStreamingConfig.mockRejectedValue(new Error('404'));
    mockedGetHeartbeat.mockRejectedValue(new Error('404'));
    mockedGetConfig.mockRejectedValue(new Error('404'));

    expect(await resolvePlayPath(withAuth, ROM, 'snes', true)).toBe(
      '/rom/5/ejs',
    );
  });

  it('keeps streaming on offer when in-browser play is disabled', async () => {
    mockedGetStreamingConfig.mockResolvedValue({
      enabled: true,
      containers: [{ platform: 'snes', container: 'romm-snes' }],
    });

    expect(await resolvePlayPath(withAuth, ROM, 'snes', false)).toBe(
      '/rom/5/stream',
    );
  });

  it('returns null when in-browser play is disabled and there is no streaming', async () => {
    expect(await resolvePlayPath(withAuth, ROM, 'snes', false)).toBeNull();
  });
});
