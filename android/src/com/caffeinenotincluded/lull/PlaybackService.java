package com.caffeinenotincluded.lull;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.wifi.WifiManager;
import android.os.IBinder;
import android.os.PowerManager;

import java.lang.ref.WeakReference;

/**
 * Keeps Lull running while a page plays audio with the app in the background or the screen off.
 * Shows a media notification (play/pause, stop) and lock-screen controls through a MediaSession.
 */
public class PlaybackService extends Service {
    static final String CHANNEL = "playback";
    static final int ID = 7;
    static final int FLAG_IMMUTABLE = 0x04000000;

    static volatile PlaybackService instance;
    static WeakReference<MainActivity> activity = new WeakReference<MainActivity>(null);
    static String title = "Lull", sub = "";
    static boolean playing = true;

    MediaSession session;
    PowerManager.WakeLock wake;
    WifiManager.WifiLock wifi;

    static void act(String what) {
        MainActivity a = activity.get();
        if (a != null) a.mediaAction(what);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        try {
            Class<?> ch = Class.forName("android.app.NotificationChannel");
            Object c = ch.getConstructor(String.class, CharSequence.class, int.class).newInstance(CHANNEL, "Playing audio", 2);
            ch.getMethod("setShowBadge", boolean.class).invoke(c, false);
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            NotificationManager.class.getMethod("createNotificationChannel", ch).invoke(nm, c);
        } catch (Exception e) { }
        session = new MediaSession(this, "Lull");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { act("play"); }
            @Override public void onPause() { act("pause"); }
            @Override public void onStop() { act("pause"); stopSelf(); }
        });
        session.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setActive(true);
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "lull:playback");
            wake.acquire(4 * 60 * 60 * 1000L);
            WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null) { wifi = wm.createWifiLock(WifiManager.WIFI_MODE_FULL_HIGH_PERF, "lull:playback"); wifi.acquire(); }
        } catch (Exception e) { }
    }

    @Override
    public int onStartCommand(Intent i, int flags, int startId) {
        String a = i == null ? null : i.getAction();
        if ("toggle".equals(a)) act(playing ? "pause" : "play");
        else if ("stop".equals(a)) { act("pause"); stopSelf(); return START_NOT_STICKY; }
        update();
        return START_NOT_STICKY;
    }

    Class<?> activityClass() { return MainActivity.class; }

    void update() {
        try {
            session.setMetadata(new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE, title)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, sub).build());
            session.setPlaybackState(new PlaybackState.Builder()
                    .setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_STOP)
                    .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build());
            Notification.Builder b;
            try {
                b = (Notification.Builder) Notification.Builder.class.getConstructor(Context.class, String.class).newInstance(this, CHANNEL);
            } catch (Exception e) {
                b = new Notification.Builder(this);
            }
            int icon = getResources().getIdentifier("ic_stat", "drawable", getPackageName());
            Intent open = new Intent(this, activityClass());
            open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            PendingIntent openPi = PendingIntent.getActivity(this, 0, open, FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            PendingIntent toggle = PendingIntent.getService(this, 1, new Intent(this, getClass()).setAction("toggle"), FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            PendingIntent stop = PendingIntent.getService(this, 2, new Intent(this, getClass()).setAction("stop"), FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
            b.setSmallIcon(icon != 0 ? icon : android.R.drawable.ic_media_play)
                    .setContentTitle(title)
                    .setContentText(sub)
                    .setContentIntent(openPi)
                    .setOngoing(playing)
                    .setShowWhen(false)
                    .setVisibility(Notification.VISIBILITY_PUBLIC)
                    .setCategory(Notification.CATEGORY_TRANSPORT)
                    .addAction(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play", toggle)
                    .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop)
                    .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0, 1));
            startForeground(ID, b.build());
        } catch (Exception e) { }
    }

    @Override
    public void onDestroy() {
        instance = null;
        try { session.setActive(false); session.release(); } catch (Exception e) { }
        try { if (wake != null && wake.isHeld()) wake.release(); } catch (Exception e) { }
        try { if (wifi != null && wifi.isHeld()) wifi.release(); } catch (Exception e) { }
        stopForeground(true);
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent i) { return null; }
}
