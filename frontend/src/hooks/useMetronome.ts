import { useEffect, useRef } from "react";

/**
 * useMetronome — drift-corrected tick scheduler.
 *
 * • Uses absolute-time scheduling (via Date.now()) so ticks don't accumulate
 *   error at any BPM and doesn't rely on setInterval (which drifts under JS
 *   thread contention).
 * • Fires an *immediate* tick when `enabled` flips from false → true, so the
 *   user gets audio + visual feedback the moment they press Play.
 * • On a BPM change while already running, we re-anchor smoothly without
 *   emitting an extra off-beat click.
 */
export function useMetronome(opts: {
  bpm: number;
  enabled: boolean;
  onTick: (beatIndex: number) => void;
}) {
  const { bpm, enabled, onTick } = opts;

  // Keep the latest onTick without triggering re-schedule on every render.
  const onTickRef = useRef(onTick);
  onTickRef.current = onTick;

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelledRef = useRef(false);
  // Persist beat counter across BPM changes so it keeps counting from where
  // we left off rather than resetting to zero on every tempo tweak.
  const beatRef = useRef(0);
  const prevEnabledRef = useRef(false);

  useEffect(() => {
    if (!enabled || bpm <= 0) {
      // Full stop — reset counter for a clean restart later.
      cancelledRef.current = true;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      beatRef.current = 0;
      prevEnabledRef.current = false;
      return;
    }

    cancelledRef.current = false;
    const interval = 60000 / bpm;
    const anchor = Date.now();
    const startBeat = beatRef.current;
    const isFreshStart = !prevEnabledRef.current;
    prevEnabledRef.current = true;

    if (isFreshStart) {
      // Immediate first tick.
      onTickRef.current(beatRef.current);
      beatRef.current += 1;
    }

    const scheduleNext = () => {
      if (cancelledRef.current) return;
      const nextIndex = beatRef.current - startBeat + (isFreshStart ? 0 : 1);
      const nextTargetTime = anchor + nextIndex * interval;
      const delay = Math.max(0, nextTargetTime - Date.now());
      timeoutRef.current = setTimeout(() => {
        if (cancelledRef.current) return;
        onTickRef.current(beatRef.current);
        beatRef.current += 1;
        scheduleNext();
      }, delay);
    };
    scheduleNext();

    return () => {
      // On BPM change we want to keep counting from beatRef.current.
      // Only clear the timeout; the flag prevEnabledRef stays true so the
      // next re-run doesn't re-emit an immediate tick.
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [bpm, enabled]);
}
