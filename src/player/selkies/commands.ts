/**
 * Command envelope for talking to selkies-web-core over `window.postMessage`,
 * injected into the WebView at *runtime* — after the play page has already
 * loaded — unlike `autoPlayScript`, which only runs once via
 * `injectedJavaScript` at initial load (see WebPlayerScreen).
 *
 * selkies-core's own dashboard (selkies-dashboard) is documented as "just one
 * consumer" of an in-page `window.postMessage` API: it sends plain
 * `{ type: '...', ...fields }` objects via
 * `window.postMessage(message, window.location.origin)`, and selkies-core
 * listens for them on the same window. Our injected script runs in that same
 * top-level document/window (no iframe boundary), so posting the same shape
 * reaches selkies-core the same way selkies-dashboard's own messages do.
 *
 * Message shapes below are taken from selkies-dashboard's source
 * (addons/selkies-dashboard/src/components/Sidebar.jsx in
 * selkies-project/selkies), not from a formal spec — check that file if a
 * command here stops working after a selkies upgrade.
 */
export interface SelkiesCommand {
  type: string;
  [field: string]: unknown;
}

/**
 * Builds a script safe to hand to the WebView's `injectJavaScript`. selkies-core
 * drops any message whose origin isn't its own, so this must run on the
 * streaming page (see GAME_STREAM_FRAME_SCRIPT) and posts to the nested
 * `#session-frame` core, which shares that page's origin. Falls back to the
 * page's own window when the core is the top-level page.
 */
export function selkiesPostMessageScript(command: SelkiesCommand): string {
  return `
    (function () {
      try {
        var frame = document.getElementById('session-frame');
        var target = (frame && frame.contentWindow) || window;
        target.postMessage(${JSON.stringify(command)}, window.location.origin);
      } catch (e) {}
    })();
    true;
  `;
}

/** Common streamed-resolution presets, paired with a matching aspect ratio. */
export const resolutionPresets = {
  widescreen: { width: 1920, height: 1080 },
  standard: { width: 1440, height: 1080 },
} as const;

export const selkiesCommands = {
  requestFullscreen: (): SelkiesCommand => ({ type: 'requestFullscreen' }),
  gamepadControl: (enabled: boolean): SelkiesCommand => ({
    type: 'gamepadControl',
    enabled,
  }),
  setManualResolution: (width: number, height: number): SelkiesCommand => ({
    type: 'setManualResolution',
    width,
    height,
  }),
  resetResolutionToWindow: (): SelkiesCommand => ({
    type: 'resetResolutionToWindow',
  }),
};
