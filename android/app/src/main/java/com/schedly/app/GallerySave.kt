package com.schedly.app

import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import android.util.Base64
import java.io.File
import java.io.FileOutputStream

@CapacitorPlugin(name = "GallerySave")
class GallerySave : Plugin() {

    @PluginMethod
    fun save(call: PluginCall) {
        val base64 = call.getString("data") ?: return call.reject("Missing data")
        val filename = call.getString("filename") ?: "schedule.png"

        try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.Images.Media.DISPLAY_NAME, filename)
                    put(MediaStore.Images.Media.MIME_TYPE, "image/png")
                    put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Schedly")
                }
                val uri = context.contentResolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, values)
                    ?: return call.reject("Failed to create MediaStore entry")
                context.contentResolver.openOutputStream(uri)?.use { it.write(bytes) }
                    ?: return call.reject("Failed to open output stream")
            } else {
                val dir = File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "Schedly")
                dir.mkdirs()
                val file = File(dir, filename)
                FileOutputStream(file).use { it.write(bytes) }
            }

            val result = JSObject()
            result.put("success", true)
            call.resolve(result)
        } catch (e: Exception) {
            call.reject("Save failed: ${e.message}")
        }
    }
}
