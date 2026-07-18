package com.schedly.app

import android.app.AlertDialog
import android.content.DialogInterface
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
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
        Log.d("InAppUpdate", "load() called")
        val versionUrl = config.getString("versionUrl")
        Log.d("InAppUpdate", "versionUrl from config: $versionUrl")
        if (versionUrl != null) {
            checkForUpdateOnStartup(versionUrl)
        } else {
            Log.e("InAppUpdate", "versionUrl is null — check capacitor.config.ts plugin config")
        }
    }

    private fun checkForUpdateOnStartup(versionUrl: String) {
        Thread {
            try {
                Log.d("InAppUpdate", "Fetching version.json from: $versionUrl")
                val conn = URL(versionUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.requestMethod = "GET"
                val responseCode = conn.responseCode
                Log.d("InAppUpdate", "HTTP response code: $responseCode")

                if (responseCode != 200) {
                    Log.e("InAppUpdate", "Failed to fetch version.json, HTTP $responseCode")
                    return@Thread
                }

                val response = conn.inputStream.bufferedReader().readText()
                conn.disconnect()
                Log.d("InAppUpdate", "version.json response: $response")

                val remoteJson = JSONObject(response)
                val remoteVersionCode = remoteJson.getInt("versionCode")
                val remoteVersionName = remoteJson.getString("versionName")
                val apkUrl = remoteJson.getString("apkUrl")
                val updateMessage = remoteJson.optString("updateMessage", "New version available")
                Log.d("InAppUpdate", "Remote: v$remoteVersionName (code=$remoteVersionCode)")

                val pkgInfo = context.packageManager.getPackageInfo(context.packageName, 0)
                val currentVersionCode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    pkgInfo.longVersionCode.toInt()
                } else {
                    @Suppress("DEPRECATION")
                    pkgInfo.versionCode
                }
                Log.d("InAppUpdate", "Local version code: $currentVersionCode")

                if (remoteVersionCode > currentVersionCode) {
                    Log.d("InAppUpdate", "Update available! Showing dialog...")
                    val activity = activity
                    if (activity != null) {
                        activity.runOnUiThread {
                            showUpdateDialog(remoteVersionName, updateMessage, apkUrl)
                        }
                    } else {
                        Log.e("InAppUpdate", "Activity is null, cannot show dialog")
                    }
                } else {
                    Log.d("InAppUpdate", "No update needed (local=$currentVersionCode >= remote=$remoteVersionCode)")
                }
            } catch (e: Exception) {
                Log.e("InAppUpdate", "Error in checkForUpdateOnStartup: ${e.message}", e)
            }
        }.start()
    }

    private fun showErrorToast(message: String) {
        val activity = activity ?: return
        activity.runOnUiThread {
            android.widget.Toast
                .makeText(activity, message, android.widget.Toast.LENGTH_LONG)
                .show()
        }
    }

    private fun showUpdateDialog(versionName: String, message: String, apkUrl: String) {        val activity = activity ?: return
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

                Log.d("InAppUpdate", "Downloading APK from: $apkUrl")
                val conn = URL(apkUrl).openConnection() as HttpURLConnection
                conn.connectTimeout = 30000
                conn.readTimeout = 30000
                conn.connect()

                val inputStream = conn.inputStream
                val outputStream = FileOutputStream(apkFile)
                val buffer = ByteArray(8192)
                var bytesRead: Int
                var totalBytes = 0
                while (inputStream.read(buffer).also { bytesRead = it } != -1) {
                    outputStream.write(buffer, 0, bytesRead)
                    totalBytes += bytesRead
                }
                outputStream.close()
                inputStream.close()
                conn.disconnect()
                Log.d("InAppUpdate", "Downloaded $totalBytes bytes to ${apkFile.absolutePath}")

                val activity = activity
                if (activity != null) {
                    activity.runOnUiThread {
                        val apkUri: Uri = FileProvider.getUriForFile(
                            context,
                            "${context.packageName}.fileprovider",
                            apkFile
                        )
                        Log.d("InAppUpdate", "Launching installer for URI: $apkUri")
                        val intent = Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(apkUri, "application/vnd.android.package-archive")
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        try {
                            activity.startActivity(intent)
                        } catch (ie: Exception) {
                            Log.e("InAppUpdate", "Failed to launch installer: ${ie.message}", ie)
                            showErrorToast("Could not start installer. Enable 'Install unknown apps' for Schedly.")
                        }
                    }
                } else {
                    Log.e("InAppUpdate", "Activity is null, cannot launch installer")
                }
            } catch (e: Exception) {
                Log.e("InAppUpdate", "Error downloading APK: ${e.message}", e)
                val activity = activity
                if (activity != null) {
                    activity.runOnUiThread {
                        showErrorToast("Download failed: ${e.message ?: "unknown error"}")
                    }
                }
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
