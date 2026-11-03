// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`.
//
// The pieces Android asks for by name around PsysonicWidgets: one provider per widget in the
// picker, the invisible activity a widget tap runs, and the two Quick Settings tiles.
package dev.psysonic.player

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Draws from the kept state; the app redraws on every change, so no periodic update. */
abstract class PsysonicWidgetProvider : AppWidgetProvider() {
  override fun onUpdate(ctx: Context, manager: AppWidgetManager, ids: IntArray) {
    val pending = goAsync()
    PsysonicWidgets.redrawAsync(ctx) { pending.finish() }
  }

  override fun onAppWidgetOptionsChanged(ctx: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    val pending = goAsync()
    PsysonicWidgets.redrawAsync(ctx) { pending.finish() }
  }
}

class PsysonicCoverWidget : PsysonicWidgetProvider()
class PsysonicNowWidget : PsysonicWidgetProvider()
class PsysonicMixWidget : PsysonicWidgetProvider()
class PsysonicRecentWidget : PsysonicWidgetProvider()

/**
 * A widget tap. The launcher may start an activity, the app's own receivers may not (Android's
 * background start rules), so the tap lands here, transparent and gone at once: with the web
 * view running the action goes to it and the app stays in the background; otherwise the app
 * opens with the action.
 */
class PsysonicWidgetActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    val action = intent.getStringExtra(PsysonicWidgets.EXTRA_ACTION)
    if (action != null) {
      if (PsysonicWidgets.webAlive) {
        PsysonicWidgets.run(action)
      } else {
        startActivity(
          Intent(this, MainActivity::class.java)
            .putExtra(PsysonicWidgets.EXTRA_ACTION, action)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
      }
    }
    finish()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      overrideActivityTransition(OVERRIDE_TRANSITION_CLOSE, 0, 0)
    } else {
      @Suppress("DEPRECATION")
      overridePendingTransition(0, 0)
    }
  }
}

/** Play / pause; lit while a song plays, with its title underneath. */
class PsysonicPlayTile : TileService() {
  override fun onStartListening() {
    val now = PsysonicWidgets.state(this)?.optJSONObject("now")
    val tile = qsTile ?: return
    tile.state = if (now?.optBoolean("playing") == true) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tile.subtitle = now?.optString("title", "")?.takeIf { it.isNotEmpty() }
    }
    tile.updateTile()
  }

  override fun onClick() = PsysonicWidgets.tileTap(this, "toggle")
}

/** Starts the mix the app offers; its name underneath. */
class PsysonicMixTile : TileService() {
  override fun onStartListening() {
    val mix = PsysonicWidgets.state(this)?.optJSONObject("mix")
    val tile = qsTile ?: return
    tile.state = Tile.STATE_INACTIVE
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      tile.subtitle = mix?.optString("title", "")?.takeIf { it.isNotEmpty() }
    }
    tile.updateTile()
  }

  override fun onClick() = PsysonicWidgets.tileTap(this, "mix")
}
