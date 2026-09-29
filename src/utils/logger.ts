import { consoleTransport, logger } from 'react-native-logs';

// Output goes through console, so it shows up in Metro and in
// `adb logcat -s ReactNativeJS`. Debug is dropped in release builds.
const root = logger.createLogger({
  severity: __DEV__ ? 'debug' : 'info',
  transport: consoleTransport,
  printDate: false,
});

/** Logger scoped to a feature, e.g. `const log = createLogger('login')`. */
export function createLogger(namespace: string) {
  return root.extend(namespace);
}
