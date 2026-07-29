import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders, jsonResponse, requireUser } from "../_shared/auth.ts";

// Block requests to private / loopback / link-local / cloud-metadata addresses (SSRF guard)
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

function extractMeta(html: string, ...keys: string[]): string | null {
  for (const key of keys) {
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${key}["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+name=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${key}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return null;
}

function extractTitle(html: string): string | null {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match?.[1]?.replace(/\s+/g, " ").trim() || null;
}

function decodeBasicEntities(value: string | null): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function extractJsonField(source: string, field: string): string | undefined {
  const patterns = [
    new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`, "i"),
    new RegExp(`'${field}'\\s*:\\s*'([^']+)'`, "i"),
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match?.[1]) return decodeBasicEntities(match[1].replace(/\\u002F/g, "/"));
  }
  return undefined;
}

function tryParseJson<T>(raw: string | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function extractBilibiliInitialState(html: string) {
  const match =
    html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;\s*\(function/i) ||
    html.match(/window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?})\s*;/i);
  return match?.[1];
}

function extractBilibiliId(url: URL): { bvid?: string; aid?: string } {
  const bvidMatch = url.pathname.match(/\/video\/(BV[0-9A-Za-z]+)/i);
  if (bvidMatch?.[1]) return { bvid: bvidMatch[1] };
  const aidMatch = url.pathname.match(/\/video\/av(\d+)/i);
  if (aidMatch?.[1]) return { aid: aidMatch[1] };
  const bvidQuery = url.searchParams.get("bvid");
  if (bvidQuery) return { bvid: bvidQuery };
  const aidQuery = url.searchParams.get("aid");
  if (aidQuery) return { aid: aidQuery };
  return {};
}

async function tryBilibiliPreview(targetUrl: URL) {
  const { bvid, aid } = extractBilibiliId(targetUrl);
  if (!bvid && !aid) return null;

  const apiUrl = bvid
    ? `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`
    : `https://api.bilibili.com/x/web-interface/view?aid=${encodeURIComponent(aid!)}`;

  const response = await fetch(apiUrl, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; EvidenceOfLifeLinkPreview/1.0)",
      "Accept": "application/json",
      "Referer": "https://www.bilibili.com/",
    },
  });
  if (!response.ok) return null;
  const json = await response.json();
  const data = json?.data;
  if (!data) return null;

  return {
    url: targetUrl.toString(),
    title: typeof data.title === "string" ? data.title : undefined,
    description: typeof data.desc === "string" ? data.desc : undefined,
    image: typeof data.pic === "string" ? data.pic : undefined,
    siteName: "bilibili",
  };
}

function tryBilibiliHtmlPreview(html: string, finalUrl: URL) {
  const initialState = tryParseJson<any>(extractBilibiliInitialState(html));
  const videoData = initialState?.videoData || initialState?.props?.pageProps?.dehydratedState?.queries?.[0]?.state?.data?.videoData;

  const title =
    (typeof videoData?.title === "string" ? videoData.title : undefined) ||
    extractMeta(html, "og:title", "twitter:title") ||
    extractJsonField(html, "title") ||
    extractTitle(html);
  const description =
    (typeof videoData?.desc === "string" ? videoData.desc : undefined) ||
    extractMeta(html, "og:description", "twitter:description", "description") ||
    extractJsonField(html, "desc");
  const image =
    (typeof videoData?.pic === "string" ? videoData.pic : undefined) ||
    extractMeta(html, "og:image", "twitter:image") ||
    extractJsonField(html, "pic");

  if (!title && !image) return null;

  return {
    url: finalUrl.toString(),
    title: decodeBasicEntities(title),
    description: decodeBasicEntities(description),
    image: image ? new URL(image, finalUrl).toString() : undefined,
    siteName: "bilibili",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const { url } = await req.json();
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      return jsonResponse({ error: "Invalid URL" }, 400);
    }

    const targetUrl = new URL(url);
    if (isBlockedHost(targetUrl.hostname)) {
      return new Response(JSON.stringify({ error: "Forbidden host" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (/(\.|^)bilibili\.com$/i.test(targetUrl.hostname)) {
      const bilibiliPreview = await tryBilibiliPreview(targetUrl);
      if (bilibiliPreview) {
        return new Response(JSON.stringify(bilibiliPreview), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EvidenceOfLifeLinkPreview/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${response.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const finalUrl = response.url || url;
    const html = (await response.text()).slice(0, 250_000);
    const baseUrl = new URL(finalUrl);

    if (/(\.|^)bilibili\.com$/i.test(baseUrl.hostname)) {
      const bilibiliPreview =
        await tryBilibiliPreview(baseUrl) ||
        tryBilibiliHtmlPreview(html, baseUrl);
      if (bilibiliPreview) {
        return new Response(JSON.stringify(bilibiliPreview), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const rawTitle = extractMeta(html, "og:title", "twitter:title") || extractTitle(html);
    const rawDescription = extractMeta(html, "og:description", "twitter:description", "description");
    const rawImage = extractMeta(html, "og:image", "twitter:image");
    const rawSiteName = extractMeta(html, "og:site_name", "twitter:site");

    const image = rawImage ? new URL(rawImage, baseUrl).toString() : undefined;
    const payload = {
      url: finalUrl,
      title: decodeBasicEntities(rawTitle),
      description: decodeBasicEntities(rawDescription),
      image,
      siteName: decodeBasicEntities(rawSiteName) || baseUrl.hostname.replace(/^www\./, ""),
    };

    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("link-preview error:", error);
    return new Response(JSON.stringify({ error: "Failed to resolve preview" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
