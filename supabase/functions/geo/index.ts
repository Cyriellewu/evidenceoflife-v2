// Nominatim proxy (search + reverse)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

type Body =
  | { type: 'search'; q: string; limit?: number }
  | { type: 'reverse'; lat: number; lng: number; lang?: string }
  | { type: 'reclassify'; places: Array<{ id: string; name: string; lat: number; lng: number }> }
  | { type: 'boundaries'; cities: Array<{ name: string; lat: number; lng: number }> };

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
      // If user coordinates are provided, use viewbox to prioritize nearby results
      const userLat = Number((body as any).lat);
      const userLng = Number((body as any).lng);
      let locationParams = '';
      if (!isNaN(userLat) && !isNaN(userLng) && userLat !== 0 && userLng !== 0) {
        // Create a ~50km bounding box around user location, with bounded=0 so it still shows global results but prefers nearby
        const delta = 0.5; // ~50km
        locationParams = `&viewbox=${userLng - delta},${userLat + delta},${userLng + delta},${userLat - delta}&bounded=0`;
      }
      const url = `https://nominatim.openstreetmap.org/search?format=json&accept-language=en&limit=${limit}&addressdetails=1&extratags=1${locationParams}&q=${encodeURIComponent(q)}`;
      const res = await fetchWithRetry(url);
      if (!res.ok) throw new Error(`Search failed: ${res.status}`);
      const json = (await res.json()) as Array<{ display_name: string; lat: string; lon: string; class?: string; type?: string }>;

      const results = json.map((r: any) => ({
        name: r.display_name.split(',').slice(0, 2).join(', '),
        lat: Number(r.lat),
        lng: Number(r.lon),
        category: detectCategory({ class: r.class, type: r.type, display_name: r.display_name, address: r.address, extratags: r.extratags }),
      }));

      return Response.json({ results }, { headers: { ...corsHeaders } });
    }

    if (body.type === 'reverse') {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      // Localize names when requested (e.g. zh → "北京市" instead of "Beijing").
      const rawLang = String((body as any).lang ?? 'en').toLowerCase();
      const lang = /^[a-z]{2}(-[a-z]{2})?$/.test(rawLang) ? rawLang : 'en';
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&accept-language=${lang}&lat=${lat}&lon=${lng}&addressdetails=1`;
      const res = await fetchWithRetry(url);
      if (!res.ok) return Response.json({ name: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city: '', category: 'other' }, { headers: { ...corsHeaders } });
      const json = (await res.json()) as { display_name?: string; name?: string; class?: string; type?: string; address?: any };
      const addr = json.address || {};
      // Extract city-level name - prefer actual city over neighborhood/district
      // For places like "Morningside Heights, Manhattan, New York" we want "New York"
      let cityName = addr.city || addr.town || addr.municipality || addr.county || addr.state_district || addr.state || addr.province || addr.city_district || addr.district || addr.village || '';
      // In China the direct-administered municipalities (Beijing/Shanghai/Tianjin/
      // Chongqing) tag their districts as `city`, e.g. "Haidian District" / "海淀区".
      // Keep everything at the municipal level: if the picked name is a district
      // (ends with "District" or 区), bump up to a higher admin field.
      const isDistrict = (v: unknown) => typeof v === 'string' && (/区$/.test(v) || /\bDistrict$/i.test(v));
      if (isDistrict(cityName)) {
        const municipal = [addr.municipality, addr.city, addr.county, addr.state, addr.province]
          .find((v: unknown) => typeof v === 'string' && v.trim() && !isDistrict(v));
        if (municipal) {
          cityName = municipal as string;
        } else {
          // At building-level zoom, Nominatim often returns ONLY the district as
          // `city` with no province/state field — but it always carries the
          // ISO 3166-2 province code. Map the 4 direct-administered municipalities
          // by that code so e.g. "海淀区" (CN-BJ) resolves to "北京市" / "Beijing".
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
      const display =
        json.name || (json.display_name ? json.display_name.split(',').slice(0, 2).join(', ') : '');
      const category = detectCategory({ class: json.class, type: json.type, display_name: json.display_name, address: json.address });
      return Response.json({ name: display || cityName || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city: cityName, category }, { headers: { ...corsHeaders } });
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
            results.push({ id: place.id, category });
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
        await supabaseAdmin.from('moments').update({ location_category: r.category }).eq('id', r.id).eq('user_id', userData.user.id);
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
