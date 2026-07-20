package com.schedly.app

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.widget.RemoteViews
import org.json.JSONArray
import org.json.JSONObject

class ScheduleWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetIds: IntArray
    ) {
        for (appWidgetId in appWidgetIds) {
            updateAppWidget(context, appWidgetManager, appWidgetId)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        super.onReceive(context, intent)
        if (intent.action == AppWidgetManager.ACTION_APPWIDGET_UPDATE) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(
                android.content.ComponentName(context, ScheduleWidgetProvider::class.java)
            )
            onUpdate(context, mgr, ids)
        }
    }

    private fun updateAppWidget(
        context: Context,
        appWidgetManager: AppWidgetManager,
        appWidgetId: Int
    ) {
        val views = RemoteViews(context.packageName, R.layout.widget_schedule)

        // Open the app when the header / empty state is tapped.
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            launchIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        views.setOnClickPendingIntent(R.id.widget_header, pendingIntent)
        views.setOnClickPendingIntent(R.id.widget_empty, pendingIntent)

        val intent = Intent(context, ScheduleWidgetService::class.java).apply {
            putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId)
            action = "android.appwidget.action.APPWIDGET_UPDATE"
        }
        views.setRemoteAdapter(R.id.widget_list, intent)
        views.setEmptyView(R.id.widget_list, R.id.widget_empty)

        appWidgetManager.updateAppWidget(appWidgetId, views)
        appWidgetManager.notifyAppWidgetViewDataChanged(appWidgetId, R.id.widget_list)
    }

    companion object {
        fun readSchedule(context: Context): JSONObject {
            return try {
                val file = java.io.File(context.filesDir, WidgetData.FILE_NAME)
                if (!file.exists()) return JSONObject()
                val text = file.readText(Charsets.UTF_8)
                JSONObject(text)
            } catch (e: Exception) {
                JSONObject()
            }
        }

        fun getClasses(context: Context): List<WidgetClass> {
            val root = readSchedule(context)
            val arr = root.optJSONArray("classes") ?: JSONArray()
            val list = mutableListOf<WidgetClass>()
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                list.add(
                    WidgetClass(
                        subject = o.optString("subject", ""),
                        shortName = o.optString("shortName", ""),
                        code = o.optString("code", ""),
                        color = o.optString("color", "#3b82f6"),
                        days = o.optJSONArray("days")?.toStringList() ?: emptyList(),
                        startTime = o.optString("startTime", ""),
                        endTime = o.optString("endTime", ""),
                        room = o.optString("room", ""),
                        section = o.optString("section", "")
                    )
                )
            }
            return list.sortedWith(compareBy({ it.startTime }, { it.subject }))
        }
    }

    data class WidgetClass(
        val subject: String,
        val shortName: String,
        val code: String,
        val color: String,
        val days: List<String>,
        val startTime: String,
        val endTime: String,
        val room: String,
        val section: String
    )
}

fun JSONArray.toStringList(): List<String> {
    val out = mutableListOf<String>()
    for (i in 0 until length()) out.add(optString(i, ""))
    return out
}
