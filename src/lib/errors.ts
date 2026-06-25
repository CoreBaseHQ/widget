// Turns a failed API response into a clear, localized message for the visitor —
// so we never surface raw JSON like {"detail":{"error":"..."}} or browser
// strings like "NetworkError when attempting to fetch resource."

import type { Strings } from "./i18n";

type Ctx = "chat" | "voice";

// Backend `detail.error` codes → localized string key.
const CODE_KEY: Record<string, keyof Strings> = {
  end_user_quota_exceeded: "errQuota",
  rate_limit_exceeded: "errRate",
  llm_key_required: "errLlmKey",
  voice_unavailable: "errVoiceUnavailable",
  voice_disabled: "errVoiceDisabled",
  voice_not_configured: "errVoiceNotConfigured",
};

/** Map a non-OK HTTP response (parsed `body`) to a friendly, localized sentence. */
export function friendlyError(
  status: number,
  body: unknown,
  s: Strings,
  ctx: Ctx = "chat",
): string {
  const detail =
    body && typeof body === "object" && "detail" in body
      ? (body as { detail: unknown }).detail
      : body;

  if (detail && typeof detail === "object") {
    const code = (detail as { error?: unknown }).error;
    if (typeof code === "string" && CODE_KEY[code]) return s[CODE_KEY[code]];
  } else if (typeof detail === "string" && detail.trim()) {
    if (CODE_KEY[detail]) return s[CODE_KEY[detail]];
  }

  if (status === 429) return s.errQuota;
  if (status === 401 || status === 403) return s.errSession;
  if (status >= 500) return s.errServer;
  return ctx === "voice" ? s.errVoiceGeneric : s.errSendGeneric;
}

/** Map a thrown/caught error (fetch reject, SDK failure) to a friendly message —
 *  never the raw `err.message`. A `TypeError` is a network/CORS failure. */
export function networkErrorMessage(
  err: unknown,
  s: Strings,
  ctx: Ctx = "chat",
): string {
  if (err instanceof TypeError) return s.errNetwork;
  return ctx === "voice" ? s.errVoiceGeneric : s.errSendGeneric;
}

/** Parse a Response body as JSON, falling back to text, never throwing. */
export async function parseErrorBody(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    try {
      return await res.text();
    } catch {
      return null;
    }
  }
}
