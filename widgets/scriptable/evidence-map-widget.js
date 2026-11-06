// Evidence of Life — "my city" map widget for Scriptable (iOS).
//
// Shows the map around where you are, with the places you've logged marked by
// category (🍚 food, ☕️ coffee, 🌳 outdoors, 🏛 culture, 📍 other), and in New
// York the neighbourhoods you've been to in the same colours as the app.
//
// Setup (once):
//   1. Paste your project URL and publishable key below (the same public values
//      the web app ships with; never a service-role key).
//   2. Run the script inside Scriptable: it asks for your email, emails you a
//      6-digit code, and keeps its own sign-in in the iOS Keychain.
//   3. Add a Scriptable widget (large is the intended size) and pick this script.
//
// It reads only your own places (row-level security), with one small query per
// refresh, and caches map tiles on the device.

const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co';
const SUPABASE_KEY = 'YOUR-PUBLISHABLE-KEY';
const APP_URL = 'https://evilife.vercel.app/';

const KEYCHAIN_REFRESH = 'evidence-of-life.widget.refresh-token';
const CACHE_PLACES = 'evidence-of-life-places.json';
const NEARBY_KM = 25;
const TILE_DAYS = 14;

const EMOJI = { restaurant: '🍚', coffee: '☕️', park: '🌳', museum: '🏛', other: '📍' };

const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.cacheDirectory(), 'evidence-of-life-widget');
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);

// ---------- auth (its own session; email one-time code) ----------

async function authRequest(path, body) {
  const req = new Request(`${SUPABASE_URL}/auth/v1/${path}`);
  req.method = 'POST';
  req.headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
  req.body = JSON.stringify(body);
  const json = await req.loadJSON();
  if (req.response.statusCode >= 400) throw new Error(json.msg || json.error_description || json.error || 'Sign-in failed');
  return json;
}

async function ask(title, message, placeholder, keyboard) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  const field = a.addTextField(placeholder);
  if (keyboard === 'email') field.setEmailAddressKeyboard();
  if (keyboard === 'number') field.setNumberPadKeyboard();
  a.addAction('OK');
  a.addCancelAction('Cancel');
  if ((await a.presentAlert()) === -1) return null;
  return a.textFieldValue(0).trim();
}

async function signIn() {
  const email = await ask('Evidence of Life', 'Sign in with the email you use in the app.', 'you@example.com', 'email');
  if (!email) return null;
  await authRequest('otp', { email, create_user: false });
  const code = await ask('Check your email', `Enter the code sent to ${email}.`, '123456', 'number');
  if (!code) return null;
  const session = await authRequest('verify', { type: 'email', email, token: code });
  Keychain.set(KEYCHAIN_REFRESH, session.refresh_token);
  return session.access_token;
}

async function accessToken() {
  if (Keychain.contains(KEYCHAIN_REFRESH)) {
    try {
      const session = await authRequest('token?grant_type=refresh_token', { refresh_token: Keychain.get(KEYCHAIN_REFRESH) });
      Keychain.set(KEYCHAIN_REFRESH, session.refresh_token);
      return session.access_token;
    } catch (e) {
      Keychain.remove(KEYCHAIN_REFRESH);
    }
  }
  return config.runsInWidget ? null : signIn();
}

// ---------- data ----------

async function loadPlaces() {
  const cachePath = fm.joinPath(cacheDir, CACHE_PLACES);
  try {
    const token = await accessToken();
    if (!token) throw new Error('signed out');
    const req = new Request(`${SUPABASE_URL}/rest/v1/places?select=name,category,lat,lng`);
    req.headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
    const rows = await req.loadJSON();
    if (!Array.isArray(rows)) throw new Error('bad response');
    const places = rows
      .map(r => ({ name: r.name, category: r.category, lat: Number(r.lat), lng: Number(r.lng) }))
      .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng));
    fm.writeString(cachePath, JSON.stringify(places));
    return { places, signedIn: true };
  } catch (e) {
    const cached = fm.fileExists(cachePath) ? JSON.parse(fm.readString(cachePath)) : [];
    return { places: cached, signedIn: cached.length > 0 };
  }
}

async function here() {
  try {
    Location.setAccuracyToThreeKilometers();
    return await Location.current();
  } catch (e) {
    return null;
  }
}

function km(a, b) {
  const R = 6371;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLng = (b.lng - a.lng) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

// ---------- web-mercator helpers (256px tiles) ----------

const worldX = (lng, z) => ((lng + 180) / 360) * 256 * 2 ** z;
const worldY = (lat, z) => {
  const s = Math.sin(lat * Math.PI / 180);
  return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 256 * 2 ** z;
};

function fitZoom(points, w, h, pad) {
  for (let z = 15; z >= 9; z--) {
    const xs = points.map(p => worldX(p.lng, z));
    const ys = points.map(p => worldY(p.lat, z));
    if (Math.max(...xs) - Math.min(...xs) <= w - pad * 2 && Math.max(...ys) - Math.min(...ys) <= h - pad * 2) return z;
  }
  return 9;
}

async function tile(z, x, y, dark) {
  const n = 2 ** z;
  const tx = ((x % n) + n) % n;
  const style = dark ? 'World_Dark_Gray_Base' : 'World_Light_Gray_Base';
  const path = fm.joinPath(cacheDir, `${style}-${z}-${tx}-${y}.png`);
  if (fm.fileExists(path) && (Date.now() - fm.modificationDate(path).getTime()) < TILE_DAYS * 864e5) {
    return fm.readImage(path);
  }
  try {
    const img = await new Request(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${style}/MapServer/tile/${z}/${y}/${tx}`).loadImage();
    fm.writeImage(path, img);
    return img;
  } catch (e) {
    return fm.fileExists(path) ? fm.readImage(path) : null;
  }
}

// ---------- NYC areas (same coloured blocks as the app's Map view) ----------

const NTA_URL = 'https://data.cityofnewyork.us/resource/9nt8-h7nd.geojson'
  + '?$select=ntaname,simplify_preserve_topology(the_geom,0.0002)%20as%20the_geom'
  + '&$where=ntatype%3D%270%27&$limit=500';
// Same palette, in the same order, as categoryColors in MapView.
const AREA_COLORS = ['#ef4444', '#8b5a2b', '#22c55e', '#8b5cf6', '#c9a88c'];

const inNYC = c => c.lat >= 40.48 && c.lat <= 40.93 && c.lng >= -74.28 && c.lng <= -73.67;

async function loadNeighborhoods() {
  const path = fm.joinPath(cacheDir, 'nyc-nta.json');
  if (fm.fileExists(path) && (Date.now() - fm.modificationDate(path).getTime()) < 30 * 864e5) {
    return JSON.parse(fm.readString(path));
  }
  try {
    const json = await new Request(NTA_URL).loadJSON();
    fm.writeString(path, JSON.stringify(json));
    return json;
  } catch (e) {
    return fm.fileExists(path) ? JSON.parse(fm.readString(path)) : null;
  }
}

function inRing(lng, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Visited neighborhoods folded into everyday areas, most-visited first. */
function visitedAreas(collection, places) {
  const areas = new Map();
  for (const f of (collection && collection.features) || []) {
    if (!f.geometry || f.geometry.type !== 'MultiPolygon') continue;
    const count = places.filter(p => f.geometry.coordinates.some(poly => poly[0] && inRing(p.lng, p.lat, poly[0]))).length;
    if (!count) continue;
    const name = String(f.properties.ntaname || '').split(' (')[0].split('-')[0].trim();
    const area = areas.get(name) || { count: 0, polygons: [] };
    area.count += count;
    area.polygons.push(...f.geometry.coordinates);
    areas.set(name, area);
  }
  return [...areas.values()].sort((a, b) => b.count - a.count);
}

// ---------- drawing ----------

async function drawMap(places, center, w, h, dark, areas) {
  const scale = 2;
  const W = w * scale;
  const H = h * scale;
  const pad = 28 * scale;
  // The view spans W/2 x H/2 world pixels because tiles are drawn at 2x.
  const z = places.length > 1 ? fitZoom(places, W / 2, H / 2, pad / 2) : 14;
  const cx = worldX(center.lng, z);
  const cy = worldY(center.lat, z);
  const left = cx - W / 4;
  const top = cy - H / 4;

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = true;
  ctx.respectScreenScale = false;
  ctx.setFillColor(new Color(dark ? '#1f2124' : '#e9e9e7'));
  ctx.fillRect(new Rect(0, 0, W, H));

  // Tiles are drawn at 2x so the map stays crisp on retina widgets.
  const t0x = Math.floor(left / 256);
  const t0y = Math.floor(top / 256);
  const t1x = Math.floor((left + W / 2) / 256);
  const t1y = Math.floor((top + H / 2) / 256);
  for (let ty = t0y; ty <= t1y; ty++) {
    for (let tx = t0x; tx <= t1x; tx++) {
      const img = await tile(z, tx, ty, dark);
      if (img) ctx.drawImageInRect(img, new Rect((tx * 256 - left) * 2, (ty * 256 - top) * 2, 512, 512));
    }
  }

  // Coloured area washes under the markers, one colour per area.
  areas.forEach((area, i) => {
    const color = new Color(AREA_COLORS[i % AREA_COLORS.length], 0.26);
    for (const poly of area.polygons) {
      const ring = poly[0];
      if (!ring || ring.length < 3) continue;
      const path = new Path();
      ring.forEach(([lng, lat], k) => {
        const pt = new Point((worldX(lng, z) - left) * 2, (worldY(lat, z) - top) * 2);
        if (k === 0) path.move(pt); else path.addLine(pt);
      });
      path.closeSubpath();
      ctx.addPath(path);
      ctx.setFillColor(color);
      ctx.fillPath();
    }
  });

  const marker = 24 * scale;
  const font = Font.systemFont(13 * scale);
  ctx.setTextAlignedCenter();
  ctx.setFont(font);
  for (const p of places) {
    const x = (worldX(p.lng, z) - left) * 2;
    const y = (worldY(p.lat, z) - top) * 2;
    if (x < -marker || y < -marker || x > W + marker || y > H + marker) continue;
    const r = new Rect(x - marker / 2, y - marker / 2, marker, marker);
    ctx.setFillColor(new Color('#000000', 0.12));
    ctx.fillEllipse(new Rect(r.x, r.y + 2 * scale, marker, marker));
    ctx.setFillColor(new Color(dark ? '#2b2d31' : '#ffffff'));
    ctx.fillEllipse(r);
    ctx.drawTextInRect(EMOJI[p.category] || EMOJI.other, new Rect(r.x, r.y + 3.5 * scale, marker, marker));
  }
  return ctx.getImage();
}

function message(widget, text) {
  const t = widget.addText(text);
  t.font = Font.mediumSystemFont(13);
  t.textColor = Color.gray();
}

async function main() {
  const family = config.widgetFamily || 'large';
  const SIZES = { small: new Size(170, 170), medium: new Size(364, 170), large: new Size(364, 382), extraLarge: new Size(715, 330) };
  const size = SIZES[family] || SIZES.large;
  const dark = Device.isUsingDarkAppearance();
  const widget = new ListWidget();
  widget.url = APP_URL;
  widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  widget.setPadding(10, 12, 10, 12);

  const { places, signedIn } = await loadPlaces();
  if (!signedIn) {
    widget.backgroundColor = new Color(dark ? '#1f2124' : '#f3f0e8');
    message(widget, 'Open Scriptable and run this script once to sign in.');
    return widget;
  }

  const loc = await here();
  const me = loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  let nearby = me ? places.filter(p => km(me, p) <= NEARBY_KM) : [];
  if (nearby.length === 0) nearby = places;
  if (nearby.length === 0) {
    widget.backgroundColor = new Color(dark ? '#1f2124' : '#f3f0e8');
    message(widget, 'No places yet. Log a moment with a location in Evidence of Life.');
    return widget;
  }

  // Centre on the middle of the places' bounding box, which is what the zoom
  // was fitted to, so outlying places stay inside the frame.
  const lats = nearby.map(p => p.lat);
  const lngs = nearby.map(p => p.lng);
  const lat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const lng = (Math.min(...lngs) + Math.max(...lngs)) / 2;
  const areas = inNYC({ lat, lng }) ? visitedAreas(await loadNeighborhoods(), nearby) : [];
  widget.backgroundImage = await drawMap(nearby, { lat, lng }, size.width, size.height, dark, areas);

  let city = '';
  if (loc) {
    try {
      const geo = await Location.reverseGeocode(loc.latitude, loc.longitude);
      city = (geo[0] && (geo[0].locality || geo[0].administrativeArea)) || '';
    } catch (e) { /* label is optional */ }
  }
  if (!city) return widget;
  const label = widget.addStack();
  label.backgroundColor = new Color(dark ? '#1f2124' : '#ffffff', 0.86);
  label.cornerRadius = 9;
  label.setPadding(4, 8, 4, 8);
  const title = label.addText(city);
  title.font = Font.semiboldSystemFont(12);
  title.textColor = new Color(dark ? '#f2f2f2' : '#1b1b1b');
  widget.addSpacer();
  return widget;
}

const widget = await main();
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentLarge();
}
Script.complete();
