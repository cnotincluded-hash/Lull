package com.caffeinenotincluded.lull;

/**
 * Private tabs. Runs in its own process (":private") with its own WebView data folder
 * (suffix "private", Android 9+), so cookies, site storage and cache are kept apart from normal
 * tabs and deleted when the private window is closed or next opened. Nothing is saved to Lull's state.
 */
public class PrivateActivity extends MainActivity {
    @Override
    boolean isPrivate() { return true; }
}
