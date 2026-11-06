// Evidence of Life — home-screen widget for Scriptable (iOS).
//
// Large widget: a map of where you are with your places (🍚 food, ☕️ coffee,
// 🌳 outdoors, 🏛 culture, 📍 other; NYC areas in colour), today's todos, and
// three buttons — 📷 Camera, 🖼 Photos, ＋ Todo. The buttons open iOS's own
// camera / photo picker / text prompt, then save straight to your account
// with your current location, so it shows in today's Recap and on the Map.
//
// Connect once: in the app, Map → "Connect widget" copies a widget key.
// Run this script in Scriptable once; it reads the key from the clipboard
// and keeps it in the iOS Keychain. Revoke keys any time from the app.

const APP_URL = 'https://evilife.vercel.app/app';
const KEYCHAIN = 'evidence-of-life.widget-key';
const KEY_KIND = 'evidence-of-life/widget-key';
const CACHE_TODAY = 'evidence-of-life-today.json';
const NEARBY_KM = 25;
const TILE_DAYS = 14;
const SNAP_METERS = 60;

const EMOJI = { restaurant: '🍚', coffee: '☕️', park: '🌳', museum: '🏛', other: '📍' };

// iOS system palette (light / dark).
const IOS = {
  bg: Color.dynamic(new Color('#F2F2F7'), new Color('#1C1C1E')),
  card: Color.dynamic(new Color('#FFFFFF'), new Color('#2C2C2E')),
  label: Color.dynamic(new Color('#000000'), new Color('#FFFFFF')),
  secondary: Color.dynamic(new Color('#3C3C43', 0.6), new Color('#EBEBF5', 0.6)),
  blue: Color.dynamic(new Color('#007AFF'), new Color('#0A84FF')),
  fill: Color.dynamic(new Color('#787880', 0.12), new Color('#787880', 0.24)),
};

const fm = FileManager.local();
const cacheDir = fm.joinPath(fm.cacheDirectory(), 'evidence-of-life-widget');
if (!fm.fileExists(cacheDir)) fm.createDirectory(cacheDir, true);

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// ---------- connection ----------

function readKeyFromClipboard() {
  try {
    const json = JSON.parse(Pasteboard.paste() || '');
    if (json && json.kind === KEY_KIND && json.token && json.url && json.key) return json;
  } catch (e) { /* not ours */ }
  return null;
}

function connection() {
  if (!config.runsInWidget) {
    const fresh = readKeyFromClipboard();
    if (fresh) {
      Keychain.set(KEYCHAIN, JSON.stringify(fresh));
      Pasteboard.copy(''); // don't leave the key on the clipboard
      return { conn: fresh, justConnected: true };
    }
  }
  if (Keychain.contains(KEYCHAIN)) {
    try { return { conn: JSON.parse(Keychain.get(KEYCHAIN)), justConnected: false }; } catch (e) { /* fallthrough */ }
  }
  return { conn: null, justConnected: false };
}

async function api(conn, body) {
  const req = new Request(`${conn.url}/functions/v1/widget-api`);
  req.method = 'POST';
  req.headers = { 'Content-Type': 'application/json', apikey: conn.key, 'x-widget-token': conn.token };
  req.body = JSON.stringify(body);
  req.timeoutInterval = 30;
  const json = await req.loadJSON();
  if (req.response.statusCode === 401) {
    Keychain.remove(KEYCHAIN);
    throw new Error('This widget key was revoked. Connect again from the app.');
  }
  if (req.response.statusCode >= 400) throw new Error(json.error || 'Request failed');
  return json;
}

async function loadToday(conn) {
  const path = fm.joinPath(cacheDir, CACHE_TODAY);
  try {
    const data = await api(conn, { action: 'today', date: todayKey() });
    fm.writeString(path, JSON.stringify({ date: todayKey(), ...data }));
    return data;
  } catch (e) {
    if (fm.fileExists(path)) {
      const cached = JSON.parse(fm.readString(path));
      return { places: cached.places || [], todos: cached.date === todayKey() ? cached.todos || [] : [] };
    }
    return { places: [], todos: [] };
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
// Same muted palette as the app's Map view.
const AREA_COLORS = ['#d97757', '#7a9c6e', '#9e7bb5', '#a1734a', '#5d8fb3', '#c9a24a'];

/** Neighbouring areas (sharing a boundary vertex) never get the same colour. */
function areaColorIndexes(areas) {
  const keys = areas.map(a => {
    const set = new Set();
    for (const poly of a.polygons) for (const [lng, lat] of poly[0] || []) set.add(`${lng.toFixed(4)},${lat.toFixed(4)}`);
    return set;
  });
  const colors = [];
  areas.forEach((_, i) => {
    const taken = new Set();
    for (let j = 0; j < i; j++) {
      for (const k of keys[i]) { if (keys[j].has(k)) { taken.add(colors[j]); break; } }
    }
    let c = 0;
    while (taken.has(c) && c < AREA_COLORS.length - 1) c++;
    colors.push(c);
  });
  return colors;
}

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
  const colorIdx = areaColorIndexes(areas);
  areas.forEach((area, i) => {
    const color = new Color(AREA_COLORS[colorIdx[i]], 0.26);
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


// ---------- actions (run in Scriptable when a widget button is tapped) ----------

function meters(a, b) { return km(a, b) * 1000; }

/** Same rule as the app: snap to a place you've logged within 60 m, else reverse-geocode. */
async function placeHere(knownPlaces) {
  const loc = await here();
  if (!loc) return null;
  const me = { lat: loc.latitude, lng: loc.longitude };
  const nearest = knownPlaces
    .map(p => ({ p, d: meters(me, p) }))
    .filter(x => Number.isFinite(x.d))
    .sort((a, b) => a.d - b.d)[0];
  if (nearest && nearest.d <= SNAP_METERS) {
    return { name: nearest.p.name, lat: nearest.p.lat, lng: nearest.p.lng, category: nearest.p.category || 'other' };
  }
  let name = 'Current location';
  try {
    const g = (await Location.reverseGeocode(me.lat, me.lng))[0] || {};
    const poi = (g.areasOfInterest || [])[0];
    name = poi || [g.subThoroughfare, g.thoroughfare].filter(Boolean).join(' ') || g.name || g.locality || name;
  } catch (e) { /* keep default */ }
  return { name, lat: me.lat, lng: me.lng, category: 'other' };
}

/** Downscale to at most 1600 px on the long side and encode as JPEG. */
function jpegBase64(image) {
  const max = 1600;
  const { width, height } = image.size;
  const scale = Math.min(1, max / Math.max(width, height));
  if (scale >= 1) return Data.fromJPEG(image).toBase64String();
  const ctx = new DrawContext();
  ctx.size = new Size(Math.round(width * scale), Math.round(height * scale));
  ctx.respectScreenScale = false;
  ctx.drawImageInRect(image, new Rect(0, 0, ctx.size.width, ctx.size.height));
  return Data.fromJPEG(ctx.getImage()).toBase64String();
}

async function confirmMoment(place) {
  const a = new Alert();
  a.title = place ? `📍 ${place.name}` : 'No location';
  a.message = 'Add a line if you like.';
  a.addTextField('Optional');
  a.addAction('Save');
  a.addCancelAction('Cancel');
  if ((await a.presentAlert()) === -1) return null;
  return a.textFieldValue(0).trim();
}

async function captureFlow(conn, source) {
  const today = await loadToday(conn);
  const placePromise = placeHere(today.places);
  let image;
  try {
    image = source === 'camera' ? await Photos.fromCamera() : await Photos.fromLibrary();
  } catch (e) {
    return; // cancelled
  }
  const place = await placePromise;
  const text = await confirmMoment(place);
  if (text === null) return;
  await api(conn, {
    action: 'add-moment',
    date: todayKey(),
    text: text || undefined,
    location: place || undefined,
    photo: { contentType: 'image/jpeg', base64: jpegBase64(image) },
  });
  await done('Saved to today', place ? 'It’s in today’s Recap and on your Map.' : 'It’s in today’s Recap.');
}

async function addTodoFlow(conn) {
  const a = new Alert();
  a.title = 'Add to today';
  a.addTextField('What needs doing?');
  a.addAction('Add');
  a.addCancelAction('Cancel');
  if ((await a.presentAlert()) === -1) return;
  const title = a.textFieldValue(0).trim();
  if (!title) return;
  await api(conn, { action: 'add-todo', title, date: todayKey() });
  await done('Added', title);
}

async function toggleTodoFlow(conn, id, isDone) {
  await api(conn, { action: 'toggle-todo', id, done: isDone });
  await loadToday(conn);
}

async function done(title, message) {
  const a = new Alert();
  a.title = title;
  a.message = message;
  a.addAction('OK');
  await a.presentAlert();
}

// ---------- widget ----------

function runUrl(params) {
  const q = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `scriptable:///run/${encodeURIComponent(Script.name())}?${q}`;
}

function button(row, symbol, label, url) {
  const b = row.addStack();
  b.backgroundColor = IOS.card;
  b.cornerRadius = 12;
  b.setPadding(8, 10, 8, 10);
  b.centerAlignContent();
  b.url = url;
  const icon = b.addImage(SFSymbol.named(symbol).image);
  icon.imageSize = new Size(15, 15);
  icon.tintColor = IOS.blue;
  b.addSpacer(5);
  const t = b.addText(label);
  t.font = Font.semiboldSystemFont(13);
  t.textColor = IOS.blue;
  return b;
}

async function buildWidget(conn) {
  const widget = new ListWidget();
  widget.backgroundColor = IOS.bg;
  widget.setPadding(12, 12, 12, 12);
  widget.refreshAfterDate = new Date(Date.now() + 20 * 60 * 1000);
  widget.url = APP_URL;

  if (!conn) {
    const t = widget.addText('Connect your widget');
    t.font = Font.boldSystemFont(16);
    t.textColor = IOS.label;
    widget.addSpacer(6);
    const s = widget.addText('In Evidence of Life, open Map and tap “Connect widget”, then run this script once in Scriptable.');
    s.font = Font.systemFont(13);
    s.textColor = IOS.secondary;
    return widget;
  }

  const { places, todos } = await loadToday(conn);
  const dark = Device.isUsingDarkAppearance();

  // Map card (top ~55%).
  const loc = await here();
  const me = loc ? { lat: loc.latitude, lng: loc.longitude } : null;
  let nearby = me ? places.filter(p => km(me, p) <= NEARBY_KM) : [];
  if (nearby.length === 0) nearby = places;
  const mapStack = widget.addStack();
  mapStack.cornerRadius = 16;
  mapStack.size = new Size(0, 176);
  mapStack.setPadding(8, 8, 8, 8);
  mapStack.url = APP_URL;
  if (nearby.length > 0) {
    const lats = nearby.map(p => p.lat);
    const lngs = nearby.map(p => p.lng);
    const center = { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 };
    const areas = inNYC(center) ? visitedAreas(await loadNeighborhoods(), nearby) : [];
    mapStack.backgroundImage = await drawMap(nearby, center, 340, 176, dark, areas);
  } else {
    mapStack.backgroundColor = IOS.card;
  }
  let city = '';
  if (loc) {
    try {
      const g = (await Location.reverseGeocode(loc.latitude, loc.longitude))[0] || {};
      city = g.subLocality || g.locality || '';
    } catch (e) { /* optional */ }
  }
  if (city) {
    const pill = mapStack.addStack();
    pill.backgroundColor = IOS.card;
    pill.cornerRadius = 8;
    pill.setPadding(3, 7, 3, 7);
    const ct = pill.addText(city);
    ct.font = Font.semiboldSystemFont(11);
    ct.textColor = IOS.label;
  }
  mapStack.addSpacer();

  widget.addSpacer(10);

  // Today's todos.
  const head = widget.addStack();
  const h = head.addText('Today');
  h.font = Font.boldSystemFont(15);
  h.textColor = IOS.label;
  head.addSpacer();
  const open = todos.filter(t => !t.is_completed).length;
  const c = head.addText(todos.length ? `${open} left` : '');
  c.font = Font.systemFont(12);
  c.textColor = IOS.secondary;
  widget.addSpacer(4);
  if (todos.length === 0) {
    const e = widget.addText('Nothing planned yet.');
    e.font = Font.systemFont(13);
    e.textColor = IOS.secondary;
  }
  for (const todo of todos.slice(0, 3)) {
    const row = widget.addStack();
    row.centerAlignContent();
    row.url = runUrl({ action: 'toggle', id: todo.id, done: todo.is_completed ? '0' : '1' });
    const sym = row.addImage(SFSymbol.named(todo.is_completed ? 'checkmark.circle.fill' : 'circle').image);
    sym.imageSize = new Size(16, 16);
    sym.tintColor = todo.is_completed ? IOS.secondary : IOS.blue;
    row.addSpacer(7);
    const t = row.addText(todo.title);
    t.font = Font.systemFont(14);
    t.lineLimit = 1;
    t.textColor = todo.is_completed ? IOS.secondary : IOS.label;
    widget.addSpacer(3);
  }

  widget.addSpacer();

  // Buttons.
  const row = widget.addStack();
  button(row, 'camera.fill', 'Camera', runUrl({ action: 'camera' }));
  row.addSpacer(6);
  button(row, 'photo.on.rectangle', 'Photos', runUrl({ action: 'library' }));
  row.addSpacer(6);
  button(row, 'plus', 'Todo', runUrl({ action: 'todo' }));
  row.addSpacer();
  return widget;
}

// ---------- entry ----------

const { conn, justConnected } = connection();
const params = args.queryParameters || {};

if (!config.runsInWidget && conn && params.action) {
  try {
    if (params.action === 'camera' || params.action === 'library') await captureFlow(conn, params.action);
    else if (params.action === 'todo') await addTodoFlow(conn);
    else if (params.action === 'toggle' && params.id) await toggleTodoFlow(conn, params.id, params.done === '1');
  } catch (e) {
    await done('Couldn’t save', String(e.message || e));
  }
  Script.complete();
} else {
  if (justConnected) await done('Connected', 'Your widget is linked to your Evidence of Life account.');
  const widget = await buildWidget(conn);
  if (config.runsInWidget) Script.setWidget(widget);
  else await widget.presentLarge();
  Script.complete();
}
