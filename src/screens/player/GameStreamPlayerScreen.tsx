import { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useRef, useState } from 'react';
import {
  heartbeatStreamingSession,
  releaseStreamingSession,
} from '../../api/rommClient';
import { useAuth } from '../../auth/AuthContext';
import { RootStackParamList } from '../../navigation/types';
import {
  resolutionPresets,
  selkiesCommands,
  selkiesPostMessageScript,
} from '../../player/selkies/commands';
import { createLogger } from '../../utils/logger';
import { WebPlayerScreen } from './WebPlayerScreen';

type Props = NativeStackScreenProps<RootStackParamList, 'GameStreamPlayer'>;

const log = createLogger('streaming');

// RomM's own player refreshes its claim this often; one that stops counts as
// abandoned and the next claim may take the container over.
const HEARTBEAT_INTERVAL_MS = 30 * 1000;

// `playUrl` is the session's room URL (what RomM's player would load in its
// stream iframe), loaded here as the top-level page so the menu commands can
// reach it. It wraps the actual selkies-core in #session-frame (same
// origin). Key presses go to whichever element has focus, so put it on the
// core and tell native to give the WebView Android focus.
const ROOM_SCRIPT = `
  (function () {
    var tries = 0;
    var timer = setInterval(function () {
      var frame = document.getElementById('session-frame');
      if (frame && frame.contentWindow) {
        try {
          frame.focus();
          frame.contentWindow.focus();
        } catch (e) {}
        if (++tries === 1) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'canvas' }));
        }
        if (tries > 10) { clearInterval(timer); }
      } else if (++tries > 150) {
        clearInterval(timer);
      }
    }, 200);
  })();
  true;
`;

/**
 * Plays a streaming session GameDetailsScreen has already claimed, keeping
 * the claim alive while the screen is up and releasing it (RomM saves on
 * release) when the player leaves.
 */
export function GameStreamPlayerScreen({ navigation, route }: Props) {
  const { romName, playUrl, platform, container } = route.params;
  const { withAuth } = useAuth();

  // withAuth changes identity whenever the token refreshes; the session's
  // lifetime mustn't, or a refresh mid-game would release it.
  const withAuthRef = useRef(withAuth);
  withAuthRef.current = withAuth;
  const goBackRef = useRef(navigation.goBack);
  goBackRef.current = navigation.goBack;

  useEffect(() => {
    let ended = false;
    const timer = setInterval(() => {
      withAuthRef
        .current((url, token) =>
          heartbeatStreamingSession(url, token, platform, container),
        )
        .then(status => {
          if (status.status === 'ended' && !ended) {
            ended = true;
            log.warn(
              `session on ${container} ended`,
              status.termination?.reason ?? '',
            );
            goBackRef.current();
          }
        })
        .catch(e => log.warn('heartbeat failed', e));
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      if (ended) {
        return;
      }
      withAuthRef
        .current((url, token) =>
          releaseStreamingSession(url, token, platform, { container }),
        )
        .catch(e => log.warn(`could not release ${container}`, e));
    };
  }, [platform, container]);

  // selkies-core defaults gamepad capture to enabled; tracked here purely to
  // label the menu item with the action it's about to take.
  const [gamepadEnabled, setGamepadEnabled] = useState(true);

  return (
    <WebPlayerScreen
      romName={romName}
      playUrl={playUrl}
      autoPlayScript={ROOM_SCRIPT}
      onExit={navigation.goBack}
      menuActions={send => [
        {
          id: 'selkies-fullscreen',
          label: 'Fullscreen',
          onSelect: () =>
            send(selkiesPostMessageScript(selkiesCommands.requestFullscreen())),
        },
        {
          id: 'selkies-aspect-widescreen',
          label: 'Aspect Ratio: 16:9',
          onSelect: () =>
            send(
              selkiesPostMessageScript(
                selkiesCommands.setManualResolution(
                  resolutionPresets.widescreen.width,
                  resolutionPresets.widescreen.height,
                ),
              ),
            ),
        },
        {
          id: 'selkies-aspect-standard',
          label: 'Aspect Ratio: 4:3',
          onSelect: () =>
            send(
              selkiesPostMessageScript(
                selkiesCommands.setManualResolution(
                  resolutionPresets.standard.width,
                  resolutionPresets.standard.height,
                ),
              ),
            ),
        },
        {
          id: 'selkies-aspect-reset',
          label: 'Aspect Ratio: Fit Screen',
          onSelect: () =>
            send(
              selkiesPostMessageScript(
                selkiesCommands.resetResolutionToWindow(),
              ),
            ),
        },
        {
          id: 'selkies-gamepad-capture',
          label: gamepadEnabled
            ? 'Disable Gamepad Capture'
            : 'Enable Gamepad Capture',
          onSelect: () => {
            const next = !gamepadEnabled;
            setGamepadEnabled(next);
            send(
              selkiesPostMessageScript(selkiesCommands.gamepadControl(next)),
            );
          },
        },
      ]}
    />
  );
}
