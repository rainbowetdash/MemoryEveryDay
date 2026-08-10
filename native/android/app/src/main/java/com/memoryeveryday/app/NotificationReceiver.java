package com.memoryeveryday.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class NotificationReceiver extends BroadcastReceiver {
    public static final String EXTRA_ID = "id";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_BODY = "body";
    private static final String CHANNEL_ID = "daily_reminders";

    @Override
    public void onReceive(Context context, Intent intent) {
        showNotification(context, intent.getStringExtra(EXTRA_ID), intent.getStringExtra(EXTRA_TITLE), intent.getStringExtra(EXTRA_BODY));
    }

    public static void showNotification(Context context, String id, String title, String body) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "日程提醒", NotificationManager.IMPORTANCE_HIGH);
            channel.setDescription("每日备忘的日程提醒");
            manager.createNotificationChannel(channel);
        }
        Notification notification = new Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title == null || title.isEmpty() ? "每日备忘" : title)
                .setContentText(body == null || body.isEmpty() ? "你有一项日程需要查看" : body)
                .setAutoCancel(true)
                .build();
        manager.notify(Math.abs((id == null ? "daily-reminder" : id).hashCode()), notification);
    }
}
