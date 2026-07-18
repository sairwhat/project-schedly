package com.schedly.app

import com.getcapacitor.BridgeActivity
import android.os.Build
import android.Manifest
import android.content.pm.PackageManager
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : BridgeActivity() {
    companion object {
        private const val NOTIF_PERMISSION_CODE = 1001
    }

    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(GallerySave::class.java)
        registerPlugin(InAppUpdate::class.java)
        super.onCreate(savedInstanceState)
        requestNotificationPermission()
    }

    private fun requestNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED
            ) {
                ActivityCompat.requestPermissions(
                    this,
                    arrayOf(Manifest.permission.POST_NOTIFICATIONS),
                    NOTIF_PERMISSION_CODE
                )
            }
        }
    }
}
