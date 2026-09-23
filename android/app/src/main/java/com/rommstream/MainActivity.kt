package com.rommstream

import android.view.KeyEvent
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.rommstream.keyevents.KeyEventBridge

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "RommStream"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  /**
   * First look at every key press, ahead of the React root view and the
   * WebView the emulator runs in. Keys JS has asked to intercept are reported
   * to it and stop here; everything else carries on as normal.
   */
  override fun dispatchKeyEvent(event: KeyEvent): Boolean =
      KeyEventBridge.dispatchKeyEvent(event) || super.dispatchKeyEvent(event)
}
