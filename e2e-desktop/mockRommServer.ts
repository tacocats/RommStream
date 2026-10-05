import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Server as SocketServer } from 'socket.io';

/**
 * Just enough of a RomM server for the desktop smoke test: token sign-in,
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
  /** Cookie headers of socket handshakes, in order. */
  socketCookies: Array<string | undefined>;
  close(): Promise<void>;
}

export async function startMockRomm(): Promise<MockRomm> {
  const requests: string[] = [];
  const socketCookies: Array<string | undefined> = [];

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    requests.push(`${req.method} ${url.pathname}`);

    const json = (body: unknown, status = 200) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };

    const route = `${req.method} ${url.pathname}`;
    switch (route) {
      case 'POST /api/token':
        return json({
          access_token: 'access',
          refresh_token: 'refresh',
          token_type: 'bearer',
          expires: 3600,
          refresh_expires: 86400,
        });
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
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'romm_csrftoken=csrf; Path=/',
        });
        return res.end(JSON.stringify({ EMULATION: {} }));
      case 'GET /api/config':
        return json({});
      case 'GET /api/streaming/config':
        return json({
          enabled: true,
          containers: [{ platform: 'gb', container: CONTAINER }],
        });
      case 'GET /api/users/me':
        return json({ detail: 'Not authenticated' }, 401);
      case 'POST /api/streaming/sessions':
        // The room URL follows over the socket, as RomM's broker sends it
        // once the emulator is up.
        setTimeout(() =>
          io.emit('streaming:launch-ready', {
            platform: 'gb',
            container: CONTAINER,
            host: ROOM_PATH,
          }),
        );
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
      case 'POST /api/login':
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'romm_session=session; Path=/; HttpOnly',
        });
        return res.end('{}');
      case `GET ${ROOM_PATH}`:
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(ROOM_PAGE);
      default:
        res.writeHead(404);
        return res.end();
    }
  });

  // RomM's socket, which carries streaming launch events. Like RomM, it
  // knows the user only from the login session cookie on the handshake.
  const io = new SocketServer(server, { path: '/ws/socket.io/' });
  io.on('connection', socket => {
    socketCookies.push(socket.handshake.headers.cookie);
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const url = `http://127.0.0.1:${port}`;
  return {
    url,
    requests,
    roomUrl: `${url}${ROOM_PATH}`,
    socketCookies,
    close: () => new Promise(resolve => io.close(() => resolve())),
  };
}
