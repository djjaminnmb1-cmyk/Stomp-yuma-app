import { API_BASE } from "@/src/api/client";

/**
 * Song preview lookup — routed through OUR backend proxy at
 * `GET /api/song-preview?song=...&artist=...`.
 *
 * We proxy rather than hitting `https://itunes.apple.com` directly because:
 *   • Some deployed environments block or throttle cross-origin calls
 *     from the mobile browser to itunes.apple.com.
 *   • Users on restrictive corporate / school Wi-Fi networks that block
 *     Apple domains still get a preview via our origin.
 *   • The backend caches lookups, so re-opening the same dance is instant.
 *
 * Results are cached client-side per (song, artist) pair for the JS-runtime
 * lifetime, avoiding a redundant round-trip on repeat opens.
 */
export type SongPreview = {
  previewUrl: string;
  trackName: string;
  artistName: string;
  artworkUrl: string;
  provider: "itunes";
};

const cache = new Map<string, SongPreview | null>();

function key(song: string, artist: string) {
  return `${(song || "").toLowerCase().trim()}|${(artist || "").toLowerCase().trim()}`;
}

export async function fetchSongPreview(
  song?: string | null,
  artist?: string | null
): Promise<SongPreview | null> {
  const s = (song || "").trim();
  const a = (artist || "").trim();
  if (!s) return null;
  const k = key(s, a);
  if (cache.has(k)) return cache.get(k) ?? null;

  const url = `${API_BASE}/song-preview?song=${encodeURIComponent(s)}&artist=${encodeURIComponent(a)}`;
  try {
    const res = await fetch(url);
    if (res.status === 404) {
      cache.set(k, null);
      return null;
    }
    if (!res.ok) {
      // Network / server hiccup — don't cache a negative result so a retry
      // will re-attempt.
      return null;
    }
    const data = (await res.json()) as SongPreview;
    if (!data?.previewUrl) {
      cache.set(k, null);
      return null;
    }
    cache.set(k, data);
    return data;
  } catch {
    return null;
  }
}
