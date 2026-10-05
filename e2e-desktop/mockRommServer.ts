import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Just enough of a RomM server for the desktop smoke test: device pairing,
 * one platform with one game, and a streaming container for it whose room
 * page wraps a stand-in for selkies-core. It deliberately sends no CORS
 * headers, as a real RomM doesn't for other origins, so the test proves the
 * app's API calls go through the main process.
 */

export const ROM = {
  id: 10,
  name: 'Tetris',
  platform_id: 1,
  platform_slug: 'gb',
  platform_name: 'Game Boy',
  fs_name: 'Tetris.gb',
  fs_extension: 'gb',
  has_file_on_disk: true,
};

const PLATFORM = {
  id: 1,
  name: 'Game Boy',
  slug: 'gb',
  fs_slug: 'gb',
  rom_count: 1,
};

/** Device pairing: the code to approve, and the token approval issues. */
export const USER_CODE = 'ABCD2345';
export const CLIENT_TOKEN = `rmm_${'0'.repeat(64)}`;
const DEVICE_CODE = 'device-secret';

const CONTAINER = 'romm-gb';
const ROOM_PATH = `/stream/${CONTAINER}/`;

// The streaming room: RomM's player page wrapping selkies-core in
// #session-frame, where the app puts key focus. Keys the game sees are
// recorded on the room's window.
const ROOM_PAGE = `<!doctype html>
<html><body style="margin:0;background:#000">
<iframe id="session-frame" style="border:0;width:100%;height:100vh" srcdoc="
  <canvas width=320 height=240></canvas>
  <script>
    window.addEventListener('keydown', function (e) { parent.keysSeen.push(e.key); });
  </script>
"></iframe>
<script>window.keysSeen = [];</script>
</body></html>`;

export interface MockRomm {
  url: string;
  /** "METHOD /path" of every request, in order. */
  requests: string[];
  /** The room URL a stream launch hands the app. */
  roomUrl: string;
  /** The init body of the latest device pairing. */
  pairingRequest: Record<string, unknown> | null;
  /** Approve the pending device pairing, as its owner would in RomM. */
  approveDevice(): void;
  close(): Promise<void>;
}

export async function startMockRomm(): Promise<MockRomm> {
  const requests: string[] = [];
  // The launch is up from the second status poll on.
  let statusPolls = 0;
  let pairingRequest: Record<string, unknown> | null = null;
  let deviceApproved = false;

  const readJson = (req: http.IncomingMessage) =>
    new Promise<Record<string, unknown>>(resolve => {
      let body = '';
      req.on('data', chunk => (body += chunk));
      req.on('end', () => resolve(JSON.parse(body)));
    });

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    requests.push(`${req.method} ${url.pathname}`);

    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'GET /api/platforms':
        return json([PLATFORM]);
      case 'GET /api/roms':
        return json({ items: [ROM], total: 1, limit: 500, offset: 0 });
      case `GET /api/roms/${ROM.id}`:
        return json({ ...ROM, summary: 'Falling blocks.' });
      case 'GET /api/stats':
        return json({
          PLATFORMS: 1,
          ROMS: 1,
          SAVES: 0,
          STATES: 0,
          SCREENSHOTS: 0,
          TOTAL_FILESIZE_BYTES: 32768,
        });
      case 'GET /api/recommendations':
      case 'GET /api/collections':
      case 'GET /api/collections/virtual':
        return json([]);
      case 'GET /api/heartbeat':
        return json({ EMULATION: {} });
      case 'GET /api/config':
        return json({});
      case 'GET /api/streaming/config':
        return json({
          enabled: true,
          containers: [{ platform: 'gb', container: CONTAINER }],
        });
      case 'GET /api/users/me':
        return req.headers.authorization === `Bearer ${CLIENT_TOKEN}`
          ? json({ id: 1, username: 'player' })
          : json({ detail: 'Not authenticated' }, 401);
      case 'POST /api/auth/device/init':
        readJson(req).then(body => {
          pairingRequest = body;
          json(
            {
              device_code: DEVICE_CODE,
              user_code: USER_CODE,
              verification_path: '/pair/device',
              verification_path_complete: `/pair/device?user_code=${USER_CODE}`,
              expires_in: 600,
              interval: 0,
            },
            201,
          );
        });
        return;
      case 'POST /api/auth/device/token':
        readJson(req).then(({ device_code }) => {
          if (device_code !== DEVICE_CODE) {
            return json({ detail: 'expired_token' }, 400);
          }
          if (!deviceApproved) {
            return json({ detail: 'authorization_pending' }, 400);
          }
          return json({
            access_token: CLIENT_TOKEN,
            device_id: 'device-1',
            scopes: ['me.read', 'roms.read'],
            expires_at: null,
          });
        });
        return;
      case 'GET /api/streaming/sessions/gb/status':
        // The room once the launch is up, as RomM stamps it on the session.
        return ++statusPolls > 1
          ? json({ status: 'active', platform: 'gb', host: ROOM_PATH })
          : json({ status: 'active', platform: 'gb' });
      case 'POST /api/streaming/sessions':
        statusPolls = 0;
        return json(
          {
            platform: 'gb',
            container: CONTAINER,
            label: 'Game Boy',
            rom_name: ROM.name,
            claimed_at: new Date().toISOString(),
          },
          202,
        );
      case 'POST /api/streaming/sessions/gb/heartbeat':
        return json({ status: 'active', platform: 'gb' });
      case 'DELETE /api/streaming/sessions/gb':
        return json({});
      case `GET ${ROOM_PATH}`:
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(ROOM_PAGE);
      default:
        res.writeHead(404);
        return res.end();
    }
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    requests,
    roomUrl: `${url}${ROOM_PATH}`,
    get pairingRequest() {
      return pairingRequest;
    },
    approveDevice: () => {
      deviceApproved = true;
    },
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}
