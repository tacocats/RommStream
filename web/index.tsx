/**
 * Entry point of the web build (Vite), which the Electron shell loads. The
 * native builds start from ../index.js instead.
 */
import { AppRegistry } from 'react-native';
import App from '../App';
import { name as appName } from '../app.json';
import { getDesktopBridge } from '../src/desktop/bridge';
import { installFetchBridge } from '../src/desktop/fetchBridge';
import { installDesktopInput } from '../src/input/web/desktopInput';
import { goBackIfPossible } from '../src/navigation/navigationRef';

const bridge = getDesktopBridge();
if (bridge) {
  installFetchBridge(bridge);
}
installDesktopInput({ goBack: goBackIfPossible });

AppRegistry.registerComponent(appName, () => App);
AppRegistry.runApplication(appName, {
  rootTag: document.getElementById('root'),
});
