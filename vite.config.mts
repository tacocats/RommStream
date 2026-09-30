import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, Plugin } from 'vite';

/**
 * Web build of the React Native app, for the Electron desktop shell
 * (electron/). The native builds never see this file: Metro keeps bundling
 * react-native-tvos for Android TV / tvOS.
 *
 * `react-native` resolves to web/shims/react-native.tsx (react-native-web
 * plus the handful of react-native-tvos extras the app uses), and `.web.*`
 * files win over their plain siblings, the same way Metro picks
 * `.android.*` / `.ios.*`.
 */
const root = path.dirname(fileURLToPath(import.meta.url));

const extensions = [
  '.web.tsx',
  '.web.ts',
  '.web.mjs',
  '.web.js',
  '.tsx',
  '.ts',
  '.mjs',
  '.js',
  '.jsx',
  '.json',
];

// Production only: the dev server injects an inline React Refresh preamble
// that a strict script-src would block. Remote hosts are only ever reached
// through the main process (see electron/rommFetch.ts) or an image tag.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src * data: blob:',
  "connect-src 'self'",
  "font-src 'self' data:",
].join('; ');

const contentSecurityPolicy: Plugin = {
  name: 'rommstream-csp',
  apply: 'build',
  transformIndexHtml: () => [
    {
      tag: 'meta',
      attrs: {
        'http-equiv': 'Content-Security-Policy',
        content: CONTENT_SECURITY_POLICY,
      },
      injectTo: 'head-prepend',
    },
  ],
};

export default defineConfig(({ mode }) => ({
  root: path.join(root, 'web'),
  // Relative asset URLs, so the packaged app can load index.html off disk.
  base: './',
  publicDir: false,
  plugins: [react(), contentSecurityPolicy],
  define: {
    __DEV__: JSON.stringify(mode !== 'production'),
    'process.env.NODE_ENV': JSON.stringify(mode),
    global: 'globalThis',
  },
  resolve: {
    extensions,
    alias: [
      {
        find: /^react-native$/,
        replacement: path.join(root, 'web/shims/react-native.tsx'),
      },
    ],
  },
  optimizeDeps: {
    // Several RN libraries ship JSX in plain .js files.
    rolldownOptions: {
      resolve: { extensions },
      moduleTypes: { '.js': 'jsx' },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: path.join(root, 'dist/web'),
    emptyOutDir: true,
    target: 'chrome130',
    // Loaded off local disk by Electron, so one big chunk costs nothing.
    chunkSizeWarningLimit: 2000,
  },
}));
