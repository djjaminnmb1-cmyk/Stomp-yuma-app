import type { Dance } from "@/src/api/client";
import { BPM_BANDS, type BpmBand, type SortKey } from "@/src/components/DanceFilterModal";

const DIFFICULTY_ORDER: Record<string, number> = {
  "absolute beginner": 0,
  beginner: 1,
  improver: 2,
  "high improver": 3,
  intermediate: 4,
  advanced: 5,
};

/**
 * Client-side filter + sort for the dance library.
 * Kept in one place so the library screen stays presentational.
 */
export type MatchScope = "all" | "main" | "co";

export function filterAndSortDances(
  all: Dance[],
  {
    q,
    diff,
    bpmBand,
    chor,
    sortBy,
    matchScope = "all",
  }: {
    q: string;
    diff: string;
    bpmBand: BpmBand;
    chor: string | null;
    sortBy: SortKey;
    /**
     * Where the ``q`` string is matched.
     * - ``"all"`` (default): name, song, artist, main choreographer AND
     *   every entry in ``co_choreographers``. Mirrors the server-side
     *   ``GET /api/dances?q=`` behaviour so a query never falls through
     *   the cracks when the user isn't sure whether their target was
     *   credited as main or a collaborator.
     * - ``"main"``: everything EXCEPT the ``co_choreographers`` array.
     *   Use when the caller wants to narrow to dances where the query
     *   matches the main artist (or the dance title / song / artist).
     * - ``"co"``: matches ONLY inside ``co_choreographers``. Dances
     *   where the query matches the MAIN artist are hidden. Powers the
     *   "Co-choreographer" segmented filter on the library screen so
     *   users can find dances a specific person collaborated on
     *   without also seeing everything they solo-choreographed.
     * Ignored when ``q`` is empty.
     */
    matchScope?: MatchScope;
  }
): Dance[] {
  const query = q.trim().toLowerCase();
  const bpmMatcher =
    BPM_BANDS.find((b) => b.key === bpmBand)?.match ?? (() => true);

  let out = all.filter((d) => {
    // Difficulty
    if (diff !== "All" && (d.difficulty || "").toLowerCase() !== diff.toLowerCase()) {
      return false;
    }
    // Choreographer (case-insensitive exact)
    if (chor && (d.choreographer || "").trim().toLowerCase() !== chor.toLowerCase()) {
      return false;
    }
    // BPM band (only enforced when a specific band is picked and a BPM exists;
    // dances with a null/0 BPM are shown in "Any" only so they don't
    // silently disappear when a user picks a tempo).
    if (bpmBand !== "Any") {
      if (!d.bpm) return false;
      if (!bpmMatcher(d.bpm)) return false;
    }
    // Text search — haystack varies by ``matchScope``.
    if (query) {
      const coList = Array.isArray(d.co_choreographers)
        ? d.co_choreographers
        : [];
      let parts: (string | undefined | null)[];
      switch (matchScope) {
        case "main":
          parts = [d.name, d.song, d.artist, d.choreographer];
          break;
        case "co":
          // Co-only: must match on at least one co-choreographer entry.
          // Anything else (name / song / artist / main) doesn't count so
          // the user only sees dances where the person collaborated.
          parts = coList;
          break;
        case "all":
        default:
          parts = [d.name, d.song, d.artist, d.choreographer, ...coList];
          break;
      }
      const hay = parts
        .map((v) => (v || "").toLowerCase())
        .join(" \u241F ");
      if (!hay.includes(query)) return false;
    }
    return true;
  });

  // Sort — always non-mutating.
  const sorted = [...out];
  switch (sortBy) {
    case "name-asc":
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "name-desc":
      sorted.sort((a, b) => b.name.localeCompare(a.name));
      break;
    case "bpm-asc":
      sorted.sort((a, b) => (a.bpm ?? 9999) - (b.bpm ?? 9999));
      break;
    case "bpm-desc":
      sorted.sort((a, b) => (b.bpm ?? -1) - (a.bpm ?? -1));
      break;
    case "difficulty-asc":
      sorted.sort((a, b) => {
        const ai = DIFFICULTY_ORDER[(a.difficulty || "").toLowerCase()] ?? 99;
        const bi = DIFFICULTY_ORDER[(b.difficulty || "").toLowerCase()] ?? 99;
        if (ai !== bi) return ai - bi;
        return a.name.localeCompare(b.name);
      });
      break;
    case "newest":
      sorted.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      break;
  }
  return sorted;
}

/** Returns the number of "secondary" active filters (excludes q + diff since
 * those have inline UI). Used for the badge on the Filters button. */
export function countActiveFilters({
  bpmBand,
  chor,
  sortBy,
}: {
  bpmBand: BpmBand;
  chor: string | null;
  sortBy: SortKey;
}): number {
  let n = 0;
  if (bpmBand !== "Any") n++;
  if (chor) n++;
  if (sortBy !== "name-asc") n++;
  return n;
}
