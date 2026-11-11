// widget-api: the iOS home-screen widget's door into one user's data.
//
// Two kinds of caller:
//   1. The signed-in web app (Bearer user JWT) — mints or revokes widget keys.
//   2. The Scriptable widget (header `x-widget-token: eolw_…`) — a narrow set
//      of actions for that key's owner: read today, add/tick a todo, add a
//      moment with a photo and location.
//
// Keys are stored only as SHA-256 hashes (public.widget_tokens). Every query
// below is filtered by the key owner's user_id; the service-role client never
// touches another user's rows.

import { createClient } from "npm:@supabase/supabase-js@2.111.0";
import { corsHeaders, jsonResponse, requireUser } from "../_shared/auth.ts";
import {
  cleanLocation,
  cleanText,
  cleanTitle,
  decodePhoto,
  hashToken,
  isDateKey,
  looksLikeToken,
  MAX_TOKENS_PER_USER,
  newRawToken,
} from "./logic.ts";

const WIDGET_CORS = {
  ...corsHeaders,
  "Access-Control-Allow-Headers": `${corsHeaders["Access-Control-Allow-Headers"] ?? "authorization, x-client-info, apikey, content-type"}, x-widget-token`,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...WIDGET_CORS, "Content-Type": "application/json" },
  });
}

function admin() {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Server misconfigured");
  return createClient(url, key, { auth: { persistSession: false } });
}

async function mintToken(req: Request, label: unknown) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const db = admin();
  const raw = newRawToken();
  const { error } = await db.from("widget_tokens").insert({
    user_id: auth.user.id,
    token_hash: await hashToken(raw),
    label: typeof label === "string" && label.trim() ? label.trim().slice(0, 60) : "iPhone widget",
  });
  if (error) return json({ error: "Could not create key" }, 500);

  // Keep at most a handful of live keys per person; drop the oldest.
  const { data: keys } = await db
    .from("widget_tokens")
    .select("id")
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  const stale = (keys ?? []).slice(MAX_TOKENS_PER_USER).map((k) => k.id);
  if (stale.length) await db.from("widget_tokens").delete().eq("user_id", auth.user.id).in("id", stale);

  return json({ token: raw });
}

async function revokeTokens(req: Request) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { error } = await admin().from("widget_tokens").delete().eq("user_id", auth.user.id);
  if (error) return json({ error: "Could not revoke keys" }, 500);
  return json({ ok: true });
}

async function ownerOf(rawToken: string | null): Promise<string | null> {
  if (!looksLikeToken(rawToken)) return null;
  const db = admin();
  const hash = await hashToken(rawToken);
  const { data } = await db.from("widget_tokens").select("id, user_id").eq("token_hash", hash).maybeSingle();
  if (!data) return null;
  await db.from("widget_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", data.id);
  return data.user_id as string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: WIDGET_CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const action = body.action;

  try {
    // ---- signed-in web app ----
    if (action === "create-token") return await mintToken(req, body.label);
    if (action === "revoke-tokens") return await revokeTokens(req);

    // ---- widget ----
    const userId = await ownerOf(req.headers.get("x-widget-token"));
    if (!userId) return json({ error: "Unauthorized" }, 401);
    const db = admin();

    if (action === "today") {
      if (!isDateKey(body.date)) return json({ error: "date required" }, 400);
      const [todos, places, moments] = await Promise.all([
        db.from("todos")
          .select("id, title, is_completed, time_segment, sort_order")
          .eq("user_id", userId)
          .eq("date", body.date)
          .is("parent_due_id", null)
          .is("due_date", null)
          .order("sort_order", { ascending: true })
          .limit(30),
        db.from("places").select("name, category, lat, lng").eq("user_id", userId).limit(500),
        db.from("moments")
          .select("location_name, location_lat, location_lng, location_category")
          .eq("user_id", userId)
          .not("location_lat", "is", null)
          .limit(500),
      ]);
      if (todos.error || places.error || moments.error) return json({ error: "Could not load" }, 500);
      const pins = [
        ...(places.data ?? []).map((p) => ({ name: p.name, category: p.category, lat: Number(p.lat), lng: Number(p.lng) })),
        ...(moments.data ?? []).map((m) => ({
          name: m.location_name,
          category: m.location_category || "other",
          lat: Number(m.location_lat),
          lng: Number(m.location_lng),
        })),
      ];
      return json({ todos: todos.data ?? [], places: pins });
    }

    if (action === "add-todo") {
      const title = cleanTitle(body.title);
      if (!title || !isDateKey(body.date)) return json({ error: "title and date required" }, 400);
      const { data, error } = await db
        .from("todos")
        .insert({ user_id: userId, title, date: body.date })
        .select("id, title, is_completed")
        .single();
      if (error) return json({ error: "Could not add" }, 500);
      return json({ todo: data });
    }

    if (action === "toggle-todo") {
      if (typeof body.id !== "string" || typeof body.done !== "boolean") return json({ error: "id and done required" }, 400);
      const { error } = await db
        .from("todos")
        .update({ is_completed: body.done, progress: body.done ? 100 : 0, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("id", body.id);
      if (error) return json({ error: "Could not update" }, 500);
      return json({ ok: true });
    }

    if (action === "add-moment") {
      if (!isDateKey(body.date)) return json({ error: "date required" }, 400);
      const photo = decodePhoto(body.photo);
      if (photo && "error" in photo) return json({ error: photo.error }, 400);
      const text = cleanText(body.text);
      const location = cleanLocation(body.location);
      if (!photo && !text && !location) return json({ error: "nothing to save" }, 400);

      const photos: string[] = [];
      if (photo) {
        // First path segment must be the owner's id (storage policies check it).
        const path = `${userId}/${Date.now()}-${crypto.randomUUID()}.${photo.ext}`;
        const { error } = await db.storage.from("moment-photos").upload(path, photo.bytes, {
          contentType: photo.contentType,
          upsert: false,
        });
        if (error) return json({ error: "Photo upload failed" }, 500);
        photos.push(path);
      }

      const { data, error } = await db
        .from("moments")
        .insert({
          user_id: userId,
          date: body.date,
          text,
          photos,
          location_name: location?.name ?? null,
          location_lat: location?.lat ?? null,
          location_lng: location?.lng ?? null,
          location_category: location?.category ?? null,
          tags: ["widget"],
        })
        .select("id")
        .single();
      if (error) return json({ error: "Could not save" }, 500);
      return json({ moment: data });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("widget-api error", e);
    return jsonResponse({ error: "Server error" }, 500);
  }
});
