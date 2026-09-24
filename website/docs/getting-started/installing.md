---
sidebar_position: 2
---

# Installing RommStream

RommStream isn't in an app store yet, so today the only way to get it onto a
TV is to build it from source and install it yourself.

## Prerequisites

- Node.js and npm
- **Android TV**: the Android SDK (the Gradle build downloads the NDK/build
  tools it needs on first run) and either a physical Android TV device or an
  Android TV emulator.
- **Apple TV**: a Mac with Xcode and CocoaPods.

## Get the source

```sh
git clone https://github.com/tacocats/RomMStream.git
cd RomMStream
npm install
```

## Android TV

Start Metro in one terminal:

```sh
npm start
```

Then, with your device or emulator connected, build and install in another:

```sh
npm run android
```

## Apple TV

```sh
bundle install
bundle exec pod install --project-directory=ios
npx react-native run-tvos --simulator "Apple TV"
```

Once the app is installed, launch it from your TV's home screen and sign in
with your RomM server address and credentials.

:::tip[Building it yourself?]
If you hit build errors, the project README's
[Developers section](https://github.com/tacocats/RomMStream#developers)
tracks known environment gotchas (Gradle/JDK versions, dependency pins) and
is kept up to date as the app changes.
:::
