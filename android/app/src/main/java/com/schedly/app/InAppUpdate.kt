package com.schedly.app

import android.app.AlertDialog
import android.content.DialogInterface
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL

@CapacitorPlugin(name = "InAppUpdate")
class InAppUpdate : Plugin() {

    override fun load() {
        super.load()
        val versionUrl = config.getString("versionUrl")
        if (versionUrl != null) {
            checkForUpdateOnStartup(versionUrl)
        }
    }

    private fun checkForUpdateOnStartup(versionUrl: String) {
        Thread {
            try {
                val conn = URL(versionUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.requestMethod = "GET"

                val response = conn.inputStream.bufferedReader().readText()
                conn.disconnect()

                val remoteJson = JSONObject(response)
                val remoteVersionCode = remoteJson.getInt("versionCode")
                val remoteVersionName = remoteJson.getString("versionName")
                val apkUrl = remoteJson.getString("apkUrl")
                val updateMessage = remoteJson.optString("updateMessage", "New version available")

                val pkgInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                val currentVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    pkgInfo.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    pkgInfo.versionCode
                }

                if (remoteVersionCode > currentVersionCode) {
                    val activity = activity
                    if (activity != null) {
                        activity.runOnUiThread {
                            showUpdateDialog(remoteVersionName, updateMessage, apkUrl)
                        }
                    }
                }
            } catch (_: Exception) {
            }
        }.start()
    }

    private fun showUpdateDialog(versionName: String, message: String, apkUrl: String) {
        val activity = activity ?: return
        AlertDialog.Builder(activity)
            .setTitle("Update Available")
            .setMessage("Version $versionName is now available.\n\n$message")
            .setPositiveButton("Update") { _: DialogInterface, _: Int ->
                downloadAndInstallApk(apkUrl)
            }
            .setNegativeButton("Later", null)
            .setCancelable(false)
            .show()
    }

    private fun downloadAndInstallApk(apkUrl: String) {
        Thread {
            try {
                val fileName = "schedly-update.apk"
                val downloadDir = context.cacheDir
                val apkFile = File(downloadDir, fileName)

                val conn = URL(apkUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 30000
                conn.readTimeout = 30000
                conn.connect()

                val inputStream = conn.inputStream
                val outputStream = FileOutputStream(apkFile)
                val buffer = ByteArray(8192)
                var bytesRead: Int
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                }
                outputStream.close()
                inputStream.close()
                conn.disconnect()

                val activity = activity
                if (activity != null) {
                    activity.runOnUiThread {
                        val apkUri: Uri = FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            apkFile
                        )
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(apkUri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        activity.startActivity(intent)
                    }
                }
            } catch (_: Exception) {
            }
        }.start()
    }

    @PluginMethod
    fun checkUpdate(call: PluginCall) {
        val versionUrl = call.getString("versionUrl") ?: return call.reject("Missing versionUrl")
        Thread {
            try {
                val conn = URL(versionUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.requestMethod = "GET"
                val response = conn.inputStream.bufferedReader().readText()
                conn.disconnect()
                val remoteJson = JSONObject(response)
                val remoteVersionCode = remoteJson.getInt("versionCode")
                val remoteVersionName = remoteJson.getString("versionName")
                val apkUrl = remoteJson.getString("apkUrl")
                val updateMessage = remoteJson.optString("updateMessage", "New version available")
                val pkgInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                val currentVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    pkgInfo.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    pkgInfo.versionCode
                }
                val result = JSObject()
                if (remoteVersionCode > currentVersionCode) {
                    result.put("hasUpdate", true)
                    result.put("versionName", remoteVersionName)
                    result.put("versionCode", remoteVersionCode)
                    result.put("apkUrl", apkUrl)
                    result.put("updateMessage", updateMessage)
                } else {
                    result.put("hasUpdate", false)
                }
                call.resolve(result)
            } catch (e: Exception) {
                call.reject("Check update failed: ${e.message}")
            }
        }.start()
    }

    @PluginMethod
    fun downloadAndInstall(call: PluginCall) {
        val apkUrl = call.getString("apkUrl") ?: return call.reject("Missing apkUrl")
        downloadAndInstallApk(apkUrl)
        call.resolve()
    }
}
