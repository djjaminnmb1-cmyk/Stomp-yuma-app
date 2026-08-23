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
export function filterAndSortDances(
  all: Dance[],
  {
    q,
    diff,
    bpmBand,
    chor,
    sortBy,
  }: {
    q: string;
    diff: string;
    bpmBand: BpmBand;
    chor: string | null;
    sortBy: SortKey;
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
    // Text search across name / song / artist / choreographer.
    if (query) {
      const hay = [
        d.name,
        d.song,
        d.artist,
        d.choreographer,
      ]
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
