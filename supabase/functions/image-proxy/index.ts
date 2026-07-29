import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { authorizeImageProxy, corsHeaders, jsonResponse } from "../_shared/auth.ts";

// Block requests to private / loopback / link-local / cloud-metadata addresses (SSRF guard)
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return true;
  // IPv6 loopback / unique-local / link-local
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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const denied = authorizeImageProxy(req);
    if (denied) return denied;

    const requestUrl = new URL(req.url);
    const rawUrl = requestUrl.searchParams.get("url");
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) {
      return jsonResponse({ error: "Invalid URL" }, 400);
    }

    if (isBlockedHost(new URL(rawUrl).hostname)) {
      return new Response(JSON.stringify({ error: "Forbidden host" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const upstream = await fetch(rawUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; EvidenceOfLifeImageProxy/1.0)",
        "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
        "Referer": "https://www.bilibili.com/",
      },
    });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Upstream ${upstream.status}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const contentType = upstream.headers.get("content-type") || "image/jpeg";
    const cacheControl = upstream.headers.get("cache-control") || "public, max-age=86400";

    return new Response(upstream.body, {
      headers: {
        ...corsHeaders,
        "Content-Type": contentType,
        "Cache-Control": cacheControl,
      },
    });
  } catch (error) {
    console.error("image-proxy error:", error);
    return new Response(JSON.stringify({ error: "Failed to proxy image" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
