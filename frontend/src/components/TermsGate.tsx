/**
 * TermsGate
 * ---------
 * Root-level check that runs whenever we have a signed-in user.
 * If their `accepted_terms_version` is missing or older than the
 * current live version, redirect them to `/terms-accept` so they
 * must actively re-accept before touching any UGC surface.
 *
 * Apple Guideline 1.2 evidence: this component ensures no signed-in
 * user can hit chat / feed / reporting flows without an on-record
 * active acceptance of the current Terms.
 */
import { useEffect } from "react";
import { usePathname, useRouter } from "expo-router";
import { useAuth } from "@/src/context/auth-context";
import { TERMS_VERSION } from "@/src/lib/terms";

// Screens the user is ALLOWED on before accepting. Everything else
// bounces to /terms-accept.
const ALLOWED_PATHS = new Set<string>([
  "/terms-accept",
  "/terms",
  "/community-guidelines",
  "/privacy",
  "/safety",
  "/auth",
  "/forgot-password",
  "/reset-password",
]);

export function TermsGate() {
  const { user, token, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (loading || !user || !token) return;
    if (ALLOWED_PATHS.has(pathname)) return;
    const accepted = user.accepted_terms_version || "";
    if (accepted !== TERMS_VERSION) {
      router.replace("/terms-accept");
    }
  }, [user, token, loading, pathname, router]);

  return null;
}
