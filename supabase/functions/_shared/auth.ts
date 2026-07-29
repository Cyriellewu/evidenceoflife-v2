import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

/** Require a valid user JWT from the Authorization Bearer header. */
export async function requireUser(
  req: Request,
): Promise<{ user: User; supabase: SupabaseClient } | Response> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  return { user: data.user, supabase };
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function hmacKey(): Promise<CryptoKey> {
  const secret =
    Deno.env.get("OAUTH_STATE_SECRET") ||
    Deno.env.get("GOOGLE_CLIENT_SECRET") ||
    "";
  if (!secret) {
    throw new Error("OAUTH_STATE_SECRET or GOOGLE_CLIENT_SECRET is required");
  }
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export type OAuthStatePayload = {
  userId: string;
  redirectTo: string;
  exp: number;
  nonce: string;
};

/** Sign OAuth state so the callback cannot be forged or rebound. */
export async function signOAuthState(payload: OAuthStatePayload): Promise<string> {
  const body = bytesToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return `${body}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

export async function verifyOAuthState(state: string): Promise<OAuthStatePayload | null> {
  const [body, sig] = state.split(".");
  if (!body || !sig) return null;

  try {
    const key = await hmacKey();
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(sig),
      new TextEncoder().encode(body),
    );
    if (!ok) return null;

    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(body))) as OAuthStatePayload;
    if (!payload?.userId || !payload?.redirectTo || !payload?.exp) return null;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Allow only APP_URL (and optional comma-separated ALLOWED_REDIRECT_ORIGINS). */
export function sanitizeRedirectTo(requested: string | null | undefined): string {
  const appUrl = Deno.env.get("APP_URL") || "http://localhost:8080";
  const allowed = new Set<string>();

  const addOrigin = (raw: string) => {
    try {
      const u = new URL(raw);
      allowed.add(u.origin);
    } catch {
      /* ignore */
    }
  };

  addOrigin(appUrl);
  for (const part of (Deno.env.get("ALLOWED_REDIRECT_ORIGINS") || "").split(",")) {
    if (part.trim()) addOrigin(part.trim());
  }

  if (!requested) {
    try {
      return new URL(appUrl).origin + new URL(appUrl).pathname;
    } catch {
      return "http://localhost:8080";
    }
  }

  try {
    const parsed = new URL(requested);
    if (!allowed.has(parsed.origin)) {
      const fallback = new URL(appUrl);
      return fallback.origin + fallback.pathname;
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    const fallback = new URL(appUrl);
    return fallback.origin + fallback.pathname;
  }
}

/**
 * image-proxy is used from <img src>, so JWT headers are unavailable.
 * Require a matching anon apikey query/header and an Origin/Referer on the allowlist.
 */
export function authorizeImageProxy(req: Request): Response | null {
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const url = new URL(req.url);
  const provided =
    url.searchParams.get("apikey") ||
    req.headers.get("apikey") ||
    "";

  if (!anonKey || provided !== anonKey) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const appUrl = Deno.env.get("APP_URL") || "http://localhost:8080";
  const allowedOrigins = new Set<string>();
  try {
    allowedOrigins.add(new URL(appUrl).origin);
  } catch {
    /* ignore */
  }
  for (const part of (Deno.env.get("ALLOWED_REDIRECT_ORIGINS") || "").split(",")) {
    if (!part.trim()) continue;
    try {
      allowedOrigins.add(new URL(part.trim()).origin);
    } catch {
      /* ignore */
    }
  }
  // Local Vite defaults
  allowedOrigins.add("http://localhost:8080");
  allowedOrigins.add("http://127.0.0.1:8080");

  const origin = req.headers.get("Origin");
  const referer = req.headers.get("Referer");
  let requestOrigin: string | null = origin;
  if (!requestOrigin && referer) {
    try {
      requestOrigin = new URL(referer).origin;
    } catch {
      requestOrigin = null;
    }
  }

  // Allow missing Origin/Referer only for same-project prefetch edge cases in
  // some browsers; still require a valid apikey above.
  if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
    return jsonResponse({ error: "Forbidden origin" }, 403);
  }

  return null;
}
