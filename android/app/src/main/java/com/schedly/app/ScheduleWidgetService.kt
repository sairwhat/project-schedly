package com.schedly.app

import android.content.Intent
import android.widget.RemoteViews
import android.widget.RemoteViewsService

class ScheduleWidgetService : RemoteViewsService() {
    override fun onGetViewFactory(intent: Intent): RemoteViewsFactory {
        return ScheduleWidgetViewsFactory(this.applicationContext)
    }
}

class ScheduleWidgetViewsFactory(
    private val context: android.content.Context
) : RemoteViewsService.RemoteViewsFactory {

    private var classes: List<ScheduleWidgetProvider.WidgetClass> = emptyList()

    override fun onCreate() {
        loadData()
    }

    override fun onDataSetChanged() {
        loadData()
    }

    private fun loadData() {
        classes = ScheduleWidgetProvider.getClasses(context)
    }

    override fun onDestroy() {
        classes = emptyList()
    }

    override fun getCount(): Int = classes.size

    override fun getViewAt(position: Int): RemoteViews {
        val item = classes.getOrNull(position) ?: return RemoteViews(context.packageName, R.layout.widget_class_item)
        val rv = RemoteViews(context.packageName, R.layout.widget_class_item)

        val label = item.shortName.takeIf { it.isNotBlank() }
            ?: item.code.takeIf { it.isNotBlank() }
            ?: item.subject

        rv.setTextViewText(R.id.item_label, label)
        rv.setTextViewText(R.id.item_time, "${formatTime(item.startTime)} – ${formatTime(item.endTime)}")

        val days = item.days.joinToString("") { it.take(2).replaceFirstChar(Char::uppercase) }
        val meta = buildList {
            if (days.isNotBlank()) add(days)
            if (item.room.isNotBlank()) add(item.room)
        }.joinToString(" · ")
        rv.setTextViewText(R.id.item_meta, meta)

        // Color accent strip + tinted text.
        rv.setInt(R.id.item_accent, "setBackgroundColor", parseColor(item.color))
        rv.setInt(R.id.item_label, "setTextColor", parseColor(item.color))

        // Tap opens the app.
        val pi = android.app.PendingIntent.getActivity(
            context,
            position,
            context.packageManager.getLaunchIntentForPackage(context.packageName),
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )
        rv.setOnClickPendingIntent(R.id.item_root, pi)

        return rv
    }

    override fun getLoadingView(): RemoteViews? = null
    override fun getViewTypeCount(): Int = 1
    override fun getItemId(position: Int): Long = position.toLong()
    override fun hasStableIds(): Boolean = true

    private fun parseColor(hex: String): Int {
        return try {
            android.graphics.Color.parseColor(hex)
        } catch (e: Exception) {
            android.graphics.Color.parseColor("#3b82f6")
        }
    }

    private fun formatTime(iso: String): String {
        return try {
            val t = iso.trim()
            // Accept "HH:mm:ss" or "HH:mm"
            val parts = t.split(":")
            val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
            val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
            val ampm = if (h < 12) "AM" else "PM"
            val h12 = if (h % 12 == 0) 12 else h % 12
            "${h12}:${"%02d".format(m)} $ampm"
        } catch (e: Exception) {
            iso
        }
    }
}
