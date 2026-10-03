import { io, Socket, WebSocket } from 'socket.io-client';
import { createLogger } from '../utils/logger';
import {
  claimStreamingSession,
  ClaimStreamingSessionOptions,
  ensureRommSession,
  releaseStreamingSession,
  RommLoginCredentials,
} from './rommClient';
import { RommApiError } from './types';

const log = createLogger('streaming');

// A large disc image can take a while to unpack before the emulator is up.
const DEFAULT_LAUNCH_TIMEOUT_MS = 3 * 60 * 1000;

interface LaunchEvent {
  container: string;
  platform: string;
}

interface LaunchReadyEvent extends LaunchEvent {
  /** The room URL — what RomM's own player loads in its stream iframe. */
  host: string;
  /** false when a requested save state couldn't be restored. */
  resume?: boolean;
}

interface LaunchFailedEvent extends LaunchEvent {
  detail?: string;
}

interface LaunchPhaseEvent extends LaunchEvent {
  phase: string;
}

export interface StreamingSession {
  /** The room URL to load in a WebView. */
  url: string;
  platform: string;
  container: string;
  label: string;
  romName: string;
  /** false when a requested save state couldn't be restored. */
  resumed: boolean;
}

export interface StartStreamingSessionOptions
  extends ClaimStreamingSessionOptions {
  /** For the login session RomM's socket authenticates with. */
  login: RommLoginCredentials;
  timeoutMs?: number;
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

function connect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve());
    socket.once('connect_error', (e: Error) =>
      // socket.io's own messages ("xhr poll error") mean nothing to a player.
      reject(
        new RommApiError(
          `Could not connect to RomM's live updates (${e.message})`,
        ),
      ),
    );
    socket.connect();
  });
}

/**
 * Claim a streaming container for a rom and resolve with its room URL once
 * the game is up.
 *
 * POST /api/streaming/sessions only reserves the container; the room URL
 * arrives over RomM's socket as `streaming:launch-ready` (or
 * `streaming:launch-failed`). Those are sent only to the claiming user's
 * sockets, and RomM knows a socket's user only from its login session
 * cookie, so that session is set up first (see ensureRommSession). The
 * events carry the container they're about, so the socket is connected
 * before claiming — a fast launch can't slip past — and anything for
 * another container is ignored.
 *
 * The socket is WebSocket-only, as RomM's own frontend connects. Long
 * polling spreads one socket over several HTTP requests, and a RomM running
 * several workers rejects any that land on a worker other than the one that
 * opened it ("Invalid session"). The WebSocket carries the session cookie
 * from the platform's store: React Native's native WebSocket reads the same
 * store as its fetch, and on desktop the main process adds it (see
 * electron/socketCookies.ts).
 *
 * If the launch fails, times out or is aborted after the claim, the
 * container is released again so it isn't left held.
 */
export async function startStreamingSession(
  serverUrl: string,
  accessToken: string,
  romId: number,
  options: StartStreamingSessionOptions,
): Promise<StreamingSession> {
  const {
    timeoutMs = DEFAULT_LAUNCH_TIMEOUT_MS,
    signal,
    onPhase,
    login,
    ...claimOptions
  } = options;

  if (signal?.aborted) {
    throw new RommApiError('Stream launch cancelled');
  }

  await ensureRommSession(serverUrl, login);

  // No bearer token here: the socket doesn't use one, and an expired one
  // fails the whole handshake with a 500.
  const socket = io(serverUrl, {
    path: '/ws/socket.io/',
    transports: [WebSocket],
    autoConnect: false,
    forceNew: true,
  });

  let claimed: { platform: string; container: string } | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let onAbort: (() => void) | undefined;

  try {
    // Events that land before the claim answers can't be matched to a
    // container yet; hold them until it does.
    const pending: Array<() => void> = [];
    let container: string | null = null;
    const forContainer =
      <T extends LaunchEvent>(handle: (event: T) => void) =>
      (event: T) => {
        if (container === null) {
          pending.push(() => event.container === container && handle(event));
        } else if (event.container === container) {
          handle(event);
        }
      };

    const launched = new Promise<LaunchReadyEvent>((resolve, reject) => {
      socket.on(
        'streaming:launch-ready',
        forContainer<LaunchReadyEvent>(event => resolve(event)),
      );
      socket.on(
        'streaming:launch-failed',
        forContainer<LaunchFailedEvent>(event =>
          reject(
            new RommApiError(
              event.detail || 'The streaming container failed to start',
            ),
          ),
        ),
      );
      socket.on(
        'streaming:launch-phase',
        forContainer<LaunchPhaseEvent>(event => onPhase?.(event.phase)),
      );
      timer = setTimeout(
        () => reject(new RommApiError('Timed out waiting for the stream')),
        timeoutMs,
      );
      onAbort = () => reject(new RommApiError('Stream launch cancelled'));
      signal?.addEventListener('abort', onAbort);
    });
    // Rejections before it's awaited (e.g. the claim itself failing) are
    // handled by the outer catch, not reported as unhandled.
    launched.catch(() => {});

    await Promise.race([connect(socket), launched]);
    log.debug(`socket connected, claiming rom ${romId}`);

    const session = await claimStreamingSession(
      serverUrl,
      accessToken,
      romId,
      claimOptions,
    );
    claimed = { platform: session.platform, container: session.container };
    container = session.container;
    pending.splice(0).forEach(replay => replay());
    log.info(`claimed ${session.container} for ${session.rom_name}`);

    const ready = await launched;
    if (!ready.host) {
      throw new RommApiError('The stream started without a room URL');
    }
    claimed = null;
    return {
      url: absoluteUrl(serverUrl, ready.host),
      platform: session.platform,
      container: session.container,
      label: session.label,
      romName: session.rom_name,
      resumed: ready.resume !== false,
    };
  } catch (e) {
    if (claimed) {
      const { platform, container } = claimed;
      log.warn(`launch on ${container} failed, releasing it`, e);
      await releaseStreamingSession(serverUrl, accessToken, platform, {
        save: false,
        container,
      }).catch(releaseError =>
        log.warn(`could not release ${container}`, releaseError),
      );
    }
    throw e;
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
    if (onAbort) {
      signal?.removeEventListener('abort', onAbort);
    }
    socket.disconnect();
  }
}
