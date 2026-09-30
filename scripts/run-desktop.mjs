// Runs the desktop (Electron) app from this checkout.
//
//   node scripts/run-desktop.mjs          `npm run dev:desktop`: Vite dev
//                                         server (hot reload for the React
//                                         app) with Electron pointed at it.
//   node scripts/run-desktop.mjs --built  `npm run start:desktop`: the
//                                         production build in dist/.
//
// Main-process changes need a restart either way.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const built = process.argv.includes('--built');

// VS Code's integrated terminal exports ELECTRON_RUN_AS_NODE=1, which would
// start Electron as plain Node.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

let server = null;
if (!built) {
  const { createServer } = await import('vite');
  server = await createServer({ configFile: 'vite.config.mts' });
  await server.listen();
  server.printUrls();
  env.ROMMSTREAM_DEV_SERVER_URL = server.resolvedUrls.local[0];
  await import('./build-electron.mjs');
}

const electron = spawn(require('electron'), ['dist'], {
  stdio: 'inherit',
  env,
});
electron.on('exit', code => {
  Promise.resolve(server?.close()).finally(() => process.exit(code ?? 0));
});
process.on('SIGINT', () => electron.kill('SIGINT'));
