package com.caffeinenotincluded.lull;

import android.webkit.JavascriptInterface;

/** Called from the interface page (assets/ui). Every call that touches views runs on the main thread. */
class Bridge {
    final MainActivity a;
    Bridge(MainActivity a) { this.a = a; }

    void ui(Runnable r) { a.runOnUiThread(r); }

    @JavascriptInterface public String load() { return a.prefs.getString("state", ""); }
    @JavascriptInterface public void save(String json) { if (!a.isPrivate()) a.prefs.edit().putString("state", json).apply(); }
    @JavascriptInterface public boolean isPrivate() { return a.isPrivate(); }
    @JavascriptInterface public void openPrivate() { ui(new Runnable() { public void run() { a.openPrivate(); } }); }
    @JavascriptInterface public void closePrivate() { ui(new Runnable() { public void run() { a.closePrivate(); } }); }
    @JavascriptInterface public boolean night() { return a.isNight(); }
    @JavascriptInterface public String version() { return "1.3.1"; }

    @JavascriptInterface public void ready() { ui(new Runnable() { public void run() { a.onUiReady(); } }); }

    @JavascriptInterface public void show(final String id, final String url) {
        ui(new Runnable() { public void run() { a.showTab(id, url); } });
    }
    @JavascriptInterface public void open(final String id, final String url) {
        ui(new Runnable() { public void run() { a.openInTab(id, url); } });
    }
    @JavascriptInterface public void close(final String id) {
        ui(new Runnable() { public void run() { a.closeTab(id); } });
    }
    @JavascriptInterface public void nav(final String id, final String what) {
        ui(new Runnable() { public void run() { a.nav(id, what); } });
    }
    @JavascriptInterface public void mode(final boolean full, final float bar, final float inset) {
        ui(new Runnable() { public void run() { a.setMode(full, bar, inset); } });
    }
    @JavascriptInterface public void watchScroll(boolean on) { a.watchScroll = on; }
    @JavascriptInterface public void blocking(final String json) {
        ui(new Runnable() { public void run() { a.setBlocking(json); } });
    }
    @JavascriptInterface public void glance(final String url, final float x, final float y, final float w, final float h) {
        ui(new Runnable() { public void run() { a.openGlance(url, x, y, w, h); } });
    }
    @JavascriptInterface public void glanceClose() {
        ui(new Runnable() { public void run() { a.closeGlance(); } });
    }
    @JavascriptInterface public String glanceUrl() { return a.glanceUrl(); }
    @JavascriptInterface public void share(final String url, final String title) {
        ui(new Runnable() { public void run() { a.share(url, title); } });
    }
    @JavascriptInterface public void copy(final String text) {
        ui(new Runnable() { public void run() { a.copy(text); } });
    }
    @JavascriptInterface public void toast(String m) { a.toast(m); }
    @JavascriptInterface public void bars(final String color, final boolean light) {
        ui(new Runnable() { public void run() { a.setBars(color, light); } });
    }
    @JavascriptInterface public void reader(final String id) {
        ui(new Runnable() { public void run() { a.reader(id); } });
    }
    @JavascriptInterface public void readerSize(final String id, final int size) {
        ui(new Runnable() { public void run() { a.readerSize(id, size); } });
    }
    @JavascriptInterface public void clearData() {
        ui(new Runnable() { public void run() { a.clearData(); } });
    }
    @JavascriptInterface public void keyboard() {
        ui(new Runnable() { public void run() {
            a.ui.requestFocus();
            android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) a.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
            if (imm != null) imm.showSoftInput(a.ui, android.view.inputmethod.InputMethodManager.SHOW_IMPLICIT);
        } });
    }
    @JavascriptInterface public void exit() {
        ui(new Runnable() { public void run() { a.moveTaskToBack(true); } });
    }
}
