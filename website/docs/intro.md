---
sidebar_position: 1
---

# Introduction

RommStream is a React Native TV app for **Android TV** and **Apple TV (tvOS)**
that turns a self-hosted [RomM](https://github.com/rommapp/romm) server into a
Plex/Jellyfin-style game library on your television.

Sign in to your RomM server, browse your library by platform, and launch a
game with your remote — RommStream picks the right player for the ROM
automatically.

:::warning[Server version]
RommStream requires a RomM server running **5.3.0-alpha** or newer.
:::

## What you get

- **Library browsing** — recently added and recommended shelves, a platform
  grid with per-console game counts, and search with platform filters.
- **One-button play** — press play and RommStream launches the game in
  whichever player RomM would use in a browser, no extra configuration.
- **Two playback modes**, chosen automatically per ROM:
  - **In-Browser Play** via RomM's own web players — [EmulatorJS](https://docs.romm.app/5.3.0-alpha/using/in-browser-play/emulatorjs/),
    [js-dos](https://docs.romm.app/5.3.0-alpha/using/in-browser-play/js-dos/),
    [MS-DOS](https://docs.romm.app/5.3.0-alpha/using/in-browser-play/ms-dos/),
    [PICO-8](https://docs.romm.app/5.3.0-alpha/using/in-browser-play/pico-8/),
    and [Ruffle](https://docs.romm.app/5.3.0-alpha/using/in-browser-play/ruffle/).
  - **[Emulator Streaming](https://docs.romm.app/5.3.0-alpha/using/emulator-streaming/)**
    for platforms RomM streams from the server instead.

## Where to go next

- Setting it up for the first time? See [Installing RommStream](./getting-started/installing.md).
