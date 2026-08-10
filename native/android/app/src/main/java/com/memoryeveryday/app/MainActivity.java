package com.memoryeveryday.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.view.MotionEvent;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.HashSet;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4102;
    private static final String PREFERENCES = "memory_everyday_native";
    private static final String PROMPTED_FOR_NOTIFICATIONS = "prompted_for_notifications";
    private WebView webView;
    private View splash;

    @SuppressLint({"SetJavaScriptEnabled", "ClickableViewAccessibility"})
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(244, 249, 255));

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setLoadWithOverviewMode(false);
        settings.setUseWideViewPort(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        webView.setBackgroundColor(Color.TRANSPARENT);
        webView.setAlpha(0f);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.addJavascriptInterface(new NativeNotifications(), "MemoryEveryDayNativeNotifications");
        webView.setOnTouchListener((view, event) -> event.getPointerCount() > 1);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                revealPage();
                sendNotificationStatus();
            }
        });

        splash = new ImageView(this);
        ((ImageView) splash).setImageResource(R.drawable.splash_mark);
        ((ImageView) splash).setScaleType(ImageView.ScaleType.CENTER);
        splash.setBackgroundColor(Color.rgb(244, 249, 255));
        root.addView(webView, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        root.addView(splash, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);

        requestNotificationPermissionIfNeeded();
        loadLatest();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            sendNotificationStatus();
        }
    }

    private void loadLatest() {
        webView.loadUrl("https://memoryeveryday.pages.dev/?native-shell=1&native-platform=android&app-version=" + BuildConfig.VERSION_NAME);
    }

    private void revealPage() {
        webView.animate().alpha(1f).setDuration(160).start();
        if (splash == null || splash.getAlpha() == 0f) return;
        splash.animate().alpha(0f).setDuration(180).withEndAction(() -> splash.setVisibility(View.GONE)).start();
    }

    private SharedPreferences preferences() { return getSharedPreferences(PREFERENCES, MODE_PRIVATE); }

    private boolean notificationsGranted() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
    }

    private String notificationStatus() {
        if (notificationsGranted()) return "granted";
        return preferences().getBoolean(PROMPTED_FOR_NOTIFICATIONS, false) ? "denied" : "default";
    }

    private void requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !notificationsGranted() && !preferences().getBoolean(PROMPTED_FOR_NOTIFICATIONS, false)) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        }
    }

    private void requestNotificationPermission() {
        if (notificationsGranted()) { sendNotificationStatus(); return; }
        if (!preferences().getBoolean(PROMPTED_FOR_NOTIFICATIONS, false)) requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATION_PERMISSION_REQUEST);
        else sendNotificationStatus();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == NOTIFICATION_PERMISSION_REQUEST) {
            preferences().edit().putBoolean(PROMPTED_FOR_NOTIFICATIONS, true).apply();
            sendNotificationStatus();
        }
    }

    private void sendNotificationStatus() {
        if (webView == null) return;
        String status = notificationStatus();
        webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('memoryeveryday-native-notification-status',{detail:{status:'" + status + "'}}));", null));
    }

    private void sendTestNotificationResult(String status, String message) {
        if (webView == null) return;
        try {
            String detail = new JSONObject().put("status", status).put("message", message).toString();
            webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('memoryeveryday-native-notification-test',{detail:" + detail + "}));", null));
        } catch (Exception ignored) { }
    }

    private void scheduleNotification(String id, String title, long at, JSONArray earlyReminders) {
        cancelNotifications(id);
        if (at <= System.currentTimeMillis()) return;
        Set<String> keys = new HashSet<>();
        keys.add(id);
        scheduleAlarm(id, title, "该去处理这项日程了", at);
        for (int index = 0; index < earlyReminders.length(); index++) {
            int minutes = earlyReminders.optInt(index, 0);
            long earlyAt = at - minutes * 60_000L;
            if (minutes > 0 && earlyAt > System.currentTimeMillis()) {
                String key = id + "-early-" + minutes;
                keys.add(key);
                scheduleAlarm(key, title, "日程即将开始", earlyAt);
            }
        }
        preferences().edit().putStringSet("scheduled_" + id, keys).apply();
    }

    private void scheduleAlarm(String id, String title, String body, long at) {
        Intent intent = new Intent(this, NotificationReceiver.class).putExtra(NotificationReceiver.EXTRA_ID, id).putExtra(NotificationReceiver.EXTRA_TITLE, title).putExtra(NotificationReceiver.EXTRA_BODY, body);
        PendingIntent pendingIntent = PendingIntent.getBroadcast(this, id.hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager alarmManager = (AlarmManager) getSystemService(ALARM_SERVICE);
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pendingIntent);
    }

    private void cancelNotifications(String id) {
        Set<String> keys = preferences().getStringSet("scheduled_" + id, new HashSet<>());
        Set<String> allKeys = new HashSet<>(keys);
        allKeys.add(id);
        AlarmManager alarmManager = (AlarmManager) getSystemService(ALARM_SERVICE);
        for (String key : allKeys) {
            PendingIntent pendingIntent = PendingIntent.getBroadcast(this, key.hashCode(), new Intent(this, NotificationReceiver.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            alarmManager.cancel(pendingIntent);
            pendingIntent.cancel();
        }
        preferences().edit().remove("scheduled_" + id).apply();
    }

    private void sendTestNotification() {
        if (!notificationsGranted()) { sendTestNotificationResult("failed", "系统没有允许通知，请到手机设置中开启通知。"); return; }
        NotificationReceiver.showNotification(this, "memoryeveryday-test", "每日备忘", "测试成功：App 可以显示日程提醒。");
        sendTestNotificationResult("presented", "测试成功：系统通知已经显示。");
    }

    private void openNotificationSettings() {
        startActivity(new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName()));
    }

    private class NativeNotifications {
        @JavascriptInterface
        public void postMessage(String rawMessage) {
            try {
                JSONObject message = new JSONObject(rawMessage);
                String action = message.optString("action");
                runOnUiThread(() -> {
                    switch (action) {
                        case "request": requestNotificationPermission(); break;
                        case "status": sendNotificationStatus(); break;
                        case "open-settings": openNotificationSettings(); break;
                        case "test": sendTestNotification(); break;
                        case "cancel": cancelNotifications(message.optString("id")); break;
                        case "schedule": scheduleNotification(message.optString("id"), message.optString("title"), message.optLong("at"), message.optJSONArray("earlyReminders") == null ? new JSONArray() : message.optJSONArray("earlyReminders")); break;
                        default: break;
                    }
                });
            } catch (Exception ignored) { }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
