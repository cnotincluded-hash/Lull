package com.caffeinenotincluded.lull;

import java.util.regex.Pattern;

/** Plain-Java helpers for YouTube ad blocking (no Android classes, so they can be tested on a desktop JVM). */
final class YouTube {
    private YouTube() { }

    static boolean isHost(String h) {
        if (h == null) return false;
        h = h.toLowerCase();
        return h.equals("youtube.com") || h.endsWith(".youtube.com") || h.equals("youtube-nocookie.com") || h.endsWith(".youtube-nocookie.com");
    }

    /** Ad requests made by YouTube pages and players. */
    private static final Pattern AD_URL = Pattern.compile(
            "/pagead/|/api/stats/ads|/get_midroll_|/youtubei/v1/player/ad_break|doubleclick\\.net|googlesyndication\\.com|googleadservices\\.com|/pcs/activeview|[?&]adformat=");

    static boolean isAdUrl(String url) {
        return url != null && AD_URL.matcher(url).find();
    }

    /** Pages whose HTML Lull rewrites: watch pages, the home and feed pages, shorts, embeds. */
    static boolean wantsDocument(String path, boolean mainFrame) {
        if (path == null) path = "/";
        if (path.startsWith("/embed/")) return true;
        if (!mainFrame) return false;
        return !(path.startsWith("/api/") || path.startsWith("/youtubei/") || path.startsWith("/s/") || path.endsWith(".js")
                || path.endsWith(".css") || path.startsWith("/sw.js") || path.startsWith("/generate_204"));
    }

    /** Renames the ad fields in the inline player data and puts the Lull script at the top of the head. */
    static String rewrite(String html, String script) {
        String out = html.replace("\"adPlacements\"", "\"no_ads\"").replace("\"adSlots\"", "\"no_ads\"").replace("\"playerAds\"", "\"no_ads\"");
        String tag = "<script>" + script.replace("</script", "<\\/script") + "</script>";
        String low = out.length() > 20000 ? out.substring(0, 20000).toLowerCase() : out.toLowerCase();
        int at = -1;
        int head = indexOfTag(low, "<head");
        if (head >= 0) at = low.indexOf('>', head) + 1;
        if (at <= 0) {
            int htmlTag = indexOfTag(low, "<html");
            if (htmlTag >= 0) at = low.indexOf('>', htmlTag) + 1;
        }
        if (at <= 0) {
            int doctype = low.indexOf("<!doctype");
            at = doctype >= 0 ? low.indexOf('>', doctype) + 1 : 0;
        }
        return out.substring(0, at) + tag + out.substring(at);
    }

    private static int indexOfTag(String low, String tag) {
        int i = 0;
        while ((i = low.indexOf(tag, i)) >= 0) {
            char c = i + tag.length() < low.length() ? low.charAt(i + tag.length()) : '>';
            if (c == '>' || c == ' ' || c == '\t' || c == '\n' || c == '\r') return i;
            i += tag.length();
        }
        return -1;
    }

    static String charsetOf(String contentType) {
        if (contentType != null) {
            for (String part : contentType.split(";")) {
                String p = part.trim();
                if (p.toLowerCase().startsWith("charset=")) return p.substring(8).replace("\"", "").trim();
            }
        }
        return "UTF-8";
    }
}
