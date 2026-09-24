import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React from 'react';
import { RootStackParamList } from '../../navigation/types';
import { WebPlayerScreen } from './WebPlayerScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'GameStreamPlayer'>;

// RomM's `/rom/:id/stream` route lands on a lobby whose Play button reads
// "Stream on <container>" rather than the browser-emulator lobby's plain
// "Play" / `.play-button` / `.r-v2-ejs__play`, and its game surface is a
// <video> element instead of a <canvas>. Its handler needs no user gesture,
// so press it for the user: a TV remote shouldn't have to scroll a web page
// to start the game. On pages without a matching button (the plain rom page
// fallback) this gives up after a while.
//
// This script is presently identical to EmulatorPlayerScreen's — both
// player types currently boot through the same RomM lobby UI — but each
// screen owns its own copy so the launch sequences can diverge (e.g. this
// player has no EmulatorJS touch gamepad to disable) without one player's
// fix risking a regression in the other's.
//
// Pressing Play with `.click()` leaves DOM focus sitting on the (now hidden)
// lobby button, so keys go nowhere — the video has to be focused before a
// controller does anything. It gets a real pointer sequence rather than
// another bare `.click()`: that both moves focus and counts as the user
// gesture the page needs before it may start audio. Focus is then held
// against the page moving it around while the stream connects, and `canvas`
// is posted back so the native side can put Android focus on the WebView too.
const AUTO_PLAY_SCRIPT = `
  (function () {
    var post = function (payload) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    };

    var style = document.createElement('style');
    style.textContent = '.ejs_virtualGamepad_parent { display: none !important; }';
    document.head.appendChild(style);

    var disableTouchGamepad = function () {
      var tries = 0;
      var timer = setInterval(function () {
        var ejs = window.EJS_emulator;
        if (ejs && typeof ejs.changeSettingOption === 'function') {
          clearInterval(timer);
          try { ejs.changeSettingOption('virtual-gamepad', 'disabled'); } catch (e) {}
        } else if (++tries > 300) {
          clearInterval(timer);
        }
      }, 200);
    };

    // RomM's v2 UI pops up a "New version available" toast over the game
    // ('.r-v2-new-version') with no keyboard/gamepad focus of its own, so a
    // TV remote has no way to clear it. It can appear any time, not just on
    // load, so this keeps polling for the rest of the session instead of
    // giving up after a fixed number of tries like the one-shot checks above.
    var dismissNewVersionToast = function () {
      setInterval(function () {
        var dismiss = document.querySelector('.r-v2-new-version__dismiss');
        if (dismiss) { dismiss.click(); }
      }, 1000);
    };

    var pressCentre = function (el) {
      var rect = el.getBoundingClientRect();
      var base = {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX: Math.round(rect.left + rect.width / 2),
        clientY: Math.round(rect.top + rect.height / 2),
        button: 0,
      };
      ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(function (type) {
        var down = type === 'pointerdown' || type === 'mousedown';
        var Ctor = type.indexOf('pointer') === 0 && window.PointerEvent ? PointerEvent : MouseEvent;
        var init = {};
        for (var key in base) { init[key] = base[key]; }
        init.buttons = down ? 1 : 0;
        if (Ctor === window.PointerEvent) { init.pointerType = 'mouse'; init.isPrimary = true; }
        try { el.dispatchEvent(new Ctor(type, init)); } catch (e) {}
      });
    };

    // EmulatorJS draws into a canvas; the /rom/:id/stream route plays a remote
    // container in a video element instead, and wants the same treatment.
    var findGameSurface = function () {
      return document.querySelector('canvas.ejs_canvas') ||
        document.querySelector('#game canvas') ||
        document.querySelector('canvas') ||
        document.querySelector('video');
    };

    var focusGameSurface = function () {
      var pressed = false;
      var tries = 0;
      var held = 0;
      var timer = setInterval(function () {
        var surface = findGameSurface();
        if (!surface) {
          if (++tries > 150) { clearInterval(timer); }
          return;
        }
        // Neither element is focusable unless it's given a tab index.
        if (!surface.hasAttribute('tabindex')) { surface.setAttribute('tabindex', '-1'); }
        if (!pressed) {
          pressed = true;
          pressCentre(surface);
          post({ type: 'canvas' });
        }
        if (document.activeElement !== surface) {
          surface.focus({ preventScroll: true });
          held = 0;
        } else if (++held > 5) {
          // Focus has stayed put through a second of start-up; it's the game's now.
          clearInterval(timer);
        }
      }, 200);
    };

    var findPlayButton = function () {
      var byClass = document.querySelector('button.play-button, button.r-v2-ejs__play');
      if (byClass) { return byClass; }
      var buttons = document.querySelectorAll('button');
      for (var i = 0; i < buttons.length; i++) {
        var text = buttons[i].textContent.trim().toLowerCase();
        if (text === 'play' || text.indexOf('stream on') === 0) { return buttons[i]; }
      }
      return null;
    };
    var tries = 0;
    var timer = setInterval(function () {
      var btn = findPlayButton();
      if (btn) {
        clearInterval(timer);
        btn.click();
        disableTouchGamepad();
        dismissNewVersionToast();
        focusGameSurface();
      } else if (++tries > 150) {
        clearInterval(timer);
      }
    }, 200);
  })();
  true;
`;

/** RomM's server-side streamed container player (`/rom/:id/stream`). */
export function GameStreamPlayerScreen({ navigation, route }: Props) {
  const { romName, playUrl } = route.params;

  return (
    <WebPlayerScreen
      romName={romName}
      playUrl={playUrl}
      autoPlayScript={AUTO_PLAY_SCRIPT}
      onExit={navigation.goBack}
    />
  );
}
