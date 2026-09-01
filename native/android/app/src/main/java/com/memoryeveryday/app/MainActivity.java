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
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.view.MotionEvent;
import android.view.View;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.util.HashSet;
import java.util.ArrayList;
import java.util.Set;

public class MainActivity extends Activity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 4102;
    private static final int MICROPHONE_PERMISSION_REQUEST = 4103;
    private static final String PREFERENCES = "memory_everyday_native";
    private static final String PROMPTED_FOR_NOTIFICATIONS = "prompted_for_notifications";
    private WebView webView;
    private View splash;
    private PermissionRequest pendingMicrophonePermissionRequest;
    private SpeechRecognizer voiceRecognizer;
    private MediaRecorder voiceAudioRecorder;
    private File voiceAudioFile;
    private String voiceAudioRequestId = "";
    private boolean voiceAudioRecording;
    private String pendingVoiceRequestId = "";
    private String pendingVoiceLocale = "zh-CN";
    private String voiceRequestId = "";
    private String voiceTranscript = "";
    private String voiceCommittedTranscript = "";
    private String voiceCurrentSegment = "";
    private boolean voiceRecognitionEnded;
    private boolean voiceStopRequested;
    private boolean voiceResultDelivered;
    private int voiceGeneration;
    private final Handler voiceHandler = new Handler(Looper.getMainLooper());
    private Runnable voiceRestartRunnable;
    private boolean pageRevealed;

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
        webView.addJavascriptInterface(new NativeVoice(), "MemoryEveryDayVoice");
        webView.setOnTouchListener((view, event) -> event.getPointerCount() > 1);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                sendNotificationStatus();
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) { request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE}); return; }
                boolean requestsMicrophone = false;
                for (String resource : request.getResources()) if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) requestsMicrophone = true;
                if (!requestsMicrophone) { request.deny(); return; }
                if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else { pendingMicrophonePermissionRequest = request; requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_PERMISSION_REQUEST); }
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
        if (pageRevealed) return;
        pageRevealed = true;
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
        if (requestCode == MICROPHONE_PERMISSION_REQUEST) {
            PermissionRequest request = pendingMicrophonePermissionRequest;
            pendingMicrophonePermissionRequest = null;
            boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
            if (request != null) {
                if (granted) request.grant(new String[]{PermissionRequest.RESOURCE_AUDIO_CAPTURE});
                else request.deny();
            }
            if (!pendingVoiceRequestId.isEmpty()) {
                String requestId = pendingVoiceRequestId;
                String locale = pendingVoiceLocale;
                pendingVoiceRequestId = "";
                if (granted) beginVoiceRecognition(requestId, locale);
                else sendVoiceResult(requestId, "failed", "", "请在手机设置中允许“每日备忘”使用麦克风。");
            }
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

    private void sendVoiceResult(String requestId, String status, String text, String message) {
        if (webView == null) return;
        try {
            String detail = new JSONObject().put("requestId", requestId).put("status", status).put("text", text).put("message", message).toString();
            webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('memoryeveryday-native-voice-assistant',{detail:" + detail + "}));", null));
        } catch (Exception ignored) { }
    }

    private void sendVoiceAudioResult(String requestId, String audioBase64) {
        if (webView == null) return;
        try {
            String detail = new JSONObject()
                .put("requestId", requestId)
                .put("status", "audio-success")
                .put("audioBase64", audioBase64)
                .put("mimeType", "audio/mp4")
                .toString();
            webView.post(() -> webView.evaluateJavascript("window.dispatchEvent(new CustomEvent('memoryeveryday-native-voice-assistant',{detail:" + detail + "}));", null));
        } catch (Exception ignored) { }
    }

    private String recognitionText(Bundle results) {
        if (results == null) return "";
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        return matches == null || matches.isEmpty() ? "" : matches.get(0).trim();
    }

    private void startVoiceRecognition(String requestId, String locale) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            pendingVoiceRequestId = requestId;
            pendingVoiceLocale = locale;
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, MICROPHONE_PERMISSION_REQUEST);
            return;
        }
        beginVoiceRecognition(requestId, locale);
    }

    private void beginVoiceRecognition(String requestId, String locale) {
        if (!SpeechRecognizer.isRecognitionAvailable(this)) {
            startVoiceAudioRecording(requestId);
            return;
        }
        voiceRequestId = requestId;
        voiceTranscript = "";
        voiceCommittedTranscript = "";
        voiceCurrentSegment = "";
        voiceRecognitionEnded = false;
        voiceStopRequested = false;
        voiceResultDelivered = false;
        voiceGeneration += 1;
        cancelVoiceRestart();
        beginVoiceRecognitionCycle(requestId, locale);
    }

    private void startVoiceAudioRecording(String requestId) {
        discardVoiceAudioRecording();
        voiceRequestId = requestId;
        voiceAudioRequestId = requestId;
        try {
            File audioFile = File.createTempFile("voice-", ".m4a", getCacheDir());
            MediaRecorder recorder = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? new MediaRecorder(this) : new MediaRecorder();
            voiceAudioFile = audioFile;
            voiceAudioRecorder = recorder;
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1);
            recorder.setAudioSamplingRate(16_000);
            recorder.setAudioEncodingBitRate(64_000);
            recorder.setMaxDuration(90_000);
            recorder.setMaxFileSize(8L * 1024L * 1024L);
            recorder.setOutputFile(audioFile.getAbsolutePath());
            recorder.setOnInfoListener((ignored, what, extra) -> {
                if ((what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED || what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) && voiceAudioRecording) {
                    runOnUiThread(() -> finishVoiceAudioRecording(requestId));
                }
            });
            recorder.setOnErrorListener((ignored, what, extra) -> runOnUiThread(() -> failVoiceAudioRecording(requestId, "兼容录音启动失败，请重新试一次。")));
            recorder.prepare();
            recorder.start();
            voiceAudioRecording = true;
            sendVoiceResult(requestId, "audio-listening", "", "");
        } catch (Exception error) {
            discardVoiceAudioRecording();
            sendVoiceResult(requestId, "audio-failed", "", "当前手机无法启动录音，请确认麦克风没有被其他应用占用后重试。");
        }
    }

    private void finishVoiceAudioRecording(String requestId) {
        if (!voiceAudioRecording || !requestId.equals(voiceAudioRequestId)) return;
        MediaRecorder recorder = voiceAudioRecorder;
        File audioFile = voiceAudioFile;
        voiceAudioRecording = false;
        voiceAudioRecorder = null;
        voiceAudioFile = null;
        voiceAudioRequestId = "";
        try {
            recorder.stop();
        } catch (RuntimeException error) {
            try { recorder.release(); } catch (Exception ignored) { }
            if (audioFile != null) audioFile.delete();
            sendVoiceResult(requestId, "audio-failed", "", "录音时间太短，请重新点一下并说完整安排。");
            return;
        }
        try { recorder.release(); } catch (Exception ignored) { }
        new Thread(() -> {
            try {
                if (audioFile == null || !audioFile.exists() || audioFile.length() <= 0 || audioFile.length() > 8L * 1024L * 1024L) throw new Exception("invalid audio");
                ByteArrayOutputStream output = new ByteArrayOutputStream((int) audioFile.length());
                try (FileInputStream input = new FileInputStream(audioFile)) {
                    byte[] buffer = new byte[16_384];
                    int count;
                    while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                }
                sendVoiceAudioResult(requestId, Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP));
            } catch (Exception error) {
                sendVoiceResult(requestId, "audio-failed", "", "没有录到清晰的声音，请重新说一次。");
            } finally {
                if (audioFile != null) audioFile.delete();
            }
        }).start();
    }

    private void failVoiceAudioRecording(String requestId, String message) {
        if (!requestId.equals(voiceAudioRequestId)) return;
        discardVoiceAudioRecording();
        sendVoiceResult(requestId, "audio-failed", "", message);
    }

    private void discardVoiceAudioRecording() {
        MediaRecorder recorder = voiceAudioRecorder;
        File audioFile = voiceAudioFile;
        voiceAudioRecording = false;
        voiceAudioRecorder = null;
        voiceAudioFile = null;
        voiceAudioRequestId = "";
        if (recorder != null) {
            try { recorder.reset(); } catch (Exception ignored) { }
            try { recorder.release(); } catch (Exception ignored) { }
        }
        if (audioFile != null) audioFile.delete();
    }

    private String combinedVoiceTranscript() {
        String committed = voiceCommittedTranscript.trim();
        String current = voiceCurrentSegment.trim();
        if (committed.isEmpty()) return current;
        if (current.isEmpty()) return committed;
        return committed + " " + current;
    }

    private void commitVoiceSegment() {
        String segment = voiceCurrentSegment.trim();
        if (segment.isEmpty()) return;
        voiceCommittedTranscript = voiceCommittedTranscript.trim().isEmpty() ? segment : voiceCommittedTranscript.trim() + " " + segment;
        voiceCurrentSegment = "";
        voiceTranscript = voiceCommittedTranscript;
    }

    private void cancelVoiceRestart() {
        if (voiceRestartRunnable != null) voiceHandler.removeCallbacks(voiceRestartRunnable);
        voiceRestartRunnable = null;
    }

    private void scheduleVoiceRestart(String requestId, String locale) {
        if (voiceStopRequested || voiceResultDelivered || !requestId.equals(voiceRequestId)) return;
        cancelVoiceRestart();
        voiceRestartRunnable = () -> {
            voiceRestartRunnable = null;
            if (!voiceStopRequested && !voiceResultDelivered && requestId.equals(voiceRequestId)) beginVoiceRecognitionCycle(requestId, locale);
        };
        voiceHandler.postDelayed(voiceRestartRunnable, 180);
    }

    private void beginVoiceRecognitionCycle(String requestId, String locale) {
        if (voiceStopRequested || voiceResultDelivered || !requestId.equals(voiceRequestId)) return;
        voiceGeneration += 1;
        final int generation = voiceGeneration;
        if (voiceRecognizer != null) {
            voiceRecognizer.cancel();
            voiceRecognizer.destroy();
        }
        voiceRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
        voiceRecognitionEnded = false;
        voiceCurrentSegment = "";
        voiceRecognizer.setRecognitionListener(new RecognitionListener() {
            private boolean active() { return generation == voiceGeneration && requestId.equals(voiceRequestId) && !voiceResultDelivered; }
            @Override public void onReadyForSpeech(Bundle params) { if (active()) sendVoiceResult(requestId, "listening", combinedVoiceTranscript(), ""); }
            @Override public void onBeginningOfSpeech() { }
            @Override public void onRmsChanged(float rmsdB) { }
            @Override public void onBufferReceived(byte[] buffer) { }
            @Override public void onEndOfSpeech() { }
            @Override public void onPartialResults(Bundle partialResults) {
                if (!active()) return;
                String text = recognitionText(partialResults);
                if (!text.isEmpty()) voiceCurrentSegment = text;
                voiceTranscript = combinedVoiceTranscript();
                sendVoiceResult(requestId, "partial", voiceTranscript, "");
            }
            @Override public void onResults(Bundle results) {
                if (!active()) return;
                String text = recognitionText(results);
                if (!text.isEmpty()) voiceCurrentSegment = text;
                commitVoiceSegment();
                voiceRecognitionEnded = true;
                if (voiceStopRequested) completeVoiceRecognition(requestId);
                else scheduleVoiceRestart(requestId, locale);
            }
            @Override public void onError(int error) {
                if (!active()) return;
                voiceRecognitionEnded = true;
                voiceTranscript = combinedVoiceTranscript();
                if (voiceStopRequested) completeVoiceRecognition(requestId);
                else if (error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                    voiceResultDelivered = true;
                    sendVoiceResult(requestId, "failed", voiceTranscript, "请在手机设置中允许“每日备忘”使用麦克风。");
                } else scheduleVoiceRestart(requestId, locale);
            }
            @Override public void onEvent(int eventType, Bundle params) { }
        });
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            .putExtra(RecognizerIntent.EXTRA_LANGUAGE, locale)
            .putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
            .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        voiceRecognizer.startListening(intent);
        sendVoiceResult(requestId, "listening", combinedVoiceTranscript(), "");
    }

    private void stopVoiceRecognition(String requestId) {
        if (voiceAudioRecording && requestId.equals(voiceAudioRequestId)) {
            finishVoiceAudioRecording(requestId);
            return;
        }
        if (!requestId.equals(voiceRequestId) || voiceResultDelivered) return;
        voiceStopRequested = true;
        cancelVoiceRestart();
        if (voiceRecognitionEnded) { completeVoiceRecognition(requestId); return; }
        if (voiceRecognizer != null) voiceRecognizer.stopListening();
        voiceHandler.postDelayed(() -> {
            if (!voiceResultDelivered && requestId.equals(voiceRequestId)) completeVoiceRecognition(requestId);
        }, 900);
    }

    private void completeVoiceRecognition(String requestId) {
        if (voiceResultDelivered || !requestId.equals(voiceRequestId)) return;
        voiceResultDelivered = true;
        cancelVoiceRestart();
        commitVoiceSegment();
        voiceGeneration += 1;
        String text = combinedVoiceTranscript().trim();
        sendVoiceResult(requestId, text.isEmpty() ? "failed" : "success", text, text.isEmpty() ? "没有听到清晰的安排，请重新说一次。" : "");
        if (voiceRecognizer != null) {
            voiceRecognizer.cancel();
            voiceRecognizer.destroy();
            voiceRecognizer = null;
        }
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

    private void scheduleRecurringNotifications(String id, String title, JSONArray occurrences, JSONArray earlyReminders) {
        cancelNotifications(id);
        Set<String> keys = new HashSet<>();
        for (int index = 0; index < occurrences.length(); index++) {
            JSONObject occurrence = occurrences.optJSONObject(index);
            long at = occurrence == null ? 0L : occurrence.optLong("at", 0L);
            if (at <= System.currentTimeMillis()) continue;
            String occurrenceId = id + "-repeat-" + index;
            keys.add(occurrenceId);
            scheduleAlarm(occurrenceId, title, "该去处理这项日程了", at);
            for (int reminderIndex = 0; reminderIndex < earlyReminders.length(); reminderIndex++) {
                int minutes = earlyReminders.optInt(reminderIndex, 0);
                long earlyAt = at - minutes * 60_000L;
                if (minutes > 0 && earlyAt > System.currentTimeMillis()) {
                    String key = occurrenceId + "-early-" + minutes;
                    keys.add(key);
                    scheduleAlarm(key, title, "日程即将开始", earlyAt);
                }
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
                        case "schedule-recurring": scheduleRecurringNotifications(message.optString("id"), message.optString("title"), message.optJSONArray("occurrences") == null ? new JSONArray() : message.optJSONArray("occurrences"), message.optJSONArray("earlyReminders") == null ? new JSONArray() : message.optJSONArray("earlyReminders")); break;
                        case "app-ready": revealPage(); break;
                        default: break;
                    }
                });
            } catch (Exception ignored) { }
        }
    }

    private class NativeVoice {
        @JavascriptInterface
        public void postMessage(String rawMessage) {
            try {
                JSONObject message = new JSONObject(rawMessage);
                String action = message.optString("action");
                String requestId = message.optString("requestId");
                runOnUiThread(() -> {
                    if ("start-live".equals(action)) startVoiceRecognition(requestId, message.optString("locale", "zh-CN"));
                    else if ("stop-live".equals(action)) stopVoiceRecognition(requestId);
                });
            } catch (Exception ignored) { }
        }
    }

    @Override
    protected void onDestroy() {
        discardVoiceAudioRecording();
        if (voiceRecognizer != null) {
            voiceRecognizer.cancel();
            voiceRecognizer.destroy();
            voiceRecognizer = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack(); else super.onBackPressed();
    }
}
