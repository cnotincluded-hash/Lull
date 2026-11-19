# Lull

A quiet browser by Caffeine Not Included: a sidebar of tabs, spaces and favourites, built-in ad, tracker, YouTube-ad, pop-up and redirect blocking, Glance link previews, focus tools, and media you can pop out.

## Desktop (Windows and Mac): `desktop/`

Electron (Chromium) app.

- **Sidebar:** pinned open, minimised to a column of icons, or hidden until you point at the left edge (`Ctrl/⌘+Shift+S` pin or hide, `Ctrl/⌘+Shift+M` minimise). Drag its edge to resize.
- **Spaces** (Personal, Dev, Reading), **favourites**, drag-to-reorder tabs, **Glance** (Alt/Option-click a link), private windows.
- **Media:** a Now playing card in the sidebar; videos pop out into a floating player when you switch tabs; audio pops out into a mini player window; `Ctrl/⌘+Shift+P`.
- **Blocking:** [Ghostery's adblocker](https://github.com/ghostery/adblocker) with EasyList, EasyPrivacy and uBlock Origin lists (shipped with the app, refreshed every few days), plus Lull's YouTube script, cookie-banner hiding, and pop-up and redirect guards.

### Run it

    cd desktop
    npm install
    npm run preload   # builds preload/page.js from preload/src and assets/yt.js
    npm run engine    # downloads and compiles the block lists into engine/engine.bin
    npm start

### Installers

The **Build desktop installers** workflow builds `Lull-<version>-setup.exe` (Windows x64) and `Lull-<version>-universal.dmg` (Mac, Intel and Apple silicon, macOS 12+) into a draft GitHub release. Run it from the Actions tab, or push a tag like `v1.0.0`. The apps aren't code-signed, so Windows SmartScreen and macOS Gatekeeper warn on first launch (see the release notes for the steps).

### Layout

| Path | What |
|---|---|
| `main/main.js` | App start, single instance, menu and keyboard shortcuts |
| `main/window.js` | A Lull window: the interface view, one view per tab, Glance, pop-up and redirect guards, context menu, permissions, downloads |
| `main/media.js` | Now playing, picture-in-picture, mini player, keeping the computer awake while audio plays |
| `main/blocker.js` | Block list engine: load, refresh, per-site allow list |
| `main/store.js` | Saves state to `lull-state.json` in the user data folder |
| `ui/index.html` | The whole interface (sidebar, command bar, menus, settings, focus, How to use) |
| `ui/mini.html` | Mini player window |
| `preload/` | Bridges for the interface and mini player; `page.js` runs in every page (YouTube script, cookie banners, Glance) |
| `assets/` | `yt.js`, reader view (Mozilla Readability), icon |

## Android: `android/`

WebView app for Android 8.0+. Build it on Ubuntu or Debian with `LULL_KS_PASS=yourpassword ./build.sh` (see `android/README.md`).
The signing keystore is not in this repo and never should be: updates only install over the existing app if they're signed with the same key, so keep your copy safe.
