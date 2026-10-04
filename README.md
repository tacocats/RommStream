<div align="center">

<img src="docs/logo.svg" alt="RommStream" width="480" />

### Stream your games like you would Movies!

---

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Romm](https://img.shields.io/badge/RomM-5.3.0%2B-blueviolet)](https://github.com/rommapp/romm)
[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=tacocats_RommStream&metric=alert_status)](https://sonarcloud.io/project/overview?id=tacocats_RommStream)
[![Coverage](https://sonarcloud.io/api/project_badges/measure?project=tacocats_RommStream&metric=coverage)](https://sonarcloud.io/project/overview?id=tacocats_RommStream)

[![Android TV Build](https://img.shields.io/github/actions/workflow/status/tacocats/RomMStream/android-build.yml?branch=master&label=Android%20TV&logo=android)](https://github.com/tacocats/RomMStream/actions/workflows/android-build.yml)
[![Apple TV Build](https://img.shields.io/badge/Apple%20TV-unavailable-lightgrey?logo=apple)](#)
[![Windows Build](https://img.shields.io/badge/Windows-unavailable-lightgrey?logo=windows)](#)
[![Linux Build](https://img.shields.io/github/actions/workflow/status/tacocats/RomMStream/desktop-build.yml?branch=master&label=Linux&logo=linux)](https://github.com/tacocats/RomMStream/actions/workflows/desktop-build.yml)
[![macOS Build](https://img.shields.io/badge/macOS-unavailable-lightgrey?logo=apple)](#)

---

</div>

RommStream is a React Native application that connects to a
[Romm](https://github.com/rommapp/romm) server, lets you browse your library
by platform, and launches games in a WebView running Romm's web player.

> [!NOTE]
> RommStream is not officially related to RomM in any way. It is a
> third-party app, and "RommStream" is a placeholder name that may change in
> the future out of respect for the RomM project.

## Table of Contents

- [Demo](#demo)
- [Screenshots](#screenshots)
- [Users guide](#users-guide)
  - [Server requirements](#server-requirements)
  - [Getting the app](#getting-the-app)
  - [Signing in](#signing-in)
- [Developers](#developers)
  - [Prerequisites](#prerequisites)
  - [Running it](#running-it)
  - [Desktop builds](#desktop-builds)
  - [Releasing](#releasing)
  - [Testing](#testing)
  - [Project layout](#project-layout)
  - [Notes on HTTP-only RomM servers](#notes-on-http-only-romm-servers)
- [License](#license)

## Demo

<!-- TODO: record a short clip (browsing → launching a game → in-stream) and drop it at docs/demo.gif -->
<div align="center">
  <img src="docs/demo.gif" alt="Demo: browsing the library and launching a game" width="600" />
</div>

## Screenshots

|                                                             Home                                                              |                                             Platforms                                              |
| :---------------------------------------------------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------------------: |
| ![Home screen: library stats across the top, with Recently added and Recommended for you shelves below](docs/screenshot1.png) |    ![Platforms grid, each tile showing a console icon and its game count](docs/screenshot4.png)    |
|                                                          **Search**                                                           |                                          **Game details**                                          |
|           ![Search screen with a query typed, platform filter chips, and matching cover art](docs/screenshot3.png)            | ![Game details for Apotris: cover art, Play button, summary, players, genres](docs/sceenshot2.png) |

## Users guide

### Server requirements

RommStream plays games through RomM's
[emulator streaming](https://docs.romm.app/5.3.0/using/emulator-streaming/):
the game runs in a real emulator on your server and is streamed to the app
over WebRTC. Your RomM server (5.3.0 or newer) therefore needs streaming
set up before RommStream can launch anything:

- **[RomM Broker](https://github.com/romm-streaming/romm-broker)**, which
  takes launch, save and state commands from RomM, running inside
- **[Webstation](https://github.com/linuxserver/docker-webstation)**, the
  container that runs the emulators and serves the stream.

Follow RomM's [setup guide](https://docs.romm.app/5.3.0/using/emulator-streaming/#setup).
In short:

1. Run the Webstation container with RomM Broker, with your ROM library
   mounted read-only. RomM ships a reference `docker-compose.streaming.yml`
   (amd64 only).
2. Add a `streaming` block to RomM's `config.yml` with `enabled: true` and
   one entry per container, mapping each platform to its emulator:

   ```yaml
   streaming:
     enabled: true
     containers:
       - protocol: webstation
         host: https://192.168.1.56:3010
         subfolder: /streaming
         label: Emulation station
         platforms:
           snes: retroarch
           ps2:
             emulator: pcsx2
             memory_card_sync: true
   ```

3. Give RomM and the broker the same secret: `STREAMING_BROKER_SECRET` on
   RomM, `BROKER_SECRET` on the container.

Things to know:

- The container's `host` must be **HTTPS** (the stream needs a secure
  context). Use a reverse proxy or a self-signed certificate.
- ROMs must be extracted; archives can't be streamed.
- One container runs one game session at a time.

### Getting the app

Download the Android TV APK or the Linux AppImage / `.deb` / `.rpm` from the
[Releases](https://github.com/tacocats/RomMStream/releases) page. Windows
and macOS builds are not published yet; see [Desktop builds](#desktop-builds)
to build them yourself.

### Signing in

Open the app and enter your RomM server's address and your RomM username and
password. Once signed in, browse by platform, search, or pick from the home
shelves, then press **Play** on a game to start a stream.

If your RomM server uses plain HTTP, see
[Notes on HTTP-only RomM servers](#notes-on-http-only-romm-servers). For a
self-signed HTTPS server on desktop, see the couch notes under
[Desktop builds](#desktop-builds).

## Developers

### Prerequisites

- Node.js and npm
- For Android TV: Android SDK + NDK (the Gradle build will auto-download the
  NDK/build-tools it needs the first time), and either a physical Android TV
  device or an Android TV emulator (`sdkmanager` → `system-images;android-XX;google_atv;x86_64`).
- For Apple TV: **macOS with Xcode** and CocoaPods. This repo was scaffolded
  on Linux, so the tvOS side has been configured but not pod-installed or
  build-verified — that must happen on a Mac.

#### Known environment gotchas already fixed in this repo

- **Gradle 9 / JDK toolchain crash**: the RN 0.83 gradle-plugin bundles
  `foojay-resolver-convention:0.5.0`, which references a Gradle enum member
  removed in Gradle 9.0, so any build fails with
  `JvmVendorSpec does not have member field ... IBM_SEMERU`. Fixed here by
  pinning the wrapper to Gradle 8.13 (`android/gradle/wrapper/gradle-wrapper.properties`).
- **react-native-screens codegen crash**: versions ≥4.26 use `React.ComponentRef`
  in their Fabric command specs, which this RN version's codegen parser
  rejects (`must be of type React.ElementRef<>`). Fixed here by pinning
  `react-native-screens` to `4.25.2` in `package.json`.
- **npm peer-dependency errors**: `react-native-tvos` publishes versions like
  `0.83.0-0`, which most RN ecosystem packages' `peerDependencies` ranges
  don't match under strict semver. `.npmrc` sets `legacy-peer-deps=true` so
  `npm install` doesn't fight you over this.
- Use JDK 17 to run Gradle: `JAVA_HOME=/path/to/java-17 ./gradlew ...` (this
  machine also has JDK 21 as the default `java`, which is incompatible).

### Running it

Start Metro:

```sh
npm start
```

#### Android TV

```sh
npm run android
# or, once you have an emulator/device: npx react-native run-android
```

#### Apple TV (macOS only)

```sh
bundle install
bundle exec pod install --project-directory=ios
npx react-native run-tvos --simulator "Apple TV"
```

### Desktop builds

The Windows / macOS / Linux app is the same React Native code, bundled for
the web with [react-native-web](https://necolas.github.io/react-native-web/)
and Vite (`vite.config.mts`, entry `web/index.tsx`) and hosted in an
Electron shell (`electron/`). Platform differences live in `.web.ts(x)`
siblings that Vite picks over the native file, so the TV builds don't see
them:

| Native (TV)                           | Desktop                                                                                                                                                |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| react-native-tvos focus engine        | `src/input/web/spatialNavigation.ts` (D-pad focus), with `hasTVPreferredFocus` / `TVFocusGuideView` given web meanings in `web/shims/react-native.tsx` |
| Remote keys via `RommStreamKeyEvents` | `src/input/web/desktopInput.ts`: keyboard, gamepad (Gamepad API) and keys the main process takes off the game webview                                  |
| Keychain (`react-native-keychain`)    | Electron `safeStorage` (`src/auth/secureStore.web.ts` → `electron/secureStore.ts`)                                                                     |
| `react-native-webview`                | Electron `<webview>` (`src/screens/player/PlayerWebView.web.tsx`), with `window.ReactNativeWebView` recreated by `electron/guestPreload.ts`            |
| `fetch` (no CORS)                     | Cross-origin `fetch` routed through the main process (`src/desktop/fetchBridge.ts` → `electron/rommFetch.ts`)                                          |

```sh
npm run dev:desktop     # Vite dev server (hot reload) + Electron
npm run start:desktop   # production build, run from dist/
npm run dist:desktop    # installers for the current OS, in release/
npm run dev:web         # the web build alone in a browser (no Electron:
                        # API calls hit CORS unless your RomM allows it)
```

Installers per OS (`electron-builder.yml`): Windows NSIS installer and
portable `.exe`, macOS `.dmg`/`.zip` (Apple silicon and Intel), Linux
AppImage, `.deb` and `.rpm` (x64 and arm64, e.g. a Raspberry Pi 4/5 on a
64-bit OS). CI builds all of them (`desktop-build.yml`); the Linux arm64
packages are cross-built on the x64 runner.
They are **unsigned** for now: Windows SmartScreen warns on first run ("More
info" → "Run anyway"), and on macOS right-click the app → Open the first
time (or `xattr -dr com.apple.quarantine /Applications/RommStream.app`).

Using it from the couch:

- Opens fullscreen. **F11** (or Alt+Enter) toggles windowed mode; Settings →
  Desktop has "Start fullscreen" and "Start when I sign in", plus **Quit**.
  The mouse cursor hides after a few seconds without movement.
- **Arrows / D-pad / left stick** move focus, **Enter / A** selects,
  **Escape / Backspace / B** goes back.
- In a game the controller belongs to the game. **Escape**, the
  controller's **Guide** button, or **Select + Start** together open the
  pause menu.
- Self-signed HTTPS RomM: Settings → Desktop → "Trust this server's
  certificate". For the very first sign-in, start the app with
  `ROMMSTREAM_TRUSTED_HOSTS=romm.home.local` (comma-separated, `host:port`
  allowed) instead.
- Linux: hardware video decoding (helps the streamed player) is opt-in with
  `ROMMSTREAM_ENABLE_VAAPI=1`. With no keyring running (Secret Service or
  KWallet), the saved sign-in is stored with a fixed key rather than
  encrypted.

### Releasing

Pushing a tag `vMAJOR.MINOR.PATCH` (e.g. `v0.1.0`) runs
`.github/workflows/release.yml`: lint, typecheck and tests, then the signed
Android TV APK and the Linux AppImage / `.deb` / `.rpm` (x64 and arm64),
published as a GitHub Release with generated notes. A suffixed tag
(`v0.2.0-rc.1`) is marked as a pre-release.

```sh
git tag v0.1.0 && git push origin v0.1.0
```

The version comes from the tag alone: the workflow sets `package.json`'s
version (Linux package names) and passes `-PversionName` /
`-PversionCode` to Gradle (`versionCode` = `MMmmpp`, so `0.1.0` → `100`;
minor and patch stay below 100).

Every file in the release gets a signed build-provenance attestation
(`actions/attest`), which ties it to the workflow run and commit that built
it. The desktop packages aren't code-signed yet, so this is how to check a
download is genuine:

```sh
gh attestation verify RommStream-0.1.0-androidtv.apk -R tacocats/RomMStream
```

Only the `publish` job can write to the repo (create the release, store the
attestation); every other job runs with read-only `contents`.

The APK is signed with the release key from these repo secrets, and the
workflow fails without them rather than shipping a debug-signed APK:

| Secret                      | Value                                    |
| --------------------------- | ---------------------------------------- |
| `ANDROID_KEYSTORE_BASE64`   | `base64 -w0 rommstream-release.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | keystore password                        |
| `ANDROID_KEY_ALIAS`         | key alias                                |
| `ANDROID_KEY_PASSWORD`      | key password                             |

Create the keystore once with
`keytool -genkeypair -v -keystore rommstream-release.keystore -alias rommstream -keyalg RSA -keysize 2048 -validity 10000`
and back it up outside the repo: Android only installs updates signed with
the same key. Locally, `assembleRelease` uses the debug key unless
`ROMMSTREAM_KEYSTORE` (and the matching `ROMMSTREAM_*` password/alias
variables) are set.

### Testing

#### Unit, integration and component tests

Jest with [React Native Testing Library](https://callstack.github.io/react-native-testing-library/)
v14 (note its API is async: `await render(...)`, `await fireEvent.press(...)`).

```sh
npm test               # whole suite
npm run test:watch
npm run test:coverage  # coverage for src/
npm run typecheck      # tsc: native, web (tsconfig.web.json), Electron, desktop e2e
npm run lint
```

- Tests live next to the code in `src/**/__tests__/`. The pure modules
  (`api/rommClient`, `auth/secureStore`, `settings/settingsStore`, the SVG
  class inliner) have unit tests; `auth/__tests__/AuthContext.test.tsx` is an
  integration test that drives the real context, API client and secure store
  against a mocked `fetch` and keychain; every screen and component has an
  RNTL test.
- Native modules are mocked once in `jest.setup.js` (WebView, keychain,
  AsyncStorage, react-native-svg, safe-area-context) with just enough state
  to behave like the real thing. `jest.setupAfterEnv.js` resets that state and
  installs a `fetch` mock that fails loudly unless a test queues a response.
  Shared helpers (`mockFetchOnce`, `createAuthValue`, `createScreenProps`)
  are in `src/testUtils/`.
- Jest runs two projects (`jest.config.js`): `native`, the React Native
  preset that covers the bulk of the app, and `web`, jsdom with `.web`
  resolution for the desktop-only modules (`*.web.test.ts` and
  `src/**/web/__tests__/`).
- Gotcha: RNTL's `act` returns React's bare thenable, so
  `await expect(act(...)).resolves` does not wait for it. Wrap it in
  `Promise.resolve(...)` first (see `actAsync` in the AuthContext test).

#### End-to-end tests (Detox, Android TV)

`e2e/login.test.js` boots the app on an Android TV emulator, checks the login
form and drives a sign-in against an unreachable server. Detox does not
support tvOS.

Prerequisites: the Android SDK, JDK 17, and an Android TV AVD named
`Television_1080p` (Android Studio → Device Manager → TV, or `avdmanager`
with an `android-tv` system image; change `avdName` in `.detoxrc.js` if
yours differs).

```sh
export ANDROID_HOME=$HOME/Android/Sdk
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64   # Gradle needs JDK 17
npm run e2e:build     # assembles the debug + androidTest APKs
npm start             # in another terminal: debug builds load JS from Metro
npm run e2e:test      # boots the AVD (or reuses a running one) and runs e2e/
```

If port 8081 is taken on your machine, set `RCT_METRO_PORT` (e.g. `8082`)
before both `npm run e2e:build` and `npm start -- --port 8082`: the build
bakes that port into the debug APK (Gradle property
`reactNativeDevServerPort`, see `android/app/build.gradle`) so the app on the
emulator finds Metro.

Typing into a field opens the TV's on-screen keyboard over the lower half of
the screen, so the e2e test closes it with `tapReturnKey()` after each field
before touching anything below it.

`npx detox test --configuration android.att.debug` runs the same suite on a
physical Android TV attached over `adb`. Running against a release build
would additionally need a network security config permitting cleartext to
`10.0.2.2` (Detox's test server), see the Detox docs.

#### End-to-end tests (Playwright, desktop)

`e2e-desktop/desktop.spec.ts` launches the Electron app against a small mock
RomM server (`e2e-desktop/mockRommServer.ts`, which sends no CORS headers) and
signs in, browses, launches a game and opens the pause menu with the keyboard
alone, then checks the sign-in survives a restart.

```sh
npm run build:desktop
npm run e2e:desktop               # on a headless Linux box: xvfb-run -a npm run e2e:desktop
ROMMSTREAM_E2E_EXECUTABLE=release/linux-unpacked/rommstream npm run e2e:desktop
                                  # the same against a packaged app
```

Playwright's own `page.keyboard` delivers keys past the Electron main
process, so keys meant for the running game go through
`webContents.sendInputEvent` (`pressInGame` in the spec) instead.

#### Git hooks

[lefthook](https://lefthook.dev) installs the hooks on `npm install`
(`lefthook.yml`):

- **pre-commit**: Prettier on the staged files (fixes are re-staged), then
  ESLint, `npm run typecheck` and the Jest suites related to the staged files.
- **pre-push**: the full Jest suite.

Skip once with `LEFTHOOK=0 git commit ...`; put personal tweaks in the
git-ignored `lefthook-local.yml`. Detox never runs from a hook.

### Project layout

```
src/
  api/            RomM REST client (login, refresh, platforms, roms)
  desktop/        Desktop build: the Electron bridge and fetch-through-main
  auth/           AuthContext (session state) + Keychain-backed secure storage
  components/     Shared TV-focusable UI pieces (top bar, rom grid, icons)
  input/          Remote/controller keys; web/ has the desktop focus + gamepad layer
  navigation/     React Navigation stack
  screens/        Login, Main (Home/Platforms/Search tabs), Roms, Player (WebView), Settings
  settings/       On-device settings (login path; in-browser play flag, off) via AsyncStorage
  testUtils/      Helpers shared by the Jest tests
  theme/          Shared color tokens
e2e/              Detox end-to-end tests (Android TV)
web/              Web (desktop) entry point and the react-native shim
electron/         Electron main process and preloads
e2e-desktop/      Playwright end-to-end tests (desktop)
```

### Notes on HTTP-only RomM servers

Many self-hosted RomM instances run over plain HTTP on a LAN.

- **Android**: debug builds allow cleartext HTTP by default; **release**
  builds do not (`usesCleartextTraffic` in `AndroidManifest.xml`). If you
  ship a release build against a plain-HTTP server, add a
  [network security config](https://developer.android.com/training/articles/security-config)
  scoped to your server's host/IP.
- **tvOS**: `Info.plist` allows local-network HTTP (`NSAllowsLocalNetworking`)
  but not arbitrary HTTP over the internet. A remote, non-HTTPS RomM server
  will need an ATS exception added there.
- **Desktop**: plain HTTP works as-is; API calls go through the Electron main
  process, so there's no mixed-content blocking either.

## License

[MIT](LICENSE) © 2026 RommStream contributors.
