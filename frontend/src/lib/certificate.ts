/**
 * Certificate download helper.
 *
 * Backend `/api/certificate/{dance_id}` returns a `application/pdf` stream
 * with `Content-Disposition: attachment; filename="..."`. The tricky bit
 * is the fetch has to send the `Authorization: Bearer <token>` header, so
 * we can't just `<a href>` the URL — we have to fetch it as a blob and
 * then hand it to the platform's native download / share affordance:
 *
 * - **Web**: create an object URL, spawn a hidden `<a download>` and click
 *   it, then revoke the URL on the next tick.
 * - **Native (iOS/Android)**: base64-decode into `FileSystem` cache and
 *   hand to `expo-sharing` so the user gets the standard system share
 *   sheet (Save to Files, AirDrop, Messages, etc.).
 *
 * Returns `{ ok: true }` on success, `{ ok: false, message }` otherwise.
 * Never throws — callers can show a toast/alert without a try/catch.
 */
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { API_BASE } from "@/src/api/client";

export type CertResult = { ok: true } | { ok: false; message: string };

/**
 * Convert a filename fragment (dance name) to something safe for the fs.
 * Keeps letters/digits/underscores/dashes; collapses everything else.
 */
function safeFilename(name: string): string {
  const cleaned = (name || "")
    .replace(/[^\w\s-]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 60);
  return `sgy_certificate_${cleaned || "dance"}.pdf`;
}

export async function downloadCertificate(
  dance_id: string,
  dance_name: string,
  token: string,
  theme?: string
): Promise<CertResult> {
  if (!token) return { ok: false, message: "You need to sign in first." };
  if (!dance_id) return { ok: false, message: "Missing dance id." };

  const filename = safeFilename(dance_name);
  const query = theme ? `?theme=${encodeURIComponent(theme)}` : "";

  try {
    if (Platform.OS === "web") {
      // Web: fetch → blob → object URL → programmatic click on <a download>.
      const resp = await fetch(`${API_BASE}/certificate/${dance_id}${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) {
        let msg = `Couldn't generate certificate (HTTP ${resp.status}).`;
        try {
          const j = await resp.json();
          if (j?.detail) msg = j.detail;
        } catch {
          /* body might not be JSON — keep the generic message */
        }
        return { ok: false, message: msg };
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      // Revoke the URL after a beat so the browser has finished the download.
      setTimeout(() => {
        try {
          URL.revokeObjectURL(url);
          a.remove();
        } catch {
          /* ignore */
        }
      }, 800);
      return { ok: true };
    }

    // Native: FileSystem.downloadAsync writes straight to disk without
    // us needing to base64-shuffle megabytes of PDF through JS.
    const dest = `${FileSystem.cacheDirectory}${filename}`;
    const dl = await FileSystem.downloadAsync(
      `${API_BASE}/certificate/${dance_id}${query}`,
      dest,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (dl.status !== 200) {
      return { ok: false, message: `Server error (HTTP ${dl.status}).` };
    }
    // Sharing.isAvailableAsync is defensive — very old devices lack it,
    // but every currently-supported OS has it.
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(dl.uri, {
        mimeType: "application/pdf",
        dialogTitle: "Save your certificate",
        UTI: "com.adobe.pdf",
      });
      return { ok: true };
    }
    return {
      ok: false,
      message:
        "Certificate saved to app cache but sharing isn't available on this device.",
    };
  } catch (e: any) {
    return {
      ok: false,
      message: e?.message || "Something went wrong downloading the certificate.",
    };
  }
}
