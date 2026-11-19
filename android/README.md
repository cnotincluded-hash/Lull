# Lull for Android (WebView)

A quiet browser by Caffeine Not Included. Package `com.caffeinenotincluded.lull`, Android 8.0+ (minSdk 26), targetSdk 33.

## Build
On Ubuntu/Debian:

    sudo apt-get install dalvik-exchange android-sdk-platform-23 aapt apksigner zipalign openjdk-17-jdk
    LULL_KS_PASS=yourpassword ./build.sh

Produces `Lull-<version>.apk`, signed with `keys/lull.keystore` (alias `lull`). The keystore is not in this repo; keep your own copy safe.
Keep that keystore: every update must be signed with it and have a higher `versionCode` in
AndroidManifest.xml, or Android won't install it over the old version.

## Layout
- `src/.../MainActivity.java` - one activity. Page WebViews (one per tab, at most 8 kept alive),
  the interface layer on top, the Glance preview view, full-screen video.
- `src/.../Bridge.java` - `LullNative`, the calls the interface makes.
- `src/.../Blocker.java` - blocks requests to hosts in `assets/blocklist.txt`.
- `assets/ui/index.html` - the whole interface: bar, tabs and spaces, sheets, New Tab page,
  How to use page. Open it in a desktop browser to test; a stand-in bridge logs calls to `window.__calls`.
- `assets/yt.js` - YouTube ad blocking (removes ad data from the player and feed, hides ad slots, skips ads that still play). `YouTube.java` puts it at the top of YouTube pages.
- `assets/inject.js` - hides cookie banners. `assets/reader.js` + `assets/readability.js` - reader view.

## Credits
Blocklist: StevenBlack/hosts unified list (MIT). YouTube rules follow uBlock Origin's approach (uAssets). Reader view: Mozilla Readability (Apache 2.0).
Interface font: Onest (OFL), from Fontsource.
