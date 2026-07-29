import {
  corsHeaders,
  jsonResponse,
  requireUser,
  sanitizeRedirectTo,
  signOAuthState,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user } = auth;

    const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
    if (!clientId) {
      return jsonResponse({ error: "GOOGLE_CLIENT_ID not configured" }, 500);
    }

    const body = await req.json().catch(() => ({}));
    const requestedRedirectTo = typeof body?.redirectTo === "string" ? body.redirectTo : "";
    const redirectTo = sanitizeRedirectTo(requestedRedirectTo);

    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-calendar-callback`;
    const state = await signOAuthState({
      userId: user.id,
      redirectTo,
      exp: Date.now() + 10 * 60 * 1000,
      nonce: crypto.randomUUID(),
    });

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

    return jsonResponse({ url: authUrl });
  } catch (error) {
    console.error("Error:", error);
    return jsonResponse({ error: "Internal error" }, 500);
  }
});
