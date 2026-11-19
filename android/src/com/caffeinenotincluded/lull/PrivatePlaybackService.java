package com.caffeinenotincluded.lull;

/** Playback service for the private window, in its process (":private"). */
public class PrivatePlaybackService extends PlaybackService {
    @Override
    Class<?> activityClass() { return PrivateActivity.class; }
}
