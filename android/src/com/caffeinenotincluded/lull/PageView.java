package com.caffeinenotincluded.lull;

import android.view.View;
import android.webkit.WebView;

/**
 * A tab's WebView. While its page is playing audio, it keeps telling the web engine that it is on
 * screen, even when Lull is in the background or the screen is off. Otherwise the engine pauses
 * any video (YouTube included) as soon as the window is hidden.
 */
class PageView extends WebView {
    final MainActivity act;
    final String id;

    PageView(MainActivity act, String id) {
        super(act);
        this.act = act;
        this.id = id;
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        if (visibility != View.VISIBLE && act.keepPlaying(id)) visibility = View.VISIBLE;
        super.onWindowVisibilityChanged(visibility);
    }
}
