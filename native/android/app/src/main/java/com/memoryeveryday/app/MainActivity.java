package com.memoryeveryday.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
        webView.setWebViewClient(new WebViewClient());
        setContentView(webView);
        loadLatest();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) loadLatest();
    }

    private void loadLatest() {
        webView.clearCache(true);
        webView.loadUrl("https://memoryeveryday.pages.dev/?native-shell=1&native-platform=android&app-version="
                + BuildConfig.VERSION_NAME + "&reload=" + System.currentTimeMillis());
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
