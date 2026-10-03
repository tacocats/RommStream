import type { Session } from 'electron';

const SOCKET_PATH = '/ws/socket.io/';

/**
 * Send the session's cookies on the app's WebSocket to RomM's socket.
 *
 * RomM ties a socket to its user only through the `romm_session` login
 * cookie (src/api/streamingSession.ts relies on that for streaming launch
 * events). The login runs through the main process (rommFetch.ts), which
 * keeps the cookie in this session, but RomM sets it SameSite=Strict, and
 * the renderer's page isn't on RomM's site: Chromium leaves it off the
 * handshake. Add it back, for RomM socket handshakes only.
 */
export function attachCookiesToRommSockets(session: Session): void {
  session.webRequest.onBeforeSendHeaders(
    { urls: ['ws://*/*', 'wss://*/*'] },
    (details, callback) => {
      const url = new URL(details.url);
      if (!url.pathname.startsWith(SOCKET_PATH)) {
        callback({});
        return;
      }
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      session.cookies.get({ url: url.toString() }).then(
        cookies => {
          if (cookies.length === 0) {
            callback({});
            return;
          }
          callback({
            requestHeaders: {
              ...details.requestHeaders,
              Cookie: cookies.map(c => `${c.name}=${c.value}`).join('; '),
            },
          });
        },
        () => callback({}),
      );
    },
  );
}
