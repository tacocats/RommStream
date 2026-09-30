import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * Just enough of a RomM server for the desktop smoke test: token sign-in,
 * one platform with one game, and a web player page with a Play button and
 * a canvas. It deliberately sends no CORS headers, as a real RomM doesn't
 * for other origins, so the test proves the app's API calls go through the
 * main process.
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

// The player page: RomM's lobby Play button, which reveals the game canvas.
const PLAYER_PAGE = `<!doctype html>
<html><body style="margin:0;background:#000">
<button class="play-button">Play</button>
<canvas class="ejs_canvas" width="320" height="240" style="display:none"></canvas>
<script>
  document.querySelector('.play-button').addEventListener('click', function () {
    this.style.display = 'none';
    document.querySelector('canvas').style.display = 'block';
  });
  window.keysSeen = [];
  window.addEventListener('keydown', function (e) { window.keysSeen.push(e.key); });
</script>
</body></html>`;

export interface MockRomm {
  url: string;
  /** "METHOD /path" of every request, in order. */
  requests: string[];
  close(): Promise<void>;
}

export async function startMockRomm(): Promise<MockRomm> {
  const requests: string[] = [];

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
        return json({ enabled: false, containers: [] });
      case 'POST /api/login':
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Set-Cookie': 'romm_session=session; Path=/; HttpOnly',
        });
        return res.end('{}');
      case `GET /rom/${ROM.id}/ejs`:
        res.writeHead(200, { 'Content-Type': 'text/html' });
        return res.end(PLAYER_PAGE);
      default:
        res.writeHead(404);
        return res.end();
    }
  });

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}
