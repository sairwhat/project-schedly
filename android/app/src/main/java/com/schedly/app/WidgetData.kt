package com.schedly.app

import android.content.Context
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

@CapacitorPlugin(name = "WidgetData")
class WidgetData : Plugin() {

    companion object {
        const val FILE_NAME = "widget_schedule.json"
        const val PREFS_NAME = "schedly_widget_prefs"
    }

    private fun widgetFile(): File {
        return File(context.filesDir, FILE_NAME)
    }

    /**
     * Persist the active timetable so the home-screen widget can render it.
     * Expects call.data to contain a "payload" string (already-serialized JSON).
     * Triggers a widget refresh afterwards.
     */
    @PluginMethod
    fun saveSchedule(call: PluginCall) {
        try {
            val payload = call.getString("payload") ?: "{}"
            FileOutputStream(widgetFile()).use { it.write(payload.toByteArray(Charsets.UTF_8)) }
            requestWidgetUpdate()
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            call.reject("Failed to save widget data: ${e.message}")
        }
    }

    @PluginMethod
    fun clearSchedule(call: PluginCall) {
        try {
            val f = widgetFile()
            if (f.exists()) f.delete()
            requestWidgetUpdate()
            call.resolve(JSObject().apply { put("success", true) })
        } catch (e: Exception) {
            call.reject("Failed to clear widget data: ${e.message}")
        }
    }

    @PluginMethod
    fun getSchedule(call: PluginCall) {
        try {
            val f = widgetFile()
            val content = if (f.exists()) {
                FileInputStream(f).use { it.bufferedReader().readText() }
            } else {
                "{}"
            }
            call.resolve(JSObject().apply { put("payload", content) })
        } catch (e: Exception) {
            call.reject("Failed to read widget data: ${e.message}")
        }
    }

    private fun requestWidgetUpdate() {
        try {
            val intent = android.content.Intent(context, ScheduleWidgetProvider::class.java).apply {
                action = android.appwidget.AppWidgetManager.ACTION_APPWIDGET_UPDATE
            }
            context.sendBroadcast(intent)
            Log.d("WidgetData", "Widget update broadcast sent")
        } catch (e: Exception) {
            Log.e("WidgetData", "requestWidgetUpdate failed: ${e.message}")
        }
    }
}
