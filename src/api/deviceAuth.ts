import { createLogger } from '../utils/logger';
import { parseJsonOrThrow, REQUESTED_SCOPES } from './rommClient';
import {
  DeviceAuthInitResponse,
  DeviceAuthTokenResponse,
  RommApiError,
} from './types';

const log = createLogger('deviceAuth');

// RFC 8628's back-off when the server says `slow_down`.
const SLOW_DOWN_STEP_SECONDS = 5;

export interface DeviceInfo {
  /** Stable per install, so pairing again updates RomM's device record. */
  clientDeviceIdentifier: string;
  /** What RomM's approval page and device list call this device. */
  name: string;
  platform: string;
}

/** What the user needs to approve a pending pairing. */
export interface DevicePairingPrompt {
  userCode: string;
  /** RomM's approval page with the code filled in. */
  verificationUrl: string;
  expiresInSeconds: number;
}

/** The device pairing was turned down in RomM, or its code ran out. */
export class DevicePairingError extends RommApiError {
  constructor(message: string, readonly reason: 'denied' | 'expired') {
    super(message, 400);
    this.name = 'DevicePairingError';
  }
}

/**
 * Ask RomM to start a device authorization flow. Open endpoint: the device
 * has no credentials yet, which is the point.
 */
export async function startDeviceAuthorization(
  serverUrl: string,
  device: DeviceInfo,
): Promise<DeviceAuthInitResponse> {
  const response = await fetch(`${serverUrl}/api/auth/device/init`, {
    method: 'POST',
    credentials: 'omit',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_device_identifier: device.clientDeviceIdentifier,
      name: device.name,
      client: 'RommStream',
      platform: device.platform,
      requested_scopes: REQUESTED_SCOPES.split(' '),
    }),
  });
  return (await parseJsonOrThrow(response)) as DeviceAuthInitResponse;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const onAbort = () => {
      clearTimeout(timer);
      reject(new RommApiError('Pairing cancelled'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Poll RomM until the user approves (or denies) the pairing, resolving with
 * the client API token it issues.
 *
 * RomM answers with RFC 8628's error codes, as a 400's detail:
 * `authorization_pending` (keep polling), `slow_down` (poll less often),
 * `access_denied` and `expired_token`.
 */
export async function waitForDeviceApproval(
  serverUrl: string,
  flow: DeviceAuthInitResponse,
  signal?: AbortSignal,
): Promise<DeviceAuthTokenResponse> {
  let intervalSeconds = flow.interval;
  for (;;) {
    await sleep(intervalSeconds * 1000, signal);
    const response = await fetch(`${serverUrl}/api/auth/device/token`, {
      method: 'POST',
      credentials: 'omit',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: flow.device_code }),
    });
    // Every answer but the token is a 400 naming where the flow stands;
    // anything else is a real failure, reported as one.
    if (response.status !== 400) {
      return (await parseJsonOrThrow(response)) as DeviceAuthTokenResponse;
    }
    const detail = await response
      .json()
      .then((body: { detail?: unknown }) => body?.detail)
      .catch(() => undefined);
    switch (detail) {
      case 'authorization_pending':
        break;
      case 'slow_down':
        intervalSeconds += SLOW_DOWN_STEP_SECONDS;
        log.info(`asked to slow down, polling every ${intervalSeconds}s`);
        break;
      case 'access_denied':
        throw new DevicePairingError('Pairing was denied in RomM.', 'denied');
      case 'expired_token':
        throw new DevicePairingError(
          'The pairing code expired. Get a new one to try again.',
          'expired',
        );
      default:
        throw new RommApiError(
          typeof detail === 'string' ? detail : 'Pairing failed (HTTP 400)',
          400,
        );
    }
  }
}

/** The pending pairing as the user should see it. */
export function pairingPrompt(
  serverUrl: string,
  flow: DeviceAuthInitResponse,
): DevicePairingPrompt {
  return {
    userCode: flow.user_code,
    verificationUrl: `${serverUrl}${flow.verification_path_complete}`,
    expiresInSeconds: flow.expires_in,
  };
}
