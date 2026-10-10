type AnalyticsProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    amplitude?: {
      init: (apiKey: string, userId?: string, options?: Record<string, unknown>) => void;
      track: (eventName: string, eventProperties?: Record<string, unknown>) => void;
      setUserId: (userId?: string) => void;
      reset?: () => void;
    };
  }
}

const GA_SCRIPT_ID = 'ga4-analytics-script';
const AMPLITUDE_SCRIPT_ID = 'amplitude-analytics-script';
const PENDING_SIGNUP_KEY = 'analytics.pending_signup';
const FIRST_TOUCH_KEY = 'analytics.first_touch';
const LAST_ACTIVE_DAY_PREFIX = 'analytics.last_active_day.';
/** An account counts as "just created" when its first sign-in is this close to creation. */
export const FRESH_ACCOUNT_WINDOW_MS = 10 * 60 * 1000;

let initialized = false;
/** Latest identity requested before the real Amplitude SDK finished loading. */
let pendingAmplitudeUserId: string | undefined;
let lastIdentifiedUserId: string | undefined;

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Private mode / blocked storage: analytics is best-effort.
  }
}

function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function injectScript(id: string, src: string) {
  if (typeof document === 'undefined' || document.getElementById(id)) return;

  const script = document.createElement('script');
  script.id = id;
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

function ensureGtagStub() {
  if (typeof window === 'undefined') return;
  if (!window.dataLayer) window.dataLayer = [];
  if (!window.gtag) {
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };
  }
}

function ensureAmplitudeStub() {
  if (typeof window === 'undefined' || window.amplitude) return;

  const queue: Array<{ eventName: string; eventProperties?: Record<string, unknown> }> = [];

  const stub: NonNullable<Window['amplitude']> = {
    init: () => undefined,
    track: (eventName, eventProperties) => {
      queue.push({ eventName, eventProperties });
    },
    setUserId: (userId) => {
      pendingAmplitudeUserId = userId;
    },
  };
  window.amplitude = stub;

  injectScript(AMPLITUDE_SCRIPT_ID, 'https://cdn.amplitude.com/script/2.41.0/amplitude.min.js');

  const attachReadyHandler = () => {
    const amp = window.amplitude;
    // The SDK replaces our stub on window when it loads. (Comparing amp.track
    // with window.amplitude.track was always true, so init never ran.)
    if (!amp || amp === stub || typeof amp.init !== 'function' || typeof amp.track !== 'function') {
      window.setTimeout(attachReadyHandler, 150);
      return;
    }

    const amplitudeKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
    if (amplitudeKey) {
      amp.init(amplitudeKey, undefined, {
        autocapture: true,
        defaultTracking: true,
      });
    }

    if (pendingAmplitudeUserId) amp.setUserId(pendingAmplitudeUserId);
    queue.splice(0).forEach(item => amp.track(item.eventName, item.eventProperties));
  };

  window.setTimeout(attachReadyHandler, 150);
}

export function initAnalytics() {
  if (initialized || typeof window === 'undefined') return;
  initialized = true;
  // Before any backend check, so attribution is kept even if analytics keys
  // are added later, and before the router can drop query params.
  captureFirstTouch();

  try {
    const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (gaMeasurementId) {
      injectScript(GA_SCRIPT_ID, `https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`);
      ensureGtagStub();
      window.gtag?.('js', new Date());
      window.gtag?.('config', gaMeasurementId, {
        send_page_view: false,
      });
    }

    const amplitudeKey = import.meta.env.VITE_AMPLITUDE_API_KEY;
    if (amplitudeKey) {
      ensureAmplitudeStub();
    }
  } catch (error) {
    console.warn('analytics: init failed', error);
  }
}

export function identifyUser(userId: string | null | undefined) {
  if (typeof window === 'undefined') return;
  initAnalytics();

  try {
    const normalizedUserId = userId || undefined;
    const signedOut = !normalizedUserId && !!lastIdentifiedUserId;
    lastIdentifiedUserId = normalizedUserId;

    if (normalizedUserId) {
      window.amplitude?.setUserId(normalizedUserId);
    } else if (signedOut) {
      // Only on an actual sign-out: resetting on every anonymous page load
      // would rotate the device id and break the landing → signup funnel.
      pendingAmplitudeUserId = undefined;
      if (window.amplitude?.reset) window.amplitude.reset();
      else window.amplitude?.setUserId(undefined);
    }

    const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID;
    if (gaMeasurementId && (normalizedUserId || signedOut)) {
      window.gtag?.('config', gaMeasurementId, {
        // null (not undefined) so GA actually clears a previous user_id.
        user_id: normalizedUserId ?? null,
        send_page_view: false,
      });
    }
  } catch (error) {
    console.warn('analytics: identify failed', error);
  }
}

export function trackEvent(eventName: string, properties: AnalyticsProperties = {}) {
  if (typeof window === 'undefined') return;
  initAnalytics();

  const payload = Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined)
  );

  // Analytics is best-effort and is called from click handlers: it must never
  // throw into the UI.
  try {
    if (import.meta.env.VITE_GA_MEASUREMENT_ID) {
      window.gtag?.('event', eventName, payload);
    }

    if (import.meta.env.VITE_AMPLITUDE_API_KEY) {
      window.amplitude?.track(eventName, payload);
    }
  } catch (error) {
    console.warn('analytics: failed to track', eventName, error);
  }
}

export function markPendingSignup(method: 'email' | 'google') {
  if (typeof window === 'undefined') return;
  writeStorage(PENDING_SIGNUP_KEY, method);
}

export function consumePendingSignup(): 'email' | 'google' | null {
  if (typeof window === 'undefined') return null;
  const method = readStorage(PENDING_SIGNUP_KEY);
  if (method === 'email' || method === 'google') {
    removeStorage(PENDING_SIGNUP_KEY);
    return method;
  }
  return null;
}

/**
 * True when the account was created within FRESH_ACCOUNT_WINDOW_MS of this
 * sign-in. Compares two server timestamps, so client clock skew can't affect
 * it. Guards account_created against firing on ordinary (Google) logins or a
 * stale pending-signup flag.
 */
export function isFreshAccount(createdAt?: string | null, lastSignInAt?: string | null): boolean {
  if (!createdAt || !lastSignInAt) return false;
  const created = Date.parse(createdAt);
  const signedIn = Date.parse(lastSignInAt);
  if (!Number.isFinite(created) || !Number.isFinite(signedIn)) return false;
  return Math.abs(signedIn - created) <= FRESH_ACCOUNT_WINDOW_MS;
}

const SAFE_ATTRIBUTION_VALUE = /[^\w.-]/g;

function cleanAttributionValue(value: string | null): string | undefined {
  if (!value) return undefined;
  const cleaned = value.replace(SAFE_ATTRIBUTION_VALUE, '').slice(0, 100);
  return cleaned || undefined;
}

type FirstTouch = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  ref?: string;
  landing_path?: string;
  referrer_host?: string;
};

/**
 * Records where a visitor first came from, once per browser. Stores only
 * sanitized UTM/ref values, the landing pathname (never search or hash, which
 * can carry auth tokens) and the referrer's host when it is another site.
 */
export function captureFirstTouch() {
  if (typeof window === 'undefined' || readStorage(FIRST_TOUCH_KEY)) return;

  const params = new URLSearchParams(window.location.search);
  let referrerHost: string | undefined;
  try {
    const ref = document.referrer ? new URL(document.referrer) : null;
    if (ref && ref.host && ref.host !== window.location.host) referrerHost = ref.host.slice(0, 100);
  } catch {
    referrerHost = undefined;
  }

  const touch: FirstTouch = {
    utm_source: cleanAttributionValue(params.get('utm_source')),
    utm_medium: cleanAttributionValue(params.get('utm_medium')),
    utm_campaign: cleanAttributionValue(params.get('utm_campaign')),
    ref: cleanAttributionValue(params.get('ref')),
    landing_path: window.location.pathname.slice(0, 100),
    referrer_host: referrerHost,
  };
  writeStorage(FIRST_TOUCH_KEY, JSON.stringify(touch));
}

/** First-touch attribution as `first_*` event properties ({} when unknown). */
export function getAttribution(): AnalyticsProperties {
  if (typeof window === 'undefined') return {};
  const raw = readStorage(FIRST_TOUCH_KEY);
  if (!raw) return {};
  try {
    const touch = JSON.parse(raw) as FirstTouch;
    return Object.fromEntries(
      Object.entries(touch)
        .filter(([, value]) => typeof value === 'string' && value.length > 0)
        .map(([key, value]) => [`first_${key}`, value]),
    );
  } catch {
    return {};
  }
}

function localDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fires day_returned when a signed-in user opens the app on a new local day.
 * Per device; SQL over created_at stays the source of truth for retention.
 */
export function trackDayReturned(userId: string, now: Date = new Date()) {
  if (typeof window === 'undefined' || !userId) return;
  const key = `${LAST_ACTIVE_DAY_PREFIX}${userId}`;
  const today = localDayKey(now);
  const previous = readStorage(key);
  if (previous && previous !== today) {
    const prevMs = Date.parse(`${previous}T00:00:00`);
    const todayMs = Date.parse(`${today}T00:00:00`);
    const daysSinceLast = Number.isFinite(prevMs) ? Math.round((todayMs - prevMs) / 86_400_000) : null;
    trackEvent('day_returned', { days_since_last: daysSinceLast });
  }
  if (previous !== today) writeStorage(key, today);
}

export function hasTrackedFirstAction(userId: string, actionName: string) {
  if (typeof window === 'undefined') return false;
  return readStorage(`analytics.first_action.${userId}.${actionName}`) === 'true';
}

export function markFirstActionTracked(userId: string, actionName: string) {
  if (typeof window === 'undefined') return;
  writeStorage(`analytics.first_action.${userId}.${actionName}`, 'true');
}
