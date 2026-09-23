package com.rommstream.keyevents

import android.view.KeyEvent
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactContext

/**
 * Shared state between [com.rommstream.MainActivity]'s key dispatch and the
 * KeyEvents native module.
 *
 * The activity is the only place in the app that sees a key press before
 * anything else does: `Activity.dispatchKeyEvent` runs before the decor view,
 * before ReactRootView (which is where react-native-tvos turns D-pad presses
 * into TV events), and before the WebView the emulator runs in. Anything that
 * hooks in lower down can only observe a key, never take it away from the
 * page — so interception has to live here.
 *
 * The check has to answer synchronously, so JS can't be asked per key press.
 * Instead JS declares up front which keys it wants (`setInterceptedKeys`) and
 * that set is kept here; a press of one of those keys is reported to JS and
 * swallowed, everything else falls through untouched.
 */
internal object KeyEventBridge {

  /** Event name JS listens for on RCTDeviceEventEmitter. */
  const val EVENT_NAME: String = "rommstream.hardwareKey"

  @Volatile private var interceptedKeyCodes: Set<Int> = emptySet()
  @Volatile private var reactContext: ReactContext? = null

  fun attach(context: ReactContext) {
    reactContext = context
  }

  fun detach(context: ReactContext) {
    // On a reload the replacement context can attach before the old one is
    // torn down, so only the context still in place may clear anything.
    if (reactContext === context) {
      reactContext = null
      // Whatever JS asked for went with it; the remote must not be left dead.
      interceptedKeyCodes = emptySet()
    }
  }

  /** @param names JS key names; unknown ones are ignored. */
  fun setInterceptedKeys(names: List<String>) {
    interceptedKeyCodes = names.flatMap { KEY_CODES[it].orEmpty() }.toSet()
  }

  /**
   * @return true when the event was consumed and must not travel any further.
   */
  fun dispatchKeyEvent(event: KeyEvent): Boolean {
    if (event.keyCode !in interceptedKeyCodes) {
      return false
    }
    val context = reactContext ?: return false
    // Nothing can act on the key if JS isn't running, so let it through rather
    // than swallowing it into a dead bridge.
    if (!context.hasActiveReactInstance()) {
      return false
    }
    val name = KEY_NAMES[event.keyCode] ?: return false
    // Only the initial press is reported — a held remote button shouldn't
    // reopen a menu 20 times — but every action for the key is swallowed, so
    // nothing downstream is left holding half a press.
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
      context.emitDeviceEvent(
          EVENT_NAME,
          Arguments.createMap().apply {
            putString("key", name)
            putInt("keyCode", event.keyCode)
          },
      )
    }
    return true
  }

  /**
   * JS key name to the Android key codes it covers. Names are deliberately
   * one-to-many (a "select" arrives as D-pad centre or Enter depending on the
   * remote) but no key code appears twice, so [KEY_NAMES] can invert this.
   *
   * HOME and the recents key are absent on purpose: the system handles those
   * itself and never delivers them to the activity, so no app can take them.
   * Volume is left out too — swallowing it would just break the TV's volume.
   */
  private val KEY_CODES: Map<String, List<Int>> =
      mapOf(
          "back" to listOf(KeyEvent.KEYCODE_BACK),
          "menu" to listOf(KeyEvent.KEYCODE_MENU),
          "info" to listOf(KeyEvent.KEYCODE_INFO),
          "guide" to listOf(KeyEvent.KEYCODE_GUIDE),
          "select" to
              listOf(
                  KeyEvent.KEYCODE_DPAD_CENTER,
                  KeyEvent.KEYCODE_ENTER,
                  KeyEvent.KEYCODE_NUMPAD_ENTER,
              ),
          "up" to listOf(KeyEvent.KEYCODE_DPAD_UP),
          "down" to listOf(KeyEvent.KEYCODE_DPAD_DOWN),
          "left" to listOf(KeyEvent.KEYCODE_DPAD_LEFT),
          "right" to listOf(KeyEvent.KEYCODE_DPAD_RIGHT),
          "playPause" to listOf(KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE),
          "play" to listOf(KeyEvent.KEYCODE_MEDIA_PLAY),
          "pause" to listOf(KeyEvent.KEYCODE_MEDIA_PAUSE),
          "stop" to listOf(KeyEvent.KEYCODE_MEDIA_STOP),
          "rewind" to listOf(KeyEvent.KEYCODE_MEDIA_REWIND),
          "fastForward" to listOf(KeyEvent.KEYCODE_MEDIA_FAST_FORWARD),
          "next" to listOf(KeyEvent.KEYCODE_MEDIA_NEXT),
          "previous" to listOf(KeyEvent.KEYCODE_MEDIA_PREVIOUS),
          "channelUp" to listOf(KeyEvent.KEYCODE_CHANNEL_UP),
          "channelDown" to listOf(KeyEvent.KEYCODE_CHANNEL_DOWN),
          "buttonA" to listOf(KeyEvent.KEYCODE_BUTTON_A),
          "buttonB" to listOf(KeyEvent.KEYCODE_BUTTON_B),
          "buttonX" to listOf(KeyEvent.KEYCODE_BUTTON_X),
          "buttonY" to listOf(KeyEvent.KEYCODE_BUTTON_Y),
          "buttonL1" to listOf(KeyEvent.KEYCODE_BUTTON_L1),
          "buttonR1" to listOf(KeyEvent.KEYCODE_BUTTON_R1),
          "buttonL2" to listOf(KeyEvent.KEYCODE_BUTTON_L2),
          "buttonR2" to listOf(KeyEvent.KEYCODE_BUTTON_R2),
          "buttonThumbL" to listOf(KeyEvent.KEYCODE_BUTTON_THUMBL),
          "buttonThumbR" to listOf(KeyEvent.KEYCODE_BUTTON_THUMBR),
          "buttonStart" to listOf(KeyEvent.KEYCODE_BUTTON_START),
          "buttonSelect" to listOf(KeyEvent.KEYCODE_BUTTON_SELECT),
      )

  private val KEY_NAMES: Map<Int, String> =
      KEY_CODES.flatMap { (name, codes) -> codes.map { it to name } }.toMap()
}
