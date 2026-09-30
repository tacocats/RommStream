// Two projects: the app as the TV builds run it (React Native preset, the
// bulk of the suite), and the web-only modules of the desktop build
// (`*.web.*` files and src/**/web/), under jsdom with `.web` resolution.
const WEB_TESTS = ['/src/.*/web/__tests__/', '\\.web\\.test\\.[jt]sx?$'];

const native = {
  displayName: 'native',
  preset: 'react-native',
  setupFiles: ['./jest.setup.js'],
  setupFilesAfterEnv: ['./jest.setupAfterEnv.js'],
  // react-native-tvos nests its own @react-native-tvos/* packages (e.g.
  // virtualized-lists behind FlatList) under node_modules/react-native, so
  // they need transforming too.
  transformIgnorePatterns: [
    'node_modules/(?!(?:.pnpm/)?(@react-native(?:-community|-tvos)?|@react-native-async-storage|react-native|@react-navigation|react-native-.*)/)',
  ],
  // Detox e2e specs live in ./e2e and the desktop Playwright specs in
  // ./e2e-desktop; each runs under its own runner.
  testPathIgnorePatterns: [
    '/node_modules/',
    '/e2e/',
    '/e2e-desktop/',
    ...WEB_TESTS,
  ],
  clearMocks: true,
};

const web = {
  displayName: 'web',
  testEnvironment: 'jsdom',
  testMatch: [
    '**/src/**/web/__tests__/**/*.test.[jt]s?(x)',
    '**/*.web.test.[jt]s?(x)',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  haste: { defaultPlatform: 'web', platforms: ['web'] },
  moduleFileExtensions: ['web.ts', 'web.tsx', 'ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: { '^react-native$': 'react-native-web' },
  transformIgnorePatterns: [
    'node_modules/(?!react-native-web|react-native-logs)',
  ],
  setupFiles: ['./jest.setup.web.js'],
  clearMocks: true,
};

module.exports = {
  projects: [native, web],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/testUtils/**',
    '!src/**/types.ts',
  ],
};
