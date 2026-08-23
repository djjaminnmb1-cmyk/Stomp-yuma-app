/**
 * useTapSound
 * -----------
 * Plays a tiny 50ms click on tap. Purpose-built for the reactions bar
 * so dancers get an audible "ping" when they cheer someone on, even
 * when their phone is on silent-vibrate.
 *
 * Uses ``expo-audio``'s ``useAudioPlayer`` — the player is created once
 * per screen and re-triggered via ``seekTo(0)`` + ``play()`` so rapid-
 * fire taps don't create dozens of players (RN's most common audio
 * mistake).
 *
 * Fails silently on web / permission-denied so a missing audio channel
 * never breaks the interaction.
 */
import { useCallback, useEffect } from "react";
import { Platform } from "react-native";
import { setAudioModeAsync, useAudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";

// Small bundled WAV — 900→650Hz descending click, ~50ms, 4.3KB.
const TAP_SOURCE = require("../../assets/sounds/reaction-tap.wav");

export function useTapSound() {
  const player = useAudioPlayer(TAP_SOURCE);

  // On mount, tell iOS we want playback to mix with other audio (so
  // background music from Practice Mode isn't ducked by a click) and
  // ignore the silent switch.
  useEffect(() => {
    setAudioModeAsync({
      allowsRecording: false,
      playsInSilentMode: true,
      interruptionMode: "mixWithOthers",
      interruptionModeAndroid: "duckOthers",
      shouldPlayInBackground: false,
    }).catch(() => {});
  }, []);

  return useCallback(() => {
    try {
      // Rewind + fire. seekTo is a no-op if the file is already at 0.
      player.seekTo(0);
      player.play();
    } catch {
      // Never let a tap sound blow up the UI thread.
    }
    if (Platform.OS !== "web") {
      Haptics.selectionAsync().catch(() => {});
    }
  }, [player]);
}
