import { createFileRoute } from "@tanstack/react-router";

const WIDTH = 1200;
const HEIGHT = 630;
const NAVY = "#1A365D";
const CREAM = "#FBF7EE";
const GOLD = "#B8912F";

/** Fetch a TTF for Playfair Display so the card matches the site's serif. */
async function loadSerif(weight: 400 | 700): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css?family=Playfair+Display:${weight}`,
      { headers: { "User-Agent": "Mozilla/5.0" }, cf: { cacheTtl: 86400 } } as RequestInit,
    );
    if (!css.ok) return null;
    const text = await css.text();
    const match = text.match(/src:\s*url\((https:[^)]+\.(?:ttf|otf))\)/);
    if (!match?.[1]) return null;
    const font = await fetch(match[1]);
    if (!font.ok) return null;
    return await font.arrayBuffer();
  } catch {
    return null;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildMarkup(parshaLabel: string, count: number) {
  const countLine =
    count > 0
      ? `${parshaLabel} — ${count} ${count === 1 ? "Dvar" : "Divrei"} Torah, ready to print`
      : `${parshaLabel} — Divrei Torah, ready to print`;

  return `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;height:100%;background-color:${CREAM};padding:80px;">
    <div style="display:flex;width:100%;height:100%;flex-direction:column;justify-content:center;align-items:center;border:6px solid ${GOLD};border-radius:24px;padding:64px;">
      <div style="display:flex;font-family:PlayfairDisplay;font-size:34px;letter-spacing:6px;color:${GOLD};text-transform:uppercase;">Torah for the Table</div>
      <div style="display:flex;width:160px;height:3px;background-color:${GOLD};margin-top:28px;margin-bottom:44px;"></div>
      <div style="display:flex;text-align:center;font-family:PlayfairDisplay;font-weight:700;font-size:70px;line-height:1.15;color:${NAVY};">${escapeHtml(countLine)}</div>
      <div style="display:flex;margin-top:48px;font-family:PlayfairDisplay;font-size:32px;color:${NAVY};opacity:0.75;">TorahForTheTable.com</div>
    </div>
  </div>`;
}

async function staticFallback(request: Request) {
  try {
    const res = await fetch(new URL("/og-image.png", request.url).toString());
    if (res.ok) {
      return new Response(res.body, {
        headers: {
          "Content-Type": "image/png",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  } catch {
    // fall through to redirect
  }
  return Response.redirect(new URL("/og-image.png", request.url).toString(), 302);
}

export const Route = createFileRoute("/og/$parsha.png")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const rawCount = Number(url.searchParams.get("count") ?? "0");
        const count = Number.isFinite(rawCount) ? Math.max(0, Math.min(99, Math.trunc(rawCount))) : 0;

        const raw = decodeURIComponent(params.parsha ?? "").slice(0, 60).trim();
        if (!raw) return staticFallback(request);
        const parshaLabel = /^(parshas|parashat)\s/i.test(raw) ? raw : `Parshas ${raw}`;

        // Serve from the edge cache when this parsha/count pair was rendered before.
        const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
        const cacheKey = new Request(url.toString(), { method: "GET" });
        if (cache) {
          const hit = await cache.match(cacheKey);
          if (hit) return hit;
        }

        try {
          const { ImageResponse } = await import("workers-og");
          const [regular, bold] = await Promise.all([loadSerif(400), loadSerif(700)]);
          const fonts = [
            ...(regular ? [{ name: "PlayfairDisplay", data: regular, weight: 400 as const }] : []),
            ...(bold ? [{ name: "PlayfairDisplay", data: bold, weight: 700 as const }] : []),
          ];

          const image = new ImageResponse(buildMarkup(parshaLabel, count), {
            width: WIDTH,
            height: HEIGHT,
            ...(fonts.length > 0 ? { fonts } : {}),
          });

          const body = await image.arrayBuffer();
          const response = new Response(body, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400, immutable",
            },
          });
          if (cache) await cache.put(cacheKey, response.clone());
          return response;
        } catch (e) {
          console.error("OG image generation failed", e);
          return staticFallback(request);
        }
      },
    },
  },
});
