/* eslint-env jest */
// Native modules don't exist in the jest environment. Each mock below is
// small but stateful enough that the code using it can be exercised for
// real (e.g. the keychain remembers what was saved). State is reset before
// every test in jest.setupAfterEnv.js.

// WebView renders as a plain View that keeps its props, so tests can read
// `source` / `injectedJavaScript` and fire `message` / `error` events. The ref
// exposes the imperative methods the real component has (per instance, so a
// test can assert on e.g. requestFocus calls).
jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');
  const WebView = React.forwardRef((props, ref) => {
    const handle = React.useRef(null);
    if (!handle.current) {
      handle.current = {
        requestFocus: jest.fn(),
        injectJavaScript: jest.fn(),
        postMessage: jest.fn(),
        reload: jest.fn(),
        stopLoading: jest.fn(),
        goBack: jest.fn(),
        goForward: jest.fn(),
        clearCache: jest.fn(),
      };
    }
    React.useImperativeHandle(ref, () => handle.current, []);
    // Also hung off the rendered element so a test holding the WebView can
    // assert on imperative calls (e.g. requestFocus) without a ref of its own.
    return React.createElement(View, {
      testID: 'webview',
      ...props,
      imperativeHandle: handle.current,
    });
  });
  WebView.displayName = 'WebView';
  return { __esModule: true, WebView, default: WebView };
});

// In-memory keychain keyed by `service`, mirroring the subset of the
// react-native-keychain API the app uses.
jest.mock('react-native-keychain', () => {
  const store = new Map();
  const serviceOf = options => (options && options.service) || 'default';
  return {
    __reset: () => store.clear(),
    setGenericPassword: jest.fn(async (username, password, options) => {
      const service = serviceOf(options);
      store.set(service, { username, password, service, storage: 'mock' });
      return { service, storage: 'mock' };
    }),
    getGenericPassword: jest.fn(
      async options => store.get(serviceOf(options)) ?? false,
    ),
    resetGenericPassword: jest.fn(async options =>
      store.delete(serviceOf(options)),
    ),
  };
});

// In-memory AsyncStorage.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map();
  const mock = {
    getItem: jest.fn(async key => store.get(key) ?? null),
    setItem: jest.fn(async (key, value) => {
      store.set(key, String(value));
    }),
    removeItem: jest.fn(async key => {
      store.delete(key);
    }),
    clear: jest.fn(async () => store.clear()),
    getAllKeys: jest.fn(async () => Array.from(store.keys())),
  };
  return { __esModule: true, default: mock };
});

// The real SafeAreaProvider renders nothing until the native side reports
// insets; the library's jest mock provides fixed metrics instead.
jest.mock(
  'react-native-safe-area-context',
  () => require('react-native-safe-area-context/jest/mock').default,
);

// react-native-svg components become Views that keep their props (SvgXml
// keeps the xml it was given).
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const mockComponent = testID => props =>
    React.createElement(View, { testID, ...props });
  const Svg = mockComponent('svg');
  return {
    __esModule: true,
    default: Svg,
    Svg,
    Path: mockComponent('svg-path'),
    SvgXml: mockComponent('svg-xml'),
    Defs: mockComponent('svg-defs'),
    LinearGradient: mockComponent('svg-linear-gradient'),
    Stop: mockComponent('svg-stop'),
    Rect: mockComponent('svg-rect'),
  };
});
