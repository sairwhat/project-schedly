package com.schedly.app

import com.getcapacitor.BridgeActivity

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: android.os.Bundle?) {
        registerPlugin(GallerySave::class.java)
        super.onCreate(savedInstanceState)
    }
}
