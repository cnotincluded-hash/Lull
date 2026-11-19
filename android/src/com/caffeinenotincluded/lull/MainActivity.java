package com.caffeinenotincluded.lull;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.Outline;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.Message;
import android.os.SystemClock;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import java.io.File;
import java.lang.reflect.Method;
import android.util.Base64;
import android.view.Gravity;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.URLUtil;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;

public class MainActivity extends Activity {
    static final String UI_URL = "file:///android_asset/ui/index.html";
    static final int MAX_LIVE_TABS = 8;
    static final int REQ_FILE = 42;

    FrameLayout root, pages, fullBox;
    WebView ui, glance;
    final LinkedHashMap<String, WebView> tabs = new LinkedHashMap<String, WebView>(16, 0.75f, true);
    String current = "";
    float density;
    boolean uiFull = false;
    volatile boolean watchScroll = false;
    boolean uiReady = false;
    String pendingUrl;
    Blocker blocker;
    SharedPreferences prefs;
    String injectJs = "", readerJs = "", ytJs = "", bgJs = "";
    volatile String pageUA = "";
    ValueCallback<Uri[]> fileCb;
    View customView;
    WebChromeClient.CustomViewCallback customCb;
    final Handler main = new Handler(Looper.getMainLooper());
    final HashSet<String> blockedPending = new HashSet<String>();
    final Map<String, PageClient> clients = new java.util.HashMap<String, PageClient>();
    final Map<String, AtomicInteger> blockedCounts = new java.util.concurrent.ConcurrentHashMap<String, AtomicInteger>();

    int px(float css) { return Math.round(css * density); }

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        if (isPrivate()) {
            wipePrivateData();
            if (android.os.Build.VERSION.SDK_INT >= 28) {
                try { WebView.class.getMethod("setDataDirectorySuffix", String.class).invoke(null, "private"); } catch (Exception e) { }
            }
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        } else if (!privateRunning()) {
            wipePrivateData();
        }
        density = getResources().getDisplayMetrics().density;
        prefs = getSharedPreferences("lull", MODE_PRIVATE);
        blocker = new Blocker();
        blocker.load(this);
        injectJs = readAsset("inject.js");
        ytJs = readAsset("yt.js");
        bgJs = readAsset("bg.js");
        PlaybackService.activity = new java.lang.ref.WeakReference<MainActivity>(this);
        main.postDelayed(mediaPoll, 2000);
        readerJs = readAsset("readability.js") + "\n;" + readAsset("reader.js");

        Window w = getWindow();
        w.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);

        root = new FrameLayout(this);
        pages = new FrameLayout(this);
        root.addView(pages, new FrameLayout.LayoutParams(-1, -1));

        ui = new WebView(this);
        ui.setBackgroundColor(Color.TRANSPARENT);
        ui.setOverScrollMode(View.OVER_SCROLL_NEVER);
        ui.setVerticalScrollBarEnabled(false);
        WebSettings s = ui.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setTextZoom(100);
        ui.addJavascriptInterface(new Bridge(this), "LullNative");
        ui.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return !url.startsWith("file:///android_asset/");
            }
        });
        ui.setWebChromeClient(new WebChromeClient());
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(-1, px(76), Gravity.BOTTOM);
        root.addView(ui, lp);

        fullBox = new FrameLayout(this);
        fullBox.setBackgroundColor(Color.BLACK);
        fullBox.setVisibility(View.GONE);
        root.addView(fullBox, new FrameLayout.LayoutParams(-1, -1));

        setContentView(root);
        ui.loadUrl(isPrivate() ? UI_URL + "?private=1" : UI_URL);
        handleIntent(getIntent());
    }

    boolean isPrivate() { return false; }

    boolean privateRunning() {
        try {
            android.app.ActivityManager am = (android.app.ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            for (android.app.ActivityManager.RunningAppProcessInfo p : am.getRunningAppProcesses())
                if (p.processName != null && p.processName.endsWith(":private")) return true;
        } catch (Exception e) { }
        return false;
    }

    /** Deletes the private window's WebView data (cookies, storage, cache), which lives in folders ending in _private. */
    void wipePrivateData() {
        File base = getFilesDir().getParentFile();
        File[] roots = { base, getCacheDir() };
        for (File r : roots) {
            File[] list = r == null ? null : r.listFiles();
            if (list == null) continue;
            for (File f : list) {
                String n = f.getName().toLowerCase();
                if (n.contains("webview") && n.endsWith("_private")) deleteTree(f);
            }
        }
    }

    static void deleteTree(File f) {
        File[] kids = f.listFiles();
        if (kids != null) for (File k : kids) deleteTree(k);
        f.delete();
    }

    void openPrivate() {
        Intent i = new Intent(this, PrivateActivity.class);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(i);
    }

    void closePrivate() {
        if (!isPrivate()) return;
        try {
            CookieManager.getInstance().removeAllCookies(null);
            CookieManager.getInstance().flush();
            WebStorage.getInstance().deleteAllData();
            for (WebView w : tabs.values()) { w.clearCache(true); w.clearHistory(); }
        } catch (Exception e) { }
        finishAndRemoveTask();
        main.postDelayed(new Runnable() { public void run() { android.os.Process.killProcess(android.os.Process.myPid()); } }, 600);
    }

    /* ---------- pop-ups and redirects ---------- */
    static String siteOf(String host) {
        if (host == null) return "";
        String h = host.toLowerCase();
        if (h.startsWith("www.")) h = h.substring(4);
        String[] p = h.split("\\.");
        if (p.length <= 2) return h;
        String two = p[p.length - 2] + "." + p[p.length - 1];
        boolean sld = p[p.length - 1].length() == 2 && (p[p.length - 2].length() <= 3 || "gov ac co com net org edu".contains(p[p.length - 2]));
        return sld ? p[p.length - 3] + "." + two : two;
    }

    static boolean sameSite(String a, String b) { return siteOf(a).equals(siteOf(b)); }

    static Method isRedirectM;
    static boolean isRedirect(WebResourceRequest r) {
        try {
            if (isRedirectM == null) isRedirectM = WebResourceRequest.class.getMethod("isRedirect");
            return (Boolean) isRedirectM.invoke(r);
        } catch (Exception e) { return false; }
    }

    void stopped(String id, String kind, String url) {
        emit(kind, obj("tab", id, "url", url == null ? "" : url));
    }

    void decidePopup(String id, String url, boolean gesture, String anchor, boolean imgAnchor, String pageHost) {
        boolean guard = blocker.popups && !blocker.isAllowed(pageHost);
        if (url == null || url.length() == 0 || url.startsWith("about:") || url.startsWith("javascript:")) {
            if (guard) stopped(id, "popup", "");
            return;
        }
        boolean web = url.startsWith("http://") || url.startsWith("https://");
        boolean allow = !guard;
        if (!allow && web && gesture && !blocker.isListed(hostOf(url))) {
            if (anchor != null && (anchor.equals(url) || hostOf(anchor).equals(hostOf(url)))) allow = true;
            else if (imgAnchor) allow = true;
        }
        if (!allow) { stopped(id, "popup", url); return; }
        if (!web) { WebView w = tabs.get(id); if (w != null) openExternal(w, url); return; }
        emit("newtab", obj("tab", id, "url", url));
    }

    String readAsset(String name) {
        try {
            InputStream in = getAssets().open(name);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            return out.toString("UTF-8");
        } catch (Exception e) {
            return "";
        }
    }

    /* ---------- events to the interface ---------- */
    void emit(final String type, final JSONObject data) {
        Runnable r = new Runnable() {
            public void run() {
                if (ui == null) return;
                ui.evaluateJavascript("window.lullOn&&lullOn(" + JSONObject.quote(type) + "," + data.toString() + ")", null);
            }
        };
        if (Looper.myLooper() == Looper.getMainLooper()) r.run(); else main.post(r);
    }

    JSONObject obj(Object... kv) {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i + 1 < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
        } catch (Exception e) { }
        return o;
    }

    void pageEvent(String id, WebView w, String url, Boolean loading) {
        if (w == null) return;
        String u = url != null ? url : w.getUrl();
        JSONObject o = obj("tab", id, "url", u == null ? "" : u, "title", w.getTitle() == null ? "" : w.getTitle(),
                "canBack", w.canGoBack(), "canFwd", w.canGoForward());
        if (loading != null) { try { o.put("loading", loading.booleanValue()); } catch (Exception e) { } }
        emit("page", o);
    }

    void scheduleBlocked(final String id) {
        synchronized (blockedPending) {
            if (blockedPending.contains(id)) return;
            blockedPending.add(id);
        }
        main.postDelayed(new Runnable() {
            public void run() {
                synchronized (blockedPending) { blockedPending.remove(id); }
                AtomicInteger n = blockedCounts.get(id);
                emit("blocked", obj("tab", id, "n", n == null ? 0 : n.get()));
            }
        }, 450);
    }

    /* ---------- tabs ---------- */
    WebView makeTab(final String id) {
        final WebView w = new PageView(this, id);
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setAllowFileAccess(false);
        s.setSupportMultipleWindows(true);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE);
        String ua = s.getUserAgentString();
        if (ua != null) s.setUserAgentString(ua.replace("; wv)", ")").replace(" Version/4.0", ""));
        pageUA = s.getUserAgentString();
        applyBlockSettings(w);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, false);
        PageClient pc = new PageClient(id);
        clients.put(id, pc);
        w.setWebViewClient(pc);
        w.setWebChromeClient(new PageChrome(id, pc));
        w.setDownloadListener(new DownloadListener() {
            public void onDownloadStart(String url, String userAgent, String cd, String mime, long len) {
                download(url, userAgent, cd, mime);
            }
        });
        w.setOnLongClickListener(new View.OnLongClickListener() {
            public boolean onLongClick(View v) {
                WebView.HitTestResult h = w.getHitTestResult();
                int t = h.getType();
                if (t == WebView.HitTestResult.SRC_ANCHOR_TYPE && h.getExtra() != null) {
                    linkLongPress(id, w, h.getExtra());
                    return true;
                }
                if (t == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE) {
                    Handler hd = new Handler(Looper.getMainLooper(), new Handler.Callback() {
                        public boolean handleMessage(Message m) {
                            String u = m.getData().getString("url");
                            if (u != null && u.length() > 0) linkLongPress(id, w, u);
                            return true;
                        }
                    });
                    w.requestFocusNodeHref(hd.obtainMessage());
                    return true;
                }
                return false;
            }
        });
        w.setOnScrollChangeListener(new View.OnScrollChangeListener() {
            public void onScrollChange(View v, int x, int y, int ox, int oy) {
                if (watchScroll && Math.abs(y - oy) > 4 && !"glance".equals(id)) {
                    watchScroll = false;
                    emit("scroll", obj("tab", id, "dy", y - oy));
                }
            }
        });
        return w;
    }

    void linkLongPress(String id, WebView w, String url) {
        w.performHapticFeedback(HapticFeedbackConstants.LONG_PRESS);
        if ("glance".equals(id)) { w.loadUrl(url); return; }
        emit("glance", obj("tab", id, "url", url));
    }

    void applyBlockSettings(WebView w) {
        WebSettings s = w.getSettings();
        s.setMediaPlaybackRequiresUserGesture(blocker.autoplay);
    }

    void showTab(String id, String url) {
        current = id == null ? "" : id;
        if (current.length() == 0) {
            for (Map.Entry<String, WebView> e : tabs.entrySet()) { WebView w = e.getValue(); if (w.getVisibility() != View.GONE && !keepPlaying(e.getKey())) { w.setVisibility(View.GONE); w.onPause(); } }
            return;
        }
        WebView w = tabs.get(current);
        if (w == null) {
            w = makeTab(current);
            tabs.put(current, w);
            pages.addView(w, new FrameLayout.LayoutParams(-1, -1));
            if (url != null && url.length() > 0) w.loadUrl(url);
            evict();
        }
        for (Map.Entry<String, WebView> e : tabs.entrySet()) {
            WebView x = e.getValue();
            if (e.getKey().equals(current)) {
                if (x.getVisibility() != View.VISIBLE) { x.setVisibility(View.VISIBLE); x.onResume(); }
            } else if (x.getVisibility() != View.GONE && !keepPlaying(e.getKey())) {
                // a tab that is playing stays "on screen" underneath, so its audio isn't cut
                x.setVisibility(View.GONE);
                x.onPause();
            }
        }
        w.bringToFront();
        if (!uiFull) w.requestFocus();
        pageEvent(current, w, null, null);
    }

    void evict() {
        while (tabs.size() > MAX_LIVE_TABS) {
            Iterator<Map.Entry<String, WebView>> it = tabs.entrySet().iterator();
            String victim = null;
            while (it.hasNext()) {
                String k = it.next().getKey();
                if (!k.equals(current)) { victim = k; break; }
            }
            if (victim == null) return;
            closeTab(victim);
        }
    }

    void openInTab(String id, String url) {
        showTab(id, null);
        WebView w = tabs.get(id);
        userNav(id);
        if (w != null) w.loadUrl(url);
    }

    void userNav(String id) {
        PageClient c = clients.get(id);
        if (c != null) c.lastUserNav = SystemClock.uptimeMillis();
    }

    void closeTab(String id) {
        WebView w = tabs.remove(id);
        blockedCounts.remove(id);
        clients.remove(id);
        if (w != null) {
            pages.removeView(w);
            w.stopLoading();
            w.destroy();
        }
        if (id.equals(current)) current = "";
    }

    void nav(String id, String what) {
        WebView w = "glance".equals(id) ? glance : tabs.get(id);
        if (w == null) return;
        userNav(id);
        if ("back".equals(what)) { if (w.canGoBack()) w.goBack(); }
        else if ("forward".equals(what)) { if (w.canGoForward()) w.goForward(); }
        else if ("reload".equals(what)) w.reload();
        else if ("stop".equals(what)) w.stopLoading();
    }

    void setMode(boolean full, float bar, float inset) {
        uiFull = full;
        FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) ui.getLayoutParams();
        int h = full ? FrameLayout.LayoutParams.MATCH_PARENT : Math.max(1, px(bar));
        if (lp.height != h) { lp.height = h; lp.gravity = Gravity.BOTTOM; ui.setLayoutParams(lp); }
        FrameLayout.LayoutParams pl = (FrameLayout.LayoutParams) pages.getLayoutParams();
        int m = px(inset);
        if (pl.bottomMargin != m) { pl.bottomMargin = m; pages.setLayoutParams(pl); }
        if (full) ui.requestFocus();
        else { WebView w = tabs.get(current); if (w != null) w.requestFocus(); }
    }

    /* ---------- glance ---------- */
    void openGlance(String url, float x, float y, float wd, float ht) {
        if (glance == null) {
            glance = makeTab("glance");
            final int r = px(18);
            glance.setOutlineProvider(new ViewOutlineProvider() {
                public void getOutline(View v, Outline o) { o.setRoundRect(0, -r, v.getWidth(), v.getHeight(), r); }
            });
            glance.setClipToOutline(true);
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(px(wd), px(ht));
            lp.gravity = Gravity.TOP | Gravity.LEFT;
            lp.leftMargin = px(x);
            lp.topMargin = px(y);
            root.addView(glance, root.indexOfChild(fullBox), lp);
            glance.loadUrl(url);
        } else {
            FrameLayout.LayoutParams lp = (FrameLayout.LayoutParams) glance.getLayoutParams();
            lp.width = px(wd); lp.height = px(ht); lp.leftMargin = px(x); lp.topMargin = px(y);
            glance.setLayoutParams(lp);
        }
    }

    void closeGlance() {
        if (glance == null) return;
        WebView g = glance;
        glance = null;
        root.removeView(g);
        g.stopLoading();
        g.destroy();
        blockedCounts.remove("glance");
    }

    String glanceUrl() {
        WebView g = glance;
        return g == null ? "" : (g.getUrl() == null ? "" : g.getUrl());
    }

    /* ---------- misc ---------- */
    void download(String url, String ua, String cd, String mime) {
        try {
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                toast("This download can't be saved by Lull yet");
                return;
            }
            DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
            DownloadManager.Request r = new DownloadManager.Request(Uri.parse(url));
            String name = URLUtil.guessFileName(url, cd, mime);
            String cookie = CookieManager.getInstance().getCookie(url);
            if (cookie != null) r.addRequestHeader("Cookie", cookie);
            if (ua != null) r.addRequestHeader("User-Agent", ua);
            if (mime != null) r.setMimeType(mime);
            r.setTitle(name);
            r.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
            r.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name);
            dm.enqueue(r);
            toast("Downloading " + name);
        } catch (Exception e) {
            toast("Couldn't download this file");
        }
    }

    void toast(final String m) {
        main.post(new Runnable() { public void run() { Toast.makeText(MainActivity.this, m, Toast.LENGTH_SHORT).show(); } });
    }

    void setBars(String color, boolean light) {
        try {
            int c = Color.parseColor(color);
            Window w = getWindow();
            w.setStatusBarColor(c);
            w.setNavigationBarColor(c);
            root.setBackgroundColor(c);
            View d = w.getDecorView();
            int f = d.getSystemUiVisibility();
            if (light) f |= 0x2000 | 0x10; else f &= ~(0x2000 | 0x10);
            d.setSystemUiVisibility(f);
        } catch (Exception e) { }
    }

    boolean isNight() {
        return (getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;
    }

    void share(String url, String title) {
        Intent i = new Intent(Intent.ACTION_SEND);
        i.setType("text/plain");
        i.putExtra(Intent.EXTRA_TEXT, url);
        if (title != null) i.putExtra(Intent.EXTRA_SUBJECT, title);
        try { startActivity(Intent.createChooser(i, "Share link")); } catch (Exception e) { }
    }

    void copy(String text) {
        ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
        cm.setPrimaryClip(ClipData.newPlainText("Link", text));
    }

    void clearData() {
        CookieManager.getInstance().removeAllCookies(null);
        CookieManager.getInstance().flush();
        WebStorage.getInstance().deleteAllData();
        for (WebView w : tabs.values()) { w.clearCache(true); w.clearHistory(); }
        if (ui != null) ui.clearCache(true);
    }

    void reader(final String id) {
        final WebView w = tabs.get(id);
        if (w == null) return;
        w.evaluateJavascript(readerJs, new ValueCallback<String>() {
            public void onReceiveValue(String r) {
                String v = r == null ? "none" : r.replace("\"", "");
                emit("reader", obj("tab", id, "result", v));
            }
        });
    }

    void readerSize(String id, int size) {
        WebView w = tabs.get(id);
        if (w != null) w.evaluateJavascript("document.documentElement.style.setProperty('--rs','" + size + "px')", null);
    }

    void setBlocking(String json) {
        try {
            JSONObject o = new JSONObject(json);
            blocker.ads = o.optBoolean("ads", true);
            blocker.cookies = o.optBoolean("cookies", true);
            blocker.autoplay = o.optBoolean("autoplay", true);
            blocker.popups = o.optBoolean("popups", true);
            blocker.redirects = o.optBoolean("redirects", true);
            blocker.youtube = o.optBoolean("youtube", true);
            bgAudio = o.optBoolean("bgaudio", true);
            if (!bgAudio) stopPlayback();
            HashSet<String> a = new HashSet<String>();
            org.json.JSONArray arr = o.optJSONArray("allow");
            if (arr != null) for (int i = 0; i < arr.length(); i++) a.add(arr.optString(i));
            blocker.allow = a;
            for (WebView w : tabs.values()) applyBlockSettings(w);
            if (glance != null) applyBlockSettings(glance);
        } catch (Exception e) { }
    }

    void handleIntent(Intent i) {
        if (i == null) return;
        String url = null;
        if (Intent.ACTION_VIEW.equals(i.getAction()) && i.getData() != null) url = i.getData().toString();
        else if (Intent.ACTION_SEND.equals(i.getAction())) {
            String t = i.getStringExtra(Intent.EXTRA_TEXT);
            if (t != null) {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("https?://\\S+").matcher(t);
                url = m.find() ? m.group() : t.trim();
            }
        }
        if (url == null || url.length() == 0) return;
        if (uiReady) emit("openurl", obj("url", url));
        else pendingUrl = url;
        i.setAction(null);
    }

    void onUiReady() {
        uiReady = true;
        if (pendingUrl != null) { emit("openurl", obj("url", pendingUrl)); pendingUrl = null; }
    }

    @Override
    protected void onNewIntent(Intent i) {
        super.onNewIntent(i);
        setIntent(i);
        handleIntent(i);
    }

    @Override
    public void onBackPressed() {
        if (customView != null) { hideCustom(); return; }
        if (!uiReady) { super.onBackPressed(); return; }
        ui.evaluateJavascript("window.lullBack?lullBack():false", new ValueCallback<String>() {
            public void onReceiveValue(String r) {
                if ("true".equals(r)) return;
                WebView w = tabs.get(current);
                if (w != null && w.canGoBack()) w.goBack();
                else moveTaskToBack(true);
            }
        });
    }

    @Override
    protected void onPause() {
        super.onPause();
        resumed = false;
        pausedAt = SystemClock.uptimeMillis();
        if (bgAudio) pollMedia();
        WebView w = tabs.get(current);
        if (w != null && !keepPlaying(current)) w.onPause();
        CookieManager.getInstance().flush();
        emit("visible", obj("v", false));
    }

    @Override
    protected void onResume() {
        super.onResume();
        resumed = true;
        main.removeCallbacks(mediaPoll);
        main.post(mediaPoll);
        WebView w = tabs.get(current);
        if (w != null && w.getVisibility() == View.VISIBLE) w.onResume();
        emit("visible", obj("v", true));
    }

    @Override
    public void onConfigurationChanged(Configuration c) {
        super.onConfigurationChanged(c);
        emit("night", obj("v", isNight()));
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) {
            fileCb.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(res, data));
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    protected void onDestroy() {
        main.removeCallbacks(mediaPoll);
        stopPlayback();
        for (WebView w : new ArrayList<WebView>(tabs.values())) w.destroy();
        tabs.clear();
        if (glance != null) glance.destroy();
        if (ui != null) ui.destroy();
        super.onDestroy();
    }

    void hideCustom() {
        if (customView == null) return;
        fullBox.removeView(customView);
        fullBox.setVisibility(View.GONE);
        customView = null;
        getWindow().getDecorView().setSystemUiVisibility(0);
        if (customCb != null) customCb.onCustomViewHidden();
        customCb = null;
        emit("night", obj("v", isNight()));
    }

    static String hostOf(String url) {
        try {
            String h = Uri.parse(url).getHost();
            return h == null ? "" : h.toLowerCase();
        } catch (Exception e) { return ""; }
    }

    boolean openExternal(WebView v, String url) {
        try {
            if (url.startsWith("intent:")) {
                Intent i = Intent.parseUri(url, Intent.URI_INTENT_SCHEME);
                i.addCategory(Intent.CATEGORY_BROWSABLE);
                i.setComponent(null);
                i.setSelector(null);
                try { startActivity(i); }
                catch (Exception e) {
                    String fb = i.getStringExtra("browser_fallback_url");
                    if (fb != null && (fb.startsWith("http://") || fb.startsWith("https://"))) v.loadUrl(fb);
                }
                return true;
            }
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addCategory(Intent.CATEGORY_BROWSABLE);
            startActivity(i);
        } catch (Exception e) {
            toast("No app can open this link");
        }
        return true;
    }

    /* ---------- audio in the background ---------- */
    static final String MEDIA_Q = "(function(){var m=document.querySelectorAll('video,audio');for(var i=0;i<m.length;i++){var x=m[i];if(!x.paused&&!x.ended&&!x.muted&&x.volume>0&&x.readyState>1){window.__lullLast=x;return 'P|'+document.title;}}return (window.__lullLast&&!window.__lullLast.ended&&document.contains(window.__lullLast))?'S|'+document.title:'N|';})()";
    boolean bgAudio = true, resumed = false;
    String playingTab = null;
    long lastPlaying = 0, lastSeen = 0, pausedAt = 0;

    boolean keepPlaying(String id) {
        return bgAudio && id != null && id.equals(playingTab) && SystemClock.uptimeMillis() - lastPlaying < 6000;
    }

    final Runnable mediaPoll = new Runnable() {
        public void run() {
            pollMedia();
            if (resumed || PlaybackService.instance != null) main.postDelayed(this, 2000);
        }
    };

    void pollMedia() {
        final long now = SystemClock.uptimeMillis();
        for (final Map.Entry<String, WebView> e : tabs.entrySet()) {
            e.getValue().evaluateJavascript(MEDIA_Q, new ValueCallback<String>() {
                public void onReceiveValue(String r) {
                    if (r == null || r.length() < 3) return;
                    String v = r.replace("\"", "");
                    String id = e.getKey();
                    if (v.startsWith("P|")) {
                        playingTab = id; lastPlaying = SystemClock.uptimeMillis(); lastSeen = lastPlaying;
                        setPlaying(id, v.substring(2), true);
                    } else if (v.startsWith("S|") && id.equals(playingTab)) {
                        lastSeen = SystemClock.uptimeMillis();
                        setPlaying(id, v.substring(2), false);
                    }
                }
            });
        }
        main.postDelayed(new Runnable() { public void run() {
            long t = SystemClock.uptimeMillis();
            for (Map.Entry<String, WebView> e : tabs.entrySet()) {
                WebView x = e.getValue();
                if (!e.getKey().equals(current) && x.getVisibility() == View.VISIBLE && !keepPlaying(e.getKey())) {
                    x.setVisibility(View.GONE);
                    x.onPause();
                }
            }
            if (PlaybackService.instance == null) return;
            boolean idle = t - lastPlaying > (resumed ? 6000 : 10 * 60 * 1000);
            boolean gone = playingTab == null || !tabs.containsKey(playingTab) || t - lastSeen > 6000 && t - lastPlaying > 6000;
            if (idle || (gone && resumed)) stopPlayback();
        } }, 600);
    }

    void setPlaying(String id, String title, boolean on) {
        WebView w = tabs.get(id);
        String host = w == null || w.getUrl() == null ? "" : hostOf(w.getUrl());
        if (host.startsWith("www.")) host = host.substring(4);
        String t = title == null || title.length() == 0 ? host : title;
        boolean changed = !t.equals(PlaybackService.title) || on != PlaybackService.playing || !host.equals(PlaybackService.sub);
        PlaybackService.title = t;
        PlaybackService.sub = isPrivate() ? "Private tab" : host;
        PlaybackService.playing = on;
        PlaybackService svc = PlaybackService.instance;
        if (svc == null) {
            if (on && bgAudio && (resumed || SystemClock.uptimeMillis() - pausedAt < 1500)) {
                try { startService(new Intent(this, isPrivate() ? PrivatePlaybackService.class : PlaybackService.class)); } catch (Exception ex) { }
            }
        } else if (changed) svc.update();
    }

    void stopPlayback() {
        if (PlaybackService.instance != null) {
            try { stopService(new Intent(this, isPrivate() ? PrivatePlaybackService.class : PlaybackService.class)); } catch (Exception e) { }
        }
    }

    void mediaAction(final String what) {
        main.post(new Runnable() { public void run() {
            WebView w = playingTab == null ? null : tabs.get(playingTab);
            if (w == null) return;
            if (!"pause".equals(what)) { w.onResume(); lastPlaying = SystemClock.uptimeMillis(); }
            w.evaluateJavascript("(function(a){var m=window.__lullLast;if(!m||!document.contains(m)){var l=document.querySelectorAll('video,audio');for(var i=0;i<l.length;i++){if(!l[i].paused){m=l[i];break}}m=m||l[0];}if(!m)return;window.__lullLast=m;if(a==='play'||(a==='toggle'&&m.paused))m.play();else m.pause();})('" + what + "')", null);
            PlaybackService.playing = !"pause".equals(what);
            PlaybackService svc = PlaybackService.instance;
            if (svc != null) svc.update();
        } });
    }

    /* ---------- YouTube ---------- */
    boolean ytOn(String host) {
        return blocker.youtube && YouTube.isHost(host) && !blocker.isAllowed(host);
    }

    /** Fetches a YouTube page itself so the ad-cleaning script runs before any of YouTube's own code. */
    WebResourceResponse youTubeDocument(WebResourceRequest r) {
        java.net.HttpURLConnection c = null;
        try {
            String url = r.getUrl().toString();
            c = (java.net.HttpURLConnection) new java.net.URL(url).openConnection();
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(15000);
            c.setReadTimeout(20000);
            boolean hasUA = false;
            Map<String, String> rh = r.getRequestHeaders();
            if (rh != null) for (Map.Entry<String, String> e : rh.entrySet()) {
                String k = e.getKey();
                if (k == null || k.equalsIgnoreCase("Accept-Encoding") || k.equalsIgnoreCase("Cookie")) continue;
                if (k.equalsIgnoreCase("User-Agent")) hasUA = true;
                c.setRequestProperty(k, e.getValue());
            }
            if (!hasUA && pageUA.length() > 0) c.setRequestProperty("User-Agent", pageUA);
            CookieManager cm = CookieManager.getInstance();
            String ck = cm.getCookie(url);
            if (ck != null && ck.length() > 0) c.setRequestProperty("Cookie", ck);
            int code = c.getResponseCode();
            Map<String, java.util.List<String>> hf = c.getHeaderFields();
            for (Map.Entry<String, java.util.List<String>> e : hf.entrySet()) {
                if (e.getKey() != null && e.getKey().equalsIgnoreCase("Set-Cookie"))
                    for (String val : e.getValue()) cm.setCookie(url, val);
            }
            String ct = c.getContentType();
            if (code < 200 || code >= 300 || ct == null || !ct.toLowerCase().contains("text/html")) {
                c.disconnect();
                return null;
            }
            String cs = YouTube.charsetOf(ct);
            InputStream in = c.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream(1 << 18);
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            in.close();
            String html = YouTube.rewrite(out.toString(cs), bgAudio ? bgJs + "\n" + ytJs : ytJs);
            Map<String, String> headers = new java.util.HashMap<String, String>();
            for (Map.Entry<String, java.util.List<String>> e : hf.entrySet()) {
                String k = e.getKey();
                if (k == null) continue;
                String lk = k.toLowerCase();
                if (lk.startsWith("content-security-policy") || lk.equals("content-length") || lk.equals("content-encoding")
                        || lk.equals("set-cookie") || lk.equals("transfer-encoding") || lk.equals("content-type")) continue;
                StringBuilder sb = new StringBuilder();
                for (String val : e.getValue()) { if (sb.length() > 0) sb.append(", "); sb.append(val); }
                headers.put(k, sb.toString());
            }
            String reason = c.getResponseMessage();
            if (reason == null || reason.trim().length() == 0) reason = "OK";
            return new WebResourceResponse("text/html", cs, code, reason, headers, new ByteArrayInputStream(html.getBytes(cs)));
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) { try { c.disconnect(); } catch (Exception e) { } }
        }
    }

    /* ---------- page clients ---------- */
    class PageClient extends WebViewClient {
        final String id;
        volatile String mainHost = "";
        PageClient(String id) { this.id = id; }

        volatile long lastUserNav = 0;

        @Override
        public boolean shouldOverrideUrlLoading(WebView v, String url) {
            return decide(v, url, true, false, true);
        }

        /** Android 7+ calls this one (it isn't in the API 23 jar this is compiled against, so no @Override). */
        public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) {
            return decide(v, r.getUrl().toString(), r.hasGesture(), isRedirect(r), r.isForMainFrame());
        }

        boolean decide(WebView v, String url, boolean gesture, boolean redirect, boolean mainFrame) {
            String l = url.toLowerCase();
            boolean guard = blocker.redirects && !blocker.isAllowed(mainHost);
            if (!(l.startsWith("http://") || l.startsWith("https://"))) {
                if (l.startsWith("about:") || l.startsWith("data:") || l.startsWith("blob:") || l.startsWith("javascript:")) return false;
                if (guard && !gesture) { stopped(id, "redirect", url); return true; }
                return openExternal(v, url);
            }
            if (!mainFrame) return false;
            long now = SystemClock.uptimeMillis();
            String to = hostOf(url);
            if (!guard || mainHost.length() == 0) { lastUserNav = now; return false; }
            if (blocker.isListed(to) && !blocker.isListed(mainHost)) { stopped(id, "redirect", url); return true; }
            if (redirect || sameSite(to, mainHost)) return false;
            if (gesture) {
                int t = v.getHitTestResult().getType();
                if (t == WebView.HitTestResult.SRC_ANCHOR_TYPE || t == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE || t == WebView.HitTestResult.EDIT_TEXT_TYPE) {
                    lastUserNav = now;
                    return false;
                }
                stopped(id, "redirect", url);
                return true;
            }
            if (now - lastUserNav < 2500) { lastUserNav = now; return false; }
            stopped(id, "redirect", url);
            return true;
        }

        @Override
        public void onPageStarted(WebView v, String url, Bitmap fav) {
            mainHost = hostOf(url);
            AtomicInteger n = blockedCounts.get(id);
            if (n == null) blockedCounts.put(id, new AtomicInteger(0)); else n.set(0);
            pageEvent(id, v, url, Boolean.TRUE);
            emit("blocked", obj("tab", id, "n", 0));
        }

        @Override
        public void onPageCommitVisible(WebView v, String url) {
            inject(v);
        }

        @Override
        public void onPageFinished(WebView v, String url) {
            inject(v);
            pageEvent(id, v, url, Boolean.FALSE);
        }

        @Override
        public void doUpdateVisitedHistory(WebView v, String url, boolean reload) {
            pageEvent(id, v, url, null);
        }

        void inject(WebView v) {
            if (blocker.cookies && !blocker.isAllowed(mainHost) && injectJs.length() > 0) v.evaluateJavascript(injectJs, null);
            if (ytOn(mainHost) && ytJs.length() > 0) v.evaluateJavascript(ytJs, null);
            if (bgAudio && bgJs.length() > 0) v.evaluateJavascript(bgJs, null);
        }

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView v, WebResourceRequest r) {
            Uri u = r.getUrl();
            String h = u == null ? null : u.getHost();
            if (h != null && YouTube.isHost(h) && ytOn(h) && "GET".equalsIgnoreCase(r.getMethod())
                    && YouTube.wantsDocument(u.getPath(), r.isForMainFrame())) {
                WebResourceResponse doc = youTubeDocument(r);
                if (doc != null) return doc;
            }
            if (r.isForMainFrame()) return null;
            if (u != null && YouTube.isHost(mainHost) && ytOn(mainHost) && YouTube.isAdUrl(u.toString())) {
                AtomicInteger n = blockedCounts.get(id);
                if (n == null) { n = new AtomicInteger(0); blockedCounts.put(id, n); }
                n.incrementAndGet();
                scheduleBlocked(id);
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }
            if (h != null && blocker.shouldBlock(h.toLowerCase(), mainHost)) {
                AtomicInteger n = blockedCounts.get(id);
                if (n == null) { n = new AtomicInteger(0); blockedCounts.put(id, n); }
                n.incrementAndGet();
                scheduleBlocked(id);
                return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
            }
            return null;
        }
    }

    class PageChrome extends WebChromeClient {
        final String id;
        final PageClient client;
        long dlgStart = 0;
        int dlgCount = 0;
        PageChrome(String id, PageClient client) { this.id = id; this.client = client; }

        @Override
        public boolean onCreateWindow(WebView view, boolean isDialog, final boolean gesture, Message resultMsg) {
            WebView.HitTestResult h = view.getHitTestResult();
            final String anchor = h.getType() == WebView.HitTestResult.SRC_ANCHOR_TYPE ? h.getExtra() : null;
            final boolean imgAnchor = h.getType() == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE;
            final String pageHost = client.mainHost;
            final WebView tmp = new WebView(MainActivity.this);
            tmp.getSettings().setJavaScriptEnabled(false);
            tmp.setWebViewClient(new WebViewClient() {
                boolean done = false;
                void take(String url) {
                    if (done) return;
                    done = true;
                    decidePopup(id, url, gesture, anchor, imgAnchor, pageHost);
                    main.post(new Runnable() { public void run() { tmp.stopLoading(); tmp.destroy(); } });
                }
                @Override
                public boolean shouldOverrideUrlLoading(WebView w, String url) { take(url); return true; }
                public boolean shouldOverrideUrlLoading(WebView w, WebResourceRequest r) { take(r.getUrl().toString()); return true; }
                @Override
                public void onPageStarted(WebView w, String url, Bitmap f) { if (!"about:blank".equals(url)) { w.stopLoading(); take(url); } }
            });
            main.postDelayed(new Runnable() { public void run() { try { tmp.stopLoading(); tmp.destroy(); } catch (Exception e) { } } }, 4000);
            WebView.WebViewTransport tr = (WebView.WebViewTransport) resultMsg.obj;
            tr.setWebView(tmp);
            resultMsg.sendToTarget();
            return true;
        }

        boolean dialogBlocked(WebView v) {
            if (!blocker.popups || blocker.isAllowed(client.mainHost)) return false;
            if (v.getVisibility() != View.VISIBLE || "glance".equals(id)) { stopped(id, "popup", ""); return true; }
            long now = SystemClock.uptimeMillis();
            if (now - dlgStart > 10000) { dlgStart = now; dlgCount = 0; }
            if (++dlgCount > 2) { stopped(id, "popup", ""); return true; }
            return false;
        }

        @Override
        public boolean onJsAlert(WebView v, String url, String msg, JsResult r) {
            if (dialogBlocked(v)) { r.cancel(); return true; }
            return false;
        }

        @Override
        public boolean onJsConfirm(WebView v, String url, String msg, JsResult r) {
            if (dialogBlocked(v)) { r.cancel(); return true; }
            return false;
        }

        @Override
        public boolean onJsPrompt(WebView v, String url, String msg, String def, JsPromptResult r) {
            if (dialogBlocked(v)) { r.cancel(); return true; }
            return false;
        }

        @Override
        public void onProgressChanged(WebView v, int p) {
            emit("progress", obj("tab", id, "p", p));
        }

        @Override
        public void onReceivedTitle(WebView v, String title) {
            pageEvent(id, v, null, null);
        }

        @Override
        public void onReceivedIcon(WebView v, Bitmap icon) {
            try {
                Bitmap b = Bitmap.createScaledBitmap(icon, 64, 64, true);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                b.compress(Bitmap.CompressFormat.PNG, 100, out);
                String data = "data:image/png;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
                emit("icon", obj("tab", id, "host", hostOf(v.getUrl() == null ? "" : v.getUrl()), "data", data));
            } catch (Exception e) { }
        }

        @Override
        public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
            if (fileCb != null) fileCb.onReceiveValue(null);
            fileCb = cb;
            try {
                startActivityForResult(params.createIntent(), REQ_FILE);
            } catch (Exception e) {
                fileCb = null;
                cb.onReceiveValue(null);
                toast("No app can pick files");
            }
            return true;
        }

        @Override
        public void onShowCustomView(View view, CustomViewCallback cb) {
            if (customView != null) { cb.onCustomViewHidden(); return; }
            customView = view;
            customCb = cb;
            fullBox.addView(view, new FrameLayout.LayoutParams(-1, -1));
            fullBox.setVisibility(View.VISIBLE);
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }

        @Override
        public void onHideCustomView() { hideCustom(); }

        @Override
        public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback cb) {
            cb.invoke(origin, false, false);
        }

        @Override
        public void onPermissionRequest(PermissionRequest r) { r.deny(); }
    }
}
