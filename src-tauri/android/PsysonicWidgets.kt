// ⚠️ Android territory. Copied into the generated project by `patch-gen.mjs`.
//
// Home screen widgets and Quick Settings tiles, the counterpart of the iPhone's widgets. The
// web view sends what they show (`mobileShell/android/androidWidgets.ts`, built in
// `mobileShell/widgets/`); it is kept in the app's storage and drawn from there, so the widgets
// keep their content after a restart. Covers are paths in the cover cache.
//
// Taps run through PsysonicWidgetActivity: with the web view running they reach it at once and
// the app stays where it is; otherwise they open the app and wait until its restored queue is
// back (`ready`), so a tap plays or resumes what was there.
package dev.psysonic.player

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.ColorStateList
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Shader
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.service.quicksettings.TileService
import android.util.LruCache
import android.util.SizeF
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.RemoteViews
import java.io.File
import java.util.concurrent.Executors
import org.json.JSONArray
import org.json.JSONObject

object PsysonicWidgets {
  const val EXTRA_ACTION = "dev.psysonic.player.WIDGET_ACTION"
  private const val STATE_FILE = "widget-state.json"
  /** While a song plays, the progress bars move on this often. */
  private const val PROGRESS_TICK_MS = 15_000L
  private const val DEFAULT_ACCENT = 0xFFCBA6F7.toInt()

  private val worker = Executors.newSingleThreadExecutor()
  private val main = Handler(Looper.getMainLooper())
  @Volatile private var webView: WebView? = null
  @Volatile private var webReady = false
  private val waiting = mutableListOf<String>()
  @Volatile private var state: JSONObject? = null
  @Volatile private var appContext: Context? = null

  /** Whether the web view exists; without it a tap has to open the app. */
  val webAlive: Boolean get() = webView != null

  fun attach(activity: MainActivity, view: WebView) {
    appContext = activity.applicationContext
    webView = view
    webReady = false
    view.addJavascriptInterface(Bridge(activity.applicationContext), "PsysonicAndroidWidgets")
  }

  fun detach(view: WebView?) {
    if (webView !== view) return
    webView = null
    webReady = false
    main.removeCallbacks(tick)
  }

  /** The app was opened by a widget or tile tap. */
  fun onActivityIntent(intent: Intent?) {
    val action = intent?.getStringExtra(EXTRA_ACTION) ?: return
    intent.removeExtra(EXTRA_ACTION)
    run(action)
  }

  /** Runs the action in the web view once it listens; until then it waits. */
  fun run(action: String) {
    main.post {
      val view = webView
      if (view != null && webReady) send(view, action) else synchronized(waiting) { waiting += action }
    }
  }

  private fun send(view: WebView, action: String) {
    view.evaluateJavascript(
      "window.__psyWidgetCommand && window.__psyWidgetCommand(${JSONObject.quote(action)})",
      null,
    )
  }

  private class Bridge(private val ctx: Context) {
    @JavascriptInterface
    fun update(json: String) {
      worker.execute {
        val parsed = runCatching { JSONObject(json) }.getOrNull() ?: return@execute
        state = parsed
        runCatching {
          val tmp = File(ctx.filesDir, "$STATE_FILE.tmp")
          tmp.writeText(json)
          if (!tmp.renameTo(File(ctx.filesDir, STATE_FILE))) tmp.delete()
        }
        redraw(ctx)
      }
    }

    @JavascriptInterface
    fun ready() {
      main.post {
        webReady = true
        val view = webView ?: return@post
        val actions = synchronized(waiting) { waiting.toList().also { waiting.clear() } }
        actions.forEach { send(view, it) }
      }
    }
  }

  /** What the web view sent last, also after a restart. */
  fun state(ctx: Context): JSONObject? = state ?: runCatching {
    val file = File(ctx.applicationContext.filesDir, STATE_FILE)
    if (file.exists()) JSONObject(file.readText()) else null
  }.getOrNull()?.also { state = it }

  /** A widget asked to be drawn (placed, resized, the launcher restarted). */
  fun redrawAsync(ctx: Context, done: () -> Unit) {
    val app = ctx.applicationContext
    worker.execute {
      try {
        redraw(app)
      } finally {
        done()
      }
    }
  }

  /** Draws every placed widget and lets the tiles refresh. On the worker thread. */
  private fun redraw(ctx: Context, kinds: List<Kind> = Kind.entries) {
    val app = ctx.applicationContext
    val manager = AppWidgetManager.getInstance(app)
    val current = state(app)
    for (kind in kinds) {
      for (id in manager.getAppWidgetIds(ComponentName(app, kind.provider))) {
        runCatching { manager.updateAppWidget(id, views(app, manager, kind, id, current)) }
          .onFailure { android.util.Log.w("PsysonicWidgets", "widget $kind not drawn: $it") }
      }
    }
    if (kinds.size > 1) {
      for (tile in listOf(PsysonicPlayTile::class.java, PsysonicMixTile::class.java)) {
        runCatching { TileService.requestListeningState(app, ComponentName(app, tile)) }
      }
    }
    main.post { scheduleProgress(app) }
  }

  private val tick = Runnable {
    val ctx = appContext ?: return@Runnable
    worker.execute { redraw(ctx, listOf(Kind.NOW)) }
  }

  private fun scheduleProgress(ctx: Context) {
    main.removeCallbacks(tick)
    val now = state?.optJSONObject("now") ?: return
    if (!now.optBoolean("playing") || now.optDouble("duration", 0.0) <= 0 || webView == null) return
    val placed = AppWidgetManager.getInstance(ctx).getAppWidgetIds(ComponentName(ctx, Kind.NOW.provider))
    if (placed.isNotEmpty()) main.postDelayed(tick, PROGRESS_TICK_MS)
  }

  enum class Kind(val provider: Class<*>) {
    COVER(PsysonicCoverWidget::class.java),
    NOW(PsysonicNowWidget::class.java),
    MIX(PsysonicMixWidget::class.java),
    RECENT(PsysonicRecentWidget::class.java),
  }

  private fun views(ctx: Context, manager: AppWidgetManager, kind: Kind, id: Int, s: JSONObject?): RemoteViews =
    when (kind) {
      Kind.COVER -> cover(ctx, s)
      Kind.MIX -> mix(ctx, s)
      Kind.RECENT -> recent(ctx, s)
      Kind.NOW -> if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        RemoteViews(
          mapOf(
            SizeF(110f, 110f) to nowSmall(ctx, s),
            SizeF(250f, 110f) to nowPlayer(ctx, s, R.layout.widget_now_medium),
            SizeF(250f, 260f) to nowPlayer(ctx, s, R.layout.widget_now_large),
          ),
        )
      } else {
        val options = manager.getAppWidgetOptions(id)
        when {
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH) < 250 -> nowSmall(ctx, s)
          options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT) >= 260 ->
            nowPlayer(ctx, s, R.layout.widget_now_large)
          else -> nowPlayer(ctx, s, R.layout.widget_now_medium)
        }
      }
    }

  // ── The widgets

  private fun cover(ctx: Context, s: JSONObject?): RemoteViews =
    RemoteViews(ctx.packageName, R.layout.widget_cover).apply {
      val now = s?.optJSONObject("now")
      setImageViewBitmap(R.id.widget_cover, bitmap(now?.text("image"), 400, 0f))
      song(ctx, s, now)
      setOnClickPendingIntent(android.R.id.background, openApp(ctx))
    }

  private fun nowSmall(ctx: Context, s: JSONObject?): RemoteViews =
    RemoteViews(ctx.packageName, R.layout.widget_now_small).apply {
      val now = s?.optJSONObject("now")
      setImageViewBitmap(R.id.widget_cover, bitmap(now?.text("image"), px(ctx, 56), px(ctx, 10).toFloat()))
      song(ctx, s, now)
      progress(s, now)
      setOnClickPendingIntent(android.R.id.background, openApp(ctx))
    }

  private fun nowPlayer(ctx: Context, s: JSONObject?, layout: Int): RemoteViews =
    RemoteViews(ctx.packageName, layout).apply {
      val now = s?.optJSONObject("now")
      setImageViewBitmap(R.id.widget_cover, bitmap(now?.text("image"), px(ctx, 112), px(ctx, 14).toFloat()))
      song(ctx, s, now)
      progress(s, now)
      setTextViewText(R.id.widget_label, s.label("nowPlaying"))
      setTextColor(R.id.widget_label, accent(s))
      setOnClickPendingIntent(R.id.widget_previous, actionIntent(ctx, "previous"))
      setOnClickPendingIntent(R.id.widget_next, actionIntent(ctx, "next"))
      setOnClickPendingIntent(android.R.id.background, openApp(ctx))
      if (layout == R.layout.widget_now_large) upNext(ctx, s)
    }

  private fun RemoteViews.upNext(ctx: Context, s: JSONObject?) {
    val next = s?.optJSONArray("next") ?: JSONArray()
    setTextViewText(R.id.widget_next_label, s.label("upNext"))
    setViewVisibility(R.id.widget_next_label, if (next.length() > 0) View.VISIBLE else View.GONE)
    val rows = listOf(
      intArrayOf(R.id.widget_next_row_1, R.id.widget_next_cover_1, R.id.widget_next_title_1, R.id.widget_next_artist_1),
      intArrayOf(R.id.widget_next_row_2, R.id.widget_next_cover_2, R.id.widget_next_title_2, R.id.widget_next_artist_2),
      intArrayOf(R.id.widget_next_row_3, R.id.widget_next_cover_3, R.id.widget_next_title_3, R.id.widget_next_artist_3),
    )
    rows.forEachIndexed { index, (row, cover, title, artist) ->
      val song = next.optJSONObject(index)
      setViewVisibility(row, if (song != null) View.VISIBLE else View.GONE)
      if (song == null) return@forEachIndexed
      setImageViewBitmap(cover, bitmap(song.text("image"), px(ctx, 40), px(ctx, 6).toFloat()))
      setTextViewText(title, song.text("title"))
      setTextViewText(artist, song.text("artist"))
    }
  }

  private fun mix(ctx: Context, s: JSONObject?): RemoteViews =
    RemoteViews(ctx.packageName, R.layout.widget_mix).apply {
      val mix = s?.optJSONObject("mix")
      mix?.text("title")?.let { setTextViewText(R.id.widget_title, it) }
      val hint = mix?.text("hint")
      setTextViewText(R.id.widget_artist, hint ?: "")
      setViewVisibility(R.id.widget_artist, if (hint != null) View.VISIBLE else View.GONE)
      tintButton(R.id.widget_mix_icon, s)
      setOnClickPendingIntent(android.R.id.background, actionIntent(ctx, "mix"))
    }

  private fun recent(ctx: Context, s: JSONObject?): RemoteViews =
    RemoteViews(ctx.packageName, R.layout.widget_recent).apply {
      s.label("recentlyPlayed").takeIf { it.isNotEmpty() }?.let { setTextViewText(R.id.widget_label, it) }
      val albums = s?.optJSONArray("recent") ?: JSONArray()
      val cells = listOf(
        intArrayOf(R.id.widget_recent_1, R.id.widget_recent_cover_1, R.id.widget_recent_title_1),
        intArrayOf(R.id.widget_recent_2, R.id.widget_recent_cover_2, R.id.widget_recent_title_2),
        intArrayOf(R.id.widget_recent_3, R.id.widget_recent_cover_3, R.id.widget_recent_title_3),
        intArrayOf(R.id.widget_recent_4, R.id.widget_recent_cover_4, R.id.widget_recent_title_4),
      )
      cells.forEachIndexed { index, (cell, cover, title) ->
        val album = albums.optJSONObject(index)
        setViewVisibility(cell, if (album != null) View.VISIBLE else View.INVISIBLE)
        if (album == null) return@forEachIndexed
        setImageViewBitmap(cover, bitmap(album.text("image"), px(ctx, 68), px(ctx, 10).toFloat()))
        setTextViewText(title, album.text("title"))
        setOnClickPendingIntent(cell, actionIntent(ctx, "album:${album.text("node")}"))
      }
      setOnClickPendingIntent(android.R.id.background, openApp(ctx))
    }

  /** Title, artist and the play button, shared by the song widgets. */
  private fun RemoteViews.song(ctx: Context, s: JSONObject?, now: JSONObject?) {
    setTextViewText(R.id.widget_title, now?.text("title") ?: s.label("nothingPlaying").ifEmpty { "Psysonic" })
    setTextViewText(R.id.widget_artist, now?.let { it.text("artist") ?: it.text("album") } ?: "")
    val playing = now?.optBoolean("playing") == true
    setImageViewResource(R.id.widget_toggle, if (playing) R.drawable.ic_widget_pause else R.drawable.ic_widget_play)
    tintButton(R.id.widget_toggle, s)
    setOnClickPendingIntent(R.id.widget_toggle, actionIntent(ctx, "toggle"))
  }

  /** How far the song is; a radio station or nothing playing has no bar. */
  private fun RemoteViews.progress(s: JSONObject?, now: JSONObject?) {
    val duration = now?.optDouble("duration", 0.0) ?: 0.0
    if (now == null || duration <= 0 || now.optBoolean("radio")) {
      setViewVisibility(R.id.widget_progress, View.INVISIBLE)
      return
    }
    val startedAt = now.optDouble("startedAt", 0.0)
    val elapsed = if (now.optBoolean("playing") && startedAt > 0) {
      System.currentTimeMillis() / 1000.0 - startedAt
    } else {
      now.optDouble("elapsed", 0.0)
    }
    setViewVisibility(R.id.widget_progress, View.VISIBLE)
    setProgressBar(R.id.widget_progress, 1000, (elapsed / duration * 1000).toInt().coerceIn(0, 1000), false)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      setColorStateList(R.id.widget_progress, "setProgressTintList", ColorStateList.valueOf(accent(s)))
    }
  }

  private fun RemoteViews.tintButton(id: Int, s: JSONObject?) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      setColorStateList(id, "setBackgroundTintList", ColorStateList.valueOf(accent(s)))
    }
  }

  // ── Taps

  /**
   * Play, pause and skip run through PsysonicWidgetActivity and leave the app where it is. A
   * mix or an album opens the app: loading them needs the page's timers, which a web view that
   * sat paused in the background may not run until it is in front again (measured on a S22,
   * Android 16). The action in the data keeps each tap's intent apart.
   */
  private fun actionIntent(ctx: Context, action: String): PendingIntent {
    val opensApp = action == "mix" || action.startsWith("album:")
    val target = if (opensApp) MainActivity::class.java else PsysonicWidgetActivity::class.java
    val intent = Intent(ctx, target)
      .setData(Uri.fromParts("psysonic-widget", action, null))
      .putExtra(EXTRA_ACTION, action)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (!opensApp) intent.addFlags(Intent.FLAG_ACTIVITY_NO_ANIMATION)
    return PendingIntent.getActivity(
      ctx, 0, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )
  }

  private fun openApp(ctx: Context): PendingIntent = PendingIntent.getActivity(
    ctx, 1, Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
    PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
  )

  /** A tile tap: into the running web view, else (and for the mix) it opens the app with the action. */
  fun tileTap(service: TileService, action: String) {
    if (webAlive && action != "mix") {
      run(action)
      return
    }
    val intent = Intent(service, MainActivity::class.java)
      .putExtra(EXTRA_ACTION, action)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      service.startActivityAndCollapse(
        PendingIntent.getActivity(
          service, 2, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        ),
      )
    } else {
      @Suppress("DEPRECATION")
      service.startActivityAndCollapse(intent)
    }
  }

  // ── Helpers

  private fun JSONObject.text(key: String): String? = optString(key, "").takeIf { it.isNotEmpty() }

  private fun JSONObject?.label(key: String): String =
    this?.optJSONObject("labels")?.optString(key, "") ?: ""

  /** The app theme's accent (`#rrggbb`), else the default theme's lilac. */
  private fun accent(s: JSONObject?): Int =
    s?.text("accent")?.let { runCatching { Color.parseColor(it) }.getOrNull() } ?: DEFAULT_ACCENT

  private fun px(ctx: Context, dp: Int): Int = (dp * ctx.resources.displayMetrics.density).toInt()

  private val bitmaps = LruCache<String, Bitmap>(32)

  /** The cover as a square of `size` px with rounded corners, read from disk once. */
  private fun bitmap(path: String?, size: Int, radius: Float): Bitmap? {
    val file = path?.removePrefix("file://")?.takeIf { it.isNotEmpty() } ?: return null
    val key = "$file@$size@$radius"
    bitmaps.get(key)?.let { return it }
    if (!File(file).exists()) return null
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(file, bounds)
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= size && bounds.outHeight / (sample * 2) >= size) sample *= 2
    val raw = BitmapFactory.decodeFile(file, BitmapFactory.Options().apply { inSampleSize = sample }) ?: return null
    val out = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
    val scale = size.toFloat() / minOf(raw.width, raw.height)
    val shader = BitmapShader(raw, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP).apply {
      setLocalMatrix(
        Matrix().apply {
          setScale(scale, scale)
          postTranslate((size - raw.width * scale) / 2f, (size - raw.height * scale) / 2f)
        },
      )
    }
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { this.shader = shader }
    Canvas(out).drawRoundRect(RectF(0f, 0f, size.toFloat(), size.toFloat()), radius, radius, paint)
    raw.recycle()
    bitmaps.put(key, out)
    return out
  }
}
