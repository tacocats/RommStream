// Bundles the Electron main process and preloads into dist/electron. Each
// entry is built on its own so none of them depends on a shared chunk: a
// sandboxed preload can't require() anything but `electron` itself.
//
// Also writes dist/package.json, which makes dist/ the Electron app
// directory (`electron dist`, and electron-builder's `directories.app`): the
// renderer is fully bundled by Vite, so the packaged app needs none of the
// React Native project's node_modules.
//
// Typechecking is separate (`npm run typecheck`); rolldown only strips types.
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from 'rolldown';

const entries = ['main', 'preload', 'guestPreload'];

for (const name of entries) {
  await build({
    input: `electron/${name}.ts`,
    platform: 'node',
    external: ['electron', /^node:/],
    logLevel: 'warn',
    output: {
      file: `dist/electron/${name}.js`,
      format: 'cjs',
      sourcemap: true,
    },
  });
}
const root = JSON.parse(readFileSync('package.json', 'utf8'));
writeFileSync(
  'dist/package.json',
  JSON.stringify(
    {
      name: 'rommstream',
      productName: 'RommStream',
      version: root.version,
      description: 'Couch-friendly client for a RomM game library',
      author: 'RommStream',
      license: root.license,
      main: 'electron/main.js',
      // Linux: ties the running window to the installed .desktop entry.
      desktopName: 'rommstream.desktop',
    },
    null,
    2,
  ) + '\n',
);

console.log(`built ${entries.map(name => `${name}.js`).join(', ')}`);
