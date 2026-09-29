import { getConfig, getHeartbeat, getStreamingConfig } from '../api/rommClient';
import { RommRomDetail } from '../api/types';
import { Heartbeat, playPath, Rom, StreamingConfig } from './playPath';
import { createLogger } from './logger';

const log = createLogger('playPath');

/** The shape of AuthContext's `withAuth`, structurally. */
type WithAuth = <T>(
  fn: (serverUrl: string, accessToken: string) => Promise<T>,
) => Promise<T>;

const NOTHING_DISABLED: Heartbeat = { EMULATION: {} };
const NO_STREAMING: StreamingConfig = { enabled: false, containers: [] };

function toPlayPathRom(rom: RommRomDetail, platformSlug: string): Rom {
  return {
    id: rom.id,
    platform_slug: rom.platform_slug ?? platformSlug,
    // Releases before this field existed still have the file; refusing to
    // launch would be worse than trying and landing on the rom page.
    has_file_on_disk: rom.has_file_on_disk ?? true,
    fs_extension: rom.fs_extension,
    fs_name: rom.fs_name,
  };
}

/**
 * Work out which route can launch a rom, or null when nothing can.
 *
 * Which route a rom can take is the server's answer, not something the app
 * can work out from the platform slug alone: the install decides which web
 * players are switched off (heartbeat), how platform slugs are remapped
 * (config), and which platforms have a streaming container. Each lookup can
 * be missing — /api/streaming/config only exists on RomM releases with the
 * streaming feature — so a failure degrades to "nothing disabled, no
 * streaming" instead of blocking the launch.
 */
export async function resolvePlayPath(
  withAuth: WithAuth,
  rom: RommRomDetail | null,
  platformSlug: string,
  inBrowserPlayEnabled: boolean,
): Promise<string | null> {
  if (!rom) {
    return null;
  }

  const [heartbeat, config, streaming] = await Promise.all([
    withAuth((url, token) => getHeartbeat(url, token)).catch(e => {
      log.warn('heartbeat failed, assuming nothing disabled', e);
      return NOTHING_DISABLED;
    }),
    withAuth((url, token) => getConfig(url, token)).catch(e => {
      log.warn('config fetch failed', e);
      return undefined;
    }),
    withAuth((url, token) => getStreamingConfig(url, token)).catch(e => {
      log.warn('streaming config fetch failed, assuming none', e);
      return NO_STREAMING;
    }),
  ]);

  return playPath(toPlayPathRom(rom, platformSlug), {
    heartbeat,
    config,
    streaming,
    inBrowserPlayEnabled,
  });
}
