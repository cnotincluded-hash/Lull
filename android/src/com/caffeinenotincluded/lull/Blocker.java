package com.caffeinenotincluded.lull;

import android.content.Context;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.util.HashSet;
import java.util.Set;

/** Blocks requests to ad and tracker hosts (StevenBlack unified hosts list, MIT). */
class Blocker {
    volatile Set<String> hosts = new HashSet<String>();
    volatile boolean loaded = false;
    volatile boolean ads = true, cookies = true, autoplay = true, popups = true, redirects = true, youtube = true;
    volatile Set<String> allow = new HashSet<String>();

    void load(final Context c) {
        new Thread(new Runnable() {
            public void run() {
                HashSet<String> s = new HashSet<String>(120000);
                try {
                    BufferedReader br = new BufferedReader(new InputStreamReader(c.getAssets().open("blocklist.txt"), "UTF-8"), 65536);
                    String l;
                    while ((l = br.readLine()) != null) {
                        l = l.trim();
                        if (l.length() > 0 && l.charAt(0) != '#') s.add(l);
                    }
                    br.close();
                } catch (Exception e) { }
                hosts = s;
                loaded = true;
            }
        }).start();
    }

    static String bare(String h) {
        return h != null && h.startsWith("www.") ? h.substring(4) : h;
    }

    boolean isAllowed(String pageHost) {
        if (pageHost == null || pageHost.length() == 0) return false;
        String h = bare(pageHost);
        Set<String> a = allow;
        while (h != null) {
            if (a.contains(h)) return true;
            int i = h.indexOf('.');
            if (i < 0) return false;
            h = h.substring(i + 1);
            if (h.indexOf('.') < 0) return false;
        }
        return false;
    }

    boolean shouldBlock(String host, String pageHost) {
        if (!ads || !loaded || host == null) return false;
        if (host.equals(pageHost)) return false;
        if (isAllowed(pageHost)) return false;
        return isListed(host);
    }

    /** True if the host or one of its parent domains is on the ad and tracker list. */
    boolean isListed(String host) {
        if (!loaded || host == null || host.length() == 0) return false;
        Set<String> s = hosts;
        String h = host;
        while (true) {
            if (s.contains(h)) return true;
            int i = h.indexOf('.');
            if (i < 0) return false;
            h = h.substring(i + 1);
            if (h.indexOf('.') < 0) return false;
        }
    }
}
