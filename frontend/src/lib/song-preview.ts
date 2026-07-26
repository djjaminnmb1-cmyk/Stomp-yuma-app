/**
 * iTunes Search API helper.
 *
 * Returns the 30-second `.m4a` preview URL for a song, plus track/artist
 * metadata and cover art. Free, public, no auth required — see
 * https://performance-partners.apple.com/search-api
 *
 * We match by combining `song + artist` in the search term (safer than
 * relying on artist filtering, which iTunes doesn't natively support in
 * `search`). If nothing matches, we fall back to song-only.
 *
 * Results are cached per (song, artist) pair for the lifetime of the JS
 * runtime so re-opening Practice Mode is instant.
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

async function fetchITunes(term: string): Promise<SongPreview | null> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&limit=5&term=${encodeURIComponent(
    term
  )}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const list: any[] = data?.results ?? [];
    // Prefer the first result that has a preview URL.
    for (const r of list) {
      if (r?.previewUrl) {
        return {
          previewUrl: r.previewUrl as string,
          trackName: r.trackName || "",
          artistName: r.artistName || "",
          artworkUrl: (r.artworkUrl100 || r.artworkUrl60 || "") as string,
          provider: "itunes",
        };
      }
    }
    return null;
  } catch {
    return null;
  }
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

  // Try song + artist first, then just the song title as a fallback.
  const primary = a ? `${s} ${a}` : s;
  let hit = await fetchITunes(primary);
  if (!hit && a) hit = await fetchITunes(s);

  cache.set(k, hit);
  return hit;
}
