package com.rommstream.keyevents

import com.facebook.fbreact.specs.NativeKeyEventsSpec
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.module.annotations.ReactModule

/**
 * Thin JS handle on [KeyEventBridge]: all it does is hand over the list of
 * keys to swallow and keep the bridge pointed at a live React context. The
 * presses themselves travel back the other way as device events. See
 * `src/input/hardwareKeys.ts` for the JS side.
 */
@ReactModule(name = NativeKeyEventsSpec.NAME)
internal class KeyEventsModule(reactContext: ReactApplicationContext) :
    NativeKeyEventsSpec(reactContext) {

  init {
    KeyEventBridge.attach(reactContext)
  }

  override fun setInterceptedKeys(keys: ReadableArray) {
    KeyEventBridge.setInterceptedKeys((0 until keys.size()).mapNotNull(keys::getString))
  }

  override fun invalidate() {
    KeyEventBridge.detach(reactApplicationContext)
    super.invalidate()
  }
}
