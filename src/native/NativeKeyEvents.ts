import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

/**
 * Android-only module backing `src/input/hardwareKeys`. Declares which
 * hardware keys the activity should swallow before they reach any view; the
 * presses themselves come back over RCTDeviceEventEmitter, not through here.
 *
 * `get` (rather than `getEnforcing`) so this resolves to null on platforms
 * that don't ship the module, letting the JS utility degrade to a no-op.
 */
export interface Spec extends TurboModule {
  setInterceptedKeys(keys: Array<string>): void;
}

export default TurboModuleRegistry.get<Spec>('RommStreamKeyEvents');
