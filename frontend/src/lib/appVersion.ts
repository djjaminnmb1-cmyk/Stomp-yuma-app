import Constants from "expo-constants";

/** Marketing version baked into this build (app.config.js ``version``).
 *  Bump it for every store release so the version policy can tell
 *  old builds from new ones. */
export const APP_VERSION: string = Constants.expoConfig?.version ?? "0.0.0";

/** -1 if a < b, 0 if equal, 1 if a > b ("1.2" == "1.2.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** True when ``target`` is set and ``current`` is strictly older. */
export function isOlder(current: string, target?: string | null): boolean {
  return !!target && compareVersions(current, target) < 0;
}
