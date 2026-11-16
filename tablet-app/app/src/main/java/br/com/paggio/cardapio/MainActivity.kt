package br.com.paggio.cardapio

import android.Manifest
import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast

const val URL_CARDAPIO = "https://sistemapaggio.lovable.app/mesa"
const val HOST_CARDAPIO = "sistemapaggio.lovable.app"

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var liberado = false

    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        web = WebView(this).apply { layoutParams = ViewGroup.LayoutParams(-1, -1); setBackgroundColor(Color.WHITE) }
        setContentView(web)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            setGeolocationEnabled(true)
            builtInZoomControls = false
            displayZoomControls = false
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(r: PermissionRequest) { runOnUiThread { r.grant(r.resources) } }
            override fun onGeolocationPermissionsShowPrompt(o: String, cb: GeolocationPermissions.Callback) { cb.invoke(o, true, true) }
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest) = r.url.host != HOST_CARDAPIO // links de fora não abrem
            override fun onReceivedError(v: WebView, r: WebResourceRequest, e: WebResourceError) {
                if (r.isForMainFrame) v.postDelayed({ v.loadUrl(URL_CARDAPIO) }, 5000) // sem internet: tenta de novo
            }
        }
        web.addJavascriptInterface(Ponte(), "PaggioKiosk")
        pedirPermissoes()
        web.loadUrl(URL_CARDAPIO)
    }

    private fun pedirPermissoes() {
        val falta = arrayOf(Manifest.permission.CAMERA, Manifest.permission.ACCESS_FINE_LOCATION).filter { checkSelfPermission(it) != PackageManager.PERMISSION_GRANTED }
        if (falta.isNotEmpty()) requestPermissions(falta.toTypedArray(), 1)
    }

    override fun onStart() { super.onStart(); liberado = false }

    override fun onResume() {
        super.onResume()
        escondeBarras()
        trava()
    }

    override fun onWindowFocusChanged(f: Boolean) { super.onWindowFocusChanged(f); if (f) escondeBarras() }

    @Suppress("DEPRECATION")
    private fun escondeBarras() {
        window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_FULLSCREEN or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or View.SYSTEM_UI_FLAG_LAYOUT_STABLE or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
    }

    /** Se o app for "dono do dispositivo" a trava é silenciosa; senão o Android pede para confirmar a fixação. */
    private fun trava() {
        if (liberado) return
        try {
            val dpm = getSystemService(DEVICE_POLICY_SERVICE) as DevicePolicyManager
            val admin = ComponentName(this, Admin::class.java)
            if (dpm.isDeviceOwnerApp(packageName)) {
                dpm.setLockTaskPackages(admin, arrayOf(packageName))
                dpm.setLockTaskFeatures(admin, 0)
            }
            startLockTask()
        } catch (_: Exception) { /* sem permissão: segue sem travar */ }
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { /* o cliente não volta */ }

    inner class Ponte {
        /** Chamado pela página depois que o PIN da equipe foi aceito. */
        @JavascriptInterface
        fun sair() {
            runOnUiThread {
                liberado = true
                try { stopLockTask() } catch (_: Exception) { }
                Toast.makeText(this@MainActivity, "Tablet liberado. Ao voltar ao app ele trava de novo.", Toast.LENGTH_LONG).show()
                startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
        }
        /** Força atualização: limpa o cache do WebView e recarrega o cardápio. */
        @JavascriptInterface
        fun atualizar() {
            runOnUiThread {
                web.clearCache(true)
                web.clearHistory()
                web.loadUrl(URL_CARDAPIO)
            }
        }
        @JavascriptInterface
        fun versao() = "1.1.0"
    }
}
