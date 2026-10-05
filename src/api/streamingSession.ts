import { createLogger } from '../utils/logger';
import {
  claimStreamingSession,
  ClaimStreamingSessionOptions,
  getStreamingSessionStatus,
  releaseStreamingSession,
} from './rommClient';
import { RommApiError } from './types';

const log = createLogger('streaming');

// A large disc image can take a while to unpack before the emulator is up.
const DEFAULT_LAUNCH_TIMEOUT_MS = 3 * 60 * 1000;

// How often the launch asks RomM whether the stream is up.
const DEFAULT_POLL_INTERVAL_MS = 1000;

export interface StreamingSession {
  /** The room URL to load in a WebView. */
  url: string;
  platform: string;
  container: string;
  label: string;
  romName: string;
}

export interface StartStreamingSessionOptions
  extends ClaimStreamingSessionOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  signal?: AbortSignal;
  /** Progress while a broker unpacks a large title, e.g. "extracting". */
  onPhase?: (phase: string) => void;
}

function absoluteUrl(serverUrl: string, url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `${serverUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RommApiError('Stream launch cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Claim a streaming container for a rom and resolve with its room URL once
 * the game is up.
 *
 * POST /api/streaming/sessions only reserves the container; the launch
 * carries on in the background. RomM announces the room over its socket,
 * but that only reaches clients signed in with a login session cookie,
 * which a paired device's token can't get. The session's status route takes
 * the token and carries the same news: the room once the launch stamps it,
 * the extraction phase meanwhile, and "ended" when the launch failed and
 * gave the claim up. So the launch is followed by polling that.
 *
 * If the launch fails, times out or is aborted after the claim, the
 * container is released again so it isn't left held.
 */
export async function startStreamingSession(
  serverUrl: string,
  accessToken: string,
  romId: number,
  options: StartStreamingSessionOptions = {},
): Promise<StreamingSession> {
  const {
    timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    signal,
    onPhase,
    ...claimOptions
  } = options;

  if (signal?.aborted) {
    throw new RommApiError('Stream launch cancelled');
  }

  const session = await claimStreamingSession(
    serverUrl,
    accessToken,
    romId,
    claimOptions,
  );
  log.info(`claimed ${session.container} for ${session.rom_name}`);

  const deadline = Date.now() + timeoutMs;
  let lastPhase: string | null = null;
  try {
    for (;;) {
      if (signal?.aborted) {
        throw new RommApiError('Stream launch cancelled');
      }
      const status = await getStreamingSessionStatus(
        serverUrl,
        accessToken,
        session.platform,
      );
      if (status.status === 'ended') {
        throw new RommApiError(
          status.termination?.reason ||
            'The streaming container failed to start',
        );
      }
      if (status.host) {
        return {
          url: absoluteUrl(serverUrl, status.host),
          platform: session.platform,
          container: session.container,
          label: session.label,
          romName: session.rom_name,
        };
      }
      if (status.extraction_phase && status.extraction_phase !== lastPhase) {
        lastPhase = status.extraction_phase;
        onPhase?.(lastPhase);
      }
      if (Date.now() >= deadline) {
        throw new RommApiError('Timed out waiting for the stream');
      }
      await sleep(pollIntervalMs, signal);
    }
  } catch (e) {
    log.warn(`launch on ${session.container} failed, releasing it`, e);
    await releaseStreamingSession(serverUrl, accessToken, session.platform, {
      save: false,
      container: session.container,
    }).catch(releaseError =>
      log.warn(`could not release ${session.container}`, releaseError),
    );
    throw e;
  }
}
