/**
 * Cloudflare Pages Functions: Same-Origin Reverse Proxy for /api/*
 * 
 * Proxies incoming client requests from the Cloudflare Pages origin (*.pages.dev)
 * to the Render backend service (*.onrender.com).
 * 
 * Benefits:
 * - Keeps authentication cookies first-party (avoids cross-site third-party cookie blocks).
 * - Zero CPU overhead: streams request and response payloads directly via fetch.
 * - Fits within Cloudflare's 10 ms CPU execution limit because network I/O wait is excluded.
 */

interface Env {
  BACKEND_ORIGIN?: string;
}

export async function onRequest(context: {
  request: Request;
  env: Env;
}): Promise<Response> {
  const url = new URL(context.request.url);
  const targetOrigin = context.env.BACKEND_ORIGIN || "https://fss-backend.onrender.com";

  // Build target URL preserving the pathname and search query
  const targetUrl = new URL(url.pathname + url.search, targetOrigin);

  // Clone and forward request headers, setting forwarded origin headers
  const forwardHeaders = new Headers(context.request.headers);
  forwardHeaders.set("X-Forwarded-Host", url.hostname);
  forwardHeaders.set("X-Forwarded-Proto", "https");

  // Determine whether body can be forwarded
  const hasBody = !["GET", "HEAD"].includes(context.request.method.toUpperCase());

  try {
    const upstreamResponse = await fetch(targetUrl.toString(), {
      method: context.request.method,
      headers: forwardHeaders,
      body: hasBody ? context.request.body : undefined,
      redirect: "manual",
    });

    // Return the response directly to the client, preserving Set-Cookie and status codes
    return new Response(upstreamResponse.body, {
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      headers: upstreamResponse.headers,
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        error: "Upstream Proxy Failure",
        message: "Failed to connect to backend service. Server may be waking up.",
        details: error?.message || "Unknown proxy error",
      }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

