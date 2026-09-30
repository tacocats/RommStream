import type { Session } from 'electron';
import { getPreferences } from './preferences';

/**
 * Self-signed RomM servers. A LAN RomM behind HTTPS often has a certificate
 * no OS trusts; the user can opt in per server (Settings → Desktop → Trust
 * this server's certificate), after which it is accepted in every session
 * the app uses — the API fetches and the game webview alike.
 *
 * Settings is only reachable once signed in, so for the first sign-in the
 * same list can be given as ROMMSTREAM_TRUSTED_HOSTS=host[:port],… instead.
 */

/** Chromium's "use your own verification result" answer. */
const USE_CHROMIUM_RESULT = -3;
const ACCEPT = 0;

function hostnameOf(host: string): string {
  try {
    return new URL(`https://${host}`).hostname;
  } catch {
    return host;
  }
}

function trustedHostnames(): Set<string> {
  const fromEnv = (process.env.ROMMSTREAM_TRUSTED_HOSTS ?? '')
    .split(',')
    .map(host => host.trim())
    .filter(Boolean);
  return new Set(
    [...getPreferences().trustedCertificateHosts, ...fromEnv].map(hostnameOf),
  );
}

export function trustConfiguredCertificates(session: Session): void {
  session.setCertificateVerifyProc((request, callback) => {
    callback(
      trustedHostnames().has(request.hostname) ? ACCEPT : USE_CHROMIUM_RESULT,
    );
  });
}
