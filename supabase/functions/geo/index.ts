// Nominatim proxy (search + reverse)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Body =
  | { type: 'search'; q: string; limit?: number; lat?: number; lng?: number }
  | { type: 'reverse'; lat: number; lng: number; lang?: string }
  | { type: 'reclassify'; places: Array<{ id: string; name: string; lat: number; lng: number }> }
  | { type: 'boundaries'; cities: Array<{ name: string; lat: number; lng: number }> };

const FALLBACK_PLACE = 'Current location';

function isCoordLikeName(name: string): boolean {
  return /^-?\d{1,3}(?:\.\d+)?\s*,\s*-?\d{1,3}(?:\.\d+)?$/.test(String(name || '').trim());
}

function pickCity(addr: Record<string, unknown>, lang: string): string {
  let cityName =
    (addr.city as string) ||
    (addr.town as string) ||
    (addr.municipality as string) ||
    (addr.county as string) ||
    (addr.state_district as string) ||
    (addr.state as string) ||
    (addr.province as string) ||
    (addr.city_district as string) ||
    (addr.district as string) ||
    (addr.village as string) ||
    '';
  const isDistrict = (v: unknown) => typeof v === 'string' && (/区$/.test(v) || /\bDistrict$/i.test(v));
  if (isDistrict(cityName)) {
    const municipal = [addr.municipality, addr.city, addr.county, addr.state, addr.province]
      .find((v: unknown) => typeof v === 'string' && v.trim() && !isDistrict(v));
    if (municipal) {
      cityName = municipal as string;
    } else {
      const iso = String(addr['ISO3166-2-lvl4'] || '').toUpperCase();
      const isZh = lang.startsWith('zh');
      const MUNICIPALITY_BY_ISO: Record<string, { zh: string; en: string }> = {
        'CN-BJ': { zh: '北京市', en: 'Beijing' },
        'CN-SH': { zh: '上海市', en: 'Shanghai' },
        'CN-TJ': { zh: '天津市', en: 'Tianjin' },
        'CN-CQ': { zh: '重庆市', en: 'Chongqing' },
      };
      const mapped = MUNICIPALITY_BY_ISO[iso];
      if (mapped) cityName = isZh ? mapped.zh : mapped.en;
    }
  }
  return cityName;
}

/** Prefer a named POI / road / locality — never raw lat,lng. */
function formatPlaceLabel(
  item: { name?: string; display_name?: string; address?: Record<string, unknown> },
  lang: string,
): { name: string; city: string } {
  const addr = item.address || {};
  const city = pickCity(addr, lang);
  const poi =
    (typeof item.name === 'string' && item.name.trim()) ||
    (addr.amenity as string) ||
    (addr.shop as string) ||
    (addr.tourism as string) ||
    (addr.leisure as string) ||
    (addr.building as string) ||
    (addr.office as string) ||
    (addr.railway as string) ||
    (addr.aeroway as string) ||
    '';
  const road = [addr.house_number, addr.road || addr.pedestrian || addr.footway || addr.path]
    .filter((v) => typeof v === 'string' && String(v).trim())
    .join(' ')
    .trim();
  const locality =
    (addr.neighbourhood as string) ||
    (addr.suburb as string) ||
    (addr.quarter as string) ||
    (addr.residential as string) ||
    (addr.hamlet as string) ||
    '';

  let primary = (poi || road || locality || '').trim();
  if (!primary && item.display_name) {
    primary = String(item.display_name).split(',').slice(0, 2).join(', ').trim();
  }
  if (!primary || isCoordLikeName(primary)) {
    primary = city || FALLBACK_PLACE;
  }

  // "Starbucks, Seattle" — skip when primary already embeds the city.
  const withCity =
    city && primary !== city && !primary.includes(city)
      ? `${primary}, ${city}`
      : primary;

  return {
    name: isCoordLikeName(withCity) ? FALLBACK_PLACE : withCity,
    city: city || '',
  };
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Map Nominatim class/type + name keywords to our categories
function detectCategory(item: { class?: string; type?: string; display_name?: string; address?: any; extratags?: any; namedetails?: any }): string {
  const cls = (item.class || '').toLowerCase();
  const typ = (item.type || '').toLowerCase();
  const name = (item.display_name || '').toLowerCase();
  const addr = item.address || {};
  const extra = item.extratags || {};
  const cuisine = (extra.cuisine || '').toLowerCase();
  const addrValues = Object.values(addr).map((v: any) => String(v).toLowerCase()).join(' ');
  const all = `${cls} ${typ} ${name} ${addrValues} ${cuisine}`;

  // Restaurant / food keywords (multi-language)
  const restaurantKeywords = ['restaurant', 'fast_food', 'food_court', 'bbq', 'barbeque', 'barbecue', 'dining', 'diner', 'bistro', 'grill', 'pizzeria', 'sushi', 'ramen', 'noodle', 'burger', 'taco', 'kebab', 'steakhouse', 'wing', 'fried chicken', 'seafood', 'buffet', 'brunch', 'dim sum', 'hot pot', 'pho', 'curry',
    '餐', '饭', '面馆', '火锅', '烤', '食堂', '菜馆', '小吃', '饺子', '包子', '串串', '麻辣', '烧烤', '食', '酒楼', '酒家', '饭店', '餐馆', '餐厅', '美食'];
  if (cls === 'amenity' && ['restaurant', 'fast_food', 'food_court', 'bbq'].includes(typ)) return 'restaurant';
  if (restaurantKeywords.some(k => all.includes(k))) return 'restaurant';
  
  // Coffee / cafe / bar / tea keywords
  const coffeeKeywords = ['cafe', 'café', 'coffee', 'bar', 'pub', 'tea', 'boba', 'milk tea', 'juice',
    '咖啡', '茶', '奶茶', '酒吧', '甜品', '蛋糕', '面包', 'bakery', 'dessert', 'ice cream', 'ice_cream', 'biergarten'];
  if (cls === 'amenity' && ['cafe', 'bar', 'pub', 'ice_cream', 'biergarten'].includes(typ)) return 'coffee';
  if (coffeeKeywords.some(k => all.includes(k))) return 'coffee';
  
  // Grocery / shop
  const groceryKeywords = ['shop', 'store', 'market', 'supermarket', 'mall', 'grocery', 'convenience',
    '超市', '商店', '便利店', '商场', '市场', '百货'];
  if (cls === 'shop') return 'grocery';
  if (groceryKeywords.some(k => all.includes(k))) return 'grocery';
  
  // Park / outdoors
  const parkKeywords = ['park', 'garden', 'playground', 'nature', 'forest', 'beach', 'lake', 'mountain', 'trail', 'hiking',
    '公园', '花园', '广场', '湖', '山', '森林', '海滩', '步道'];
  if (cls === 'leisure' && ['park', 'garden', 'playground', 'nature_reserve', 'sports_centre'].includes(typ)) return 'park';
  if (cls === 'natural') return 'park';
  if (parkKeywords.some(k => all.includes(k))) return 'park';
  
  // Museum / culture
  const museumKeywords = ['museum', 'gallery', 'theater', 'theatre', 'cinema', 'library', 'arts', 'exhibition', 'concert', 'opera',
    '博物', '美术', '图书', '剧院', '影院', '展览', '文化'];
  if (cls === 'tourism' && ['museum', 'gallery', 'artwork', 'attraction', 'viewpoint'].includes(typ)) return 'museum';
  if (cls === 'amenity' && ['theatre', 'cinema', 'library', 'arts_centre'].includes(typ)) return 'museum';
  if (museumKeywords.some(k => all.includes(k))) return 'museum';

  return 'other';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = (await req.json()) as Body;

    const headers = {
      Accept: 'application/json',
      'User-Agent': 'EvidenceOfLife/1.0 (https://github.com/Cyriellewu/evidenceoflife-v2)',
    };

    // Fetch with retry on 429
    async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        const res = await fetch(url, { headers });
        if (res.status === 429) {
          const wait = 1500 * (attempt + 1);
          await new Promise(r => setTimeout(r, wait));
          continue;
        }
        return res;
      }
      return await fetch(url, { headers });
    }

    if (body.type === 'search') {
      const q = String(body.q ?? '').trim();
      if (q.length < 2) {
        return Response.json({ results: [] }, { headers: { ...corsHeaders } });
      }

      const limit = Math.max(1, Math.min(Number(body.limit ?? 8), 15));
      const userLat = Number(body.lat);
      const userLng = Number(body.lng);
      const hasOrigin =
        Number.isFinite(userLat) &&
        Number.isFinite(userLng) &&
        !(userLat === 0 && userLng === 0);

      // ~12km viewbox when we know where the user is — maps-style nearby bias.
      // bounded=0 still allows distant hits when the query is uniquely far away;
      // we re-rank by distance afterward so closest recommendations surface first.
      let locationParams = '';
      if (hasOrigin) {
        const delta = 0.11;
        locationParams =
          `&viewbox=${userLng - delta},${userLat + delta},${userLng + delta},${userLat - delta}&bounded=0`;
      }

      // Pull extra candidates when biasing so distance sort has room to work.
      const fetchLimit = hasOrigin ? Math.min(Math.max(limit * 2, 12), 20) : limit;
      const url =
        `https://nominatim.openstreetmap.org/search?format=json&accept-language=en&limit=${fetchLimit}` +
        `&addressdetails=1&extratags=1${locationParams}&q=${encodeURIComponent(q)}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const json = (await res.json()) as Array<{
        display_name: string;
        lat: string;
        lon: string;
        name?: string;
        class?: string;
        type?: string;
        address?: Record<string, unknown>;
        extratags?: Record<string, unknown>;
      }>;

      let results = json.map((r) => {
        const { name } = formatPlaceLabel(
          { name: r.name, display_name: r.display_name, address: r.address },
          'en',
        );
        const lat = Number(r.lat);
        const lng = Number(r.lon);
        const distance_m = hasOrigin ? Math.round(haversineMeters(userLat, userLng, lat, lng)) : undefined;
        return {
          name,
          lat,
          lng,
          category: detectCategory({
            class: r.class,
            type: r.type,
            display_name: r.display_name,
            address: r.address,
            extratags: r.extratags,
          }),
          ...(distance_m !== undefined ? { distance_m } : {}),
        };
      }).filter((r) => r.name && !isCoordLikeName(r.name));

      if (hasOrigin) {
        results = results.sort((a, b) => (a.distance_m ?? 0) - (b.distance_m ?? 0));
        // Soft nearby preference: keep everything within ~40km first; if that
        // leaves too few hits, fall back to the full distance-sorted list.
        const nearby = results.filter((r) => (r.distance_m ?? Infinity) <= 40_000);
        if (nearby.length >= Math.min(3, limit)) {
          results = nearby;
        }
        results = results.slice(0, limit);
      }

      return Response.json({ results }, { headers: { ...corsHeaders } });
    }

    if (body.type === 'reverse') {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return Response.json(
          { name: FALLBACK_PLACE, city: '', category: 'other' },
          { headers: { ...corsHeaders } },
        );
      }
      // Localize names when requested (e.g. zh → "北京市" instead of "Beijing").
      const rawLang = String(body.lang ?? 'en').toLowerCase();
      const lang = /^[a-z]{2}(-[a-z]{2})?$/.test(rawLang) ? rawLang : 'en';

      // zoom=18 prefers building/POI-level names over coarse admin areas.
      const url =
        `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=${lang}` +
        `&lat=${lat}&lon=${lng}&addressdetails=1&zoom=18`;
      const res = await fetchWithRetry(url);
      if (!res.ok) {
        return Response.json(
          { name: FALLBACK_PLACE, city: '', category: 'other' },
          { headers: { ...corsHeaders } },
        );
      }
      const json = (await res.json()) as {
        display_name?: string;
        name?: string;
        class?: string;
        type?: string;
        address?: Record<string, unknown>;
        error?: string;
      };
      if (json.error) {
        return Response.json(
          { name: FALLBACK_PLACE, city: '', category: 'other' },
          { headers: { ...corsHeaders } },
        );
      }

      const labeled = formatPlaceLabel(json, lang);
      const category = detectCategory({
        class: json.class,
        type: json.type,
        display_name: json.display_name,
        address: json.address,
      });
      return Response.json(
        { name: labeled.name, city: labeled.city, category },
        { headers: { ...corsHeaders } },
      );
    }

    if (body.type === 'reclassify') {
      const places = body.places || [];
      const results: Array<{ id: string; category: string }> = [];
      
      for (const place of places.slice(0, 20)) {
        try {
          const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${place.lat}&lon=${place.lng}&addressdetails=1`;
          const res = await fetchWithRetry(url);
          if (res.ok) {
            const json = await res.json();
            const category = detectCategory({ class: json.class, type: json.type, display_name: json.display_name, address: json.address });
            // `other` is already the caller's current value. Do not issue a
            // no-op UPDATE every time the map mounts.
            if (category !== 'other') results.push({ id: place.id, category });
          }
          // Rate limit: Nominatim requires 1 req/s
          await new Promise(r => setTimeout(r, 1100));
        } catch {
          // skip
        }
      }
      
      // Update categories in DB
      const supabaseAdmin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
      );
      
      for (const r of results) {
        await supabaseAdmin
          .from('moments')
          .update({ location_category: r.category })
          .eq('id', r.id)
          .eq('user_id', userData.user.id)
          // If another request/user edit already classified it, leave it alone.
          .eq('location_category', 'other');
      }
      
      return Response.json({ updated: results }, { headers: { ...corsHeaders } });
    }

    if (body.type === 'boundaries') {
      const citiesInput = body.cities || [];
      const boundaries: Array<{ name: string; geojson: any }> = [];

      for (const city of citiesInput.slice(0, 10)) {
        try {
          // Search with geo-hint (center coordinates) and polygon geometry, then choose best city-level match
          const baseQuery = `${city.name}`.trim();
          const cityUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=6&polygon_geojson=1&addressdetails=1&featuretype=city&lat=${city.lat}&lon=${city.lng}&q=${encodeURIComponent(baseQuery)}`;
          const fallbackUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=6&polygon_geojson=1&addressdetails=1&lat=${city.lat}&lon=${city.lng}&q=${encodeURIComponent(baseQuery)}`;

          const pickBestBoundary = (items: any[]) => {
            const valid = (items || []).filter((it) => it?.geojson && (it.geojson.type === 'Polygon' || it.geojson.type === 'MultiPolygon'));
            if (valid.length === 0) return null;

            const score = (it: any) => {
              const cls = String(it.class || '').toLowerCase();
              const typ = String(it.type || '').toLowerCase();
              const placeRank = Number(it.place_rank || 0);
              const importance = Number(it.importance || 0);
              const bb = Array.isArray(it.boundingbox) ? it.boundingbox.map(Number) : [];
              const area = bb.length === 4 ? Math.abs((bb[1] - bb[0]) * (bb[3] - bb[2])) : 0;

              let rank = 0;
              if (cls === 'boundary' && typ === 'administrative') rank += 5;
              if (cls === 'place' && ['city', 'town', 'municipality'].includes(typ)) rank += 4;
              if (placeRank >= 12 && placeRank <= 18) rank += 3;
              if (it?.addresstype === 'city') rank += 2;

              return rank * 100 + importance * 10 + area;
            };

            return valid.sort((a, b) => score(b) - score(a))[0];
          };

          let res = await fetchWithRetry(cityUrl);
          if (!res.ok) res = await fetchWithRetry(fallbackUrl);

          if (res.ok) {
            const json = await res.json();
            const best = pickBestBoundary(json);
            if (best?.geojson) {
              boundaries.push({ name: city.name, geojson: best.geojson });
            }
          }

          // Rate limit
          await new Promise(r => setTimeout(r, 1100));
        } catch {
          // skip
        }
      }

      return Response.json({ boundaries }, { headers: { ...corsHeaders } });
    }

    return Response.json({ error: 'Invalid request' }, { status: 400, headers: { ...corsHeaders } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ error: message }, { status: 500, headers: { ...corsHeaders } });
  }
});
