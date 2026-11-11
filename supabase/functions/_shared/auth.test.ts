// Unit tests for the edge-function auth helpers. These require no external
// environment (no database, no live Supabase). Run with:
//   deno test --allow-env --allow-net supabase/functions/_shared/auth.test.ts
//
// --allow-net is only needed the first time to fetch the npm package that
// auth.ts references; the pure functions under test make no network calls.

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  requireUser,
  sanitizeRedirectTo,
  signOAuthState,
  verifyOAuthState,
  type OAuthStatePayload,
} from "./auth.ts";

// Deterministic secret + origins for the whole suite.
Deno.env.set("OAUTH_STATE_SECRET", "unit-test-secret-please-do-not-use-in-prod");
Deno.env.set("APP_URL", "http://localhost:8080");
Deno.env.set("ALLOWED_REDIRECT_ORIGINS", "https://app.example.com");

function futurePayload(overrides: Partial<OAuthStatePayload> = {}): OAuthStatePayload {
  return {
    userId: "user-123",
    redirectTo: "http://localhost:8080/app",
    exp: Date.now() + 10 * 60 * 1000,
    nonce: "nonce-abc",
    ...overrides,
  };
}

Deno.test("OAuth state: valid signature round-trips", async () => {
  const state = await signOAuthState(futurePayload());
  const verified = await verifyOAuthState(state);
  assert(verified !== null, "valid state must verify");
  assertEquals(verified?.userId, "user-123");
  assertEquals(verified?.redirectTo, "http://localhost:8080/app");
});

Deno.test("OAuth state: tampered body is rejected", async () => {
  const state = await signOAuthState(futurePayload());
  const [body, sig] = state.split(".");
  // Flip one character of the payload body while keeping the old signature.
  const flipped = (body[0] === "A" ? "B" : "A") + body.slice(1);
  const tampered = `${flipped}.${sig}`;
  assertEquals(await verifyOAuthState(tampered), null);
});

Deno.test("OAuth state: tampered signature is rejected", async () => {
  const state = await signOAuthState(futurePayload());
  const [body, sig] = state.split(".");
  const flippedSig = (sig[0] === "A" ? "B" : "A") + sig.slice(1);
  assertEquals(await verifyOAuthState(`${body}.${flippedSig}`), null);
});

Deno.test("OAuth state: expired state is rejected", async () => {
  const state = await signOAuthState(futurePayload({ exp: Date.now() - 1000 }));
  assertEquals(await verifyOAuthState(state), null);
});

Deno.test("OAuth state: malformed and missing states are rejected", async () => {
  assertEquals(await verifyOAuthState(""), null);
  assertEquals(await verifyOAuthState("no-dot-here"), null);
  assertEquals(await verifyOAuthState("only.one"), null);
  assertEquals(await verifyOAuthState("...."), null);
  // Well-formed base64url but not a signed payload.
  assertEquals(await verifyOAuthState("YWJj.ZGVm"), null);
});

Deno.test("OAuth state: userId is not trusted until signature verifies", async () => {
  // An attacker-crafted body claiming a different userId, without a valid sig.
  const forgedBody = btoa(JSON.stringify(futurePayload({ userId: "victim" })))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  assertEquals(await verifyOAuthState(`${forgedBody}.AAAA`), null);
});

Deno.test("redirect allowlist: configured origins are accepted", () => {
  assertEquals(
    sanitizeRedirectTo("http://localhost:8080/app"),
    "http://localhost:8080/app",
  );
  assertEquals(
    sanitizeRedirectTo("https://app.example.com/app?x=1#frag"),
    "https://app.example.com/app",
  );
});

Deno.test("redirect allowlist: unknown origin falls back to APP_URL", () => {
  assertEquals(sanitizeRedirectTo("https://evil.example/steal"), "http://localhost:8080/");
});

Deno.test("redirect allowlist: protocol-relative and malformed URLs fall back", () => {
  assertEquals(sanitizeRedirectTo("//evil.example/x"), "http://localhost:8080/");
  assertEquals(sanitizeRedirectTo("not a url"), "http://localhost:8080/");
  assertEquals(sanitizeRedirectTo("javascript:alert(1)"), "http://localhost:8080/");
});

Deno.test("redirect allowlist: empty input returns APP_URL path", () => {
  assertEquals(sanitizeRedirectTo(""), "http://localhost:8080/");
  assertEquals(sanitizeRedirectTo(null), "http://localhost:8080/");
});

Deno.test("requireUser: rejects missing Authorization header with 401", async () => {
  const res = await requireUser(new Request("https://edge.local/fn"));
  assert(res instanceof Response, "must return a Response, not a user");
  assertEquals((res as Response).status, 401);
});

Deno.test("requireUser: rejects non-Bearer Authorization with 401", async () => {
  const res = await requireUser(
    new Request("https://edge.local/fn", { headers: { Authorization: "Basic abc" } }),
  );
  assert(res instanceof Response);
  assertEquals((res as Response).status, 401);
});
