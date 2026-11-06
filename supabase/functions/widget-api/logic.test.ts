// Run: deno test --no-check supabase/functions/widget-api/logic.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  cleanLocation,
  cleanTitle,
  decodePhoto,
  hashToken,
  isDateKey,
  looksLikeToken,
  newRawToken,
} from "./logic.ts";

Deno.test("tokens are random, prefixed, and hashed deterministically", async () => {
  const a = newRawToken();
  const b = newRawToken();
  assert(a !== b);
  assert(looksLikeToken(a));
  assertEquals(await hashToken(a), await hashToken(a));
  assert((await hashToken(a)) !== (await hashToken(b)));
  assertEquals((await hashToken(a)).length, 64);
});

Deno.test("rejects malformed tokens", () => {
  assert(!looksLikeToken("Bearer abc"));
  assert(!looksLikeToken("eolw_short"));
  assert(!looksLikeToken("eolw_" + "a".repeat(40) + "!"));
  assert(!looksLikeToken(undefined));
});

Deno.test("validates dates, titles and locations", () => {
  assert(isDateKey("2026-11-06"));
  assert(!isDateKey("2026-13-40"));
  assert(!isDateKey("tomorrow"));
  assertEquals(cleanTitle("  buy   milk "), "buy milk");
  assertEquals(cleanTitle(""), null);
  assertEquals(cleanTitle("x".repeat(201)), null);
  assertEquals(cleanLocation({ lat: 40.8, lng: -73.96, name: "Butler", category: "museum" }), {
    name: "Butler", lat: 40.8, lng: -73.96, category: "museum",
  });
  assertEquals(cleanLocation({ lat: 140, lng: 0 }), null);
  assertEquals(cleanLocation({ lat: 1, lng: 2, category: "<script>" })?.category, "other");
});

Deno.test("decodes photos and enforces type", () => {
  const ok = decodePhoto({ contentType: "image/jpeg", base64: btoa("abc") });
  assert(ok && !("error" in ok));
  if (ok && !("error" in ok)) assertEquals(ok.ext, "jpg");
  assertEquals(decodePhoto({ contentType: "text/html", base64: "YQ==" }), { error: "unsupported photo type" });
  assertEquals(decodePhoto(null), null);
});
