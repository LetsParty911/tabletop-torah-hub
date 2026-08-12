import { createFileRoute } from "@tanstack/react-router";

const WIDTH = 1200;
const HEIGHT = 630;
const NAVY = "#1A365D";
const CREAM = "#FBF7EE";
const GOLD = "#B8912F";

const YOGA_WASM_URL = "https://unpkg.com/satori@0.29.0/yoga.wasm";
const RESVG_WASM_URL = "https://unpkg.com/@resvg/resvg-wasm@2.6.2/index_bg.wasm";

type SerifFonts = { regular: ArrayBuffer; bold: ArrayBuffer };

let rendererPromise: Promise<{
  satori: typeof import("satori/standalone").default;
  Resvg: typeof import("@resvg/resvg-wasm").Resvg;
}> | null = null;
let fontsPromise: Promise<SerifFonts> | null = null;

async function fetchWasm(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch wasm: ${url}`);
  return res.arrayBuffer();
}

/** Compile the layout + raster engines once per isolate. */
function getRenderer() {
  if (!rendererPromise) {
    rendererPromise = (async () => {
      const [{ default: satori, init }, resvg] = await Promise.all([
        import("satori/standalone"),
        import("@resvg/resvg-wasm"),
      ]);
      const [yogaBytes, resvgBytes] = await Promise.all([
        fetchWasm(YOGA_WASM_URL),
        fetchWasm(RESVG_WASM_URL),
      ]);
      await init(yogaBytes);
      try {
        await resvg.initWasm(resvgBytes);
      } catch (e) {
        // A hot-reloaded module may have initialized resvg already; that's fine.
        if (!String((e as Error)?.message ?? e).includes("Already initialized")) throw e;
      }
      return { satori, Resvg: resvg.Resvg };
    })().catch((e) => {
      rendererPromise = null;
      throw e;
    });
  }
  return rendererPromise;
}

/** Playfair Display TTFs so the card matches the site's serif. */
function getFonts() {
  if (!fontsPromise) {
    fontsPromise = (async () => {
      const load = async (weight: 400 | 700) => {
        const css = await fetch(
          `https://fonts.googleapis.com/css?family=Playfair+Display:${weight}`,
          { headers: { "User-Agent": "Mozilla/5.0 (compatible; TorahForTheTable/1.0)" } },
        );
        if (!css.ok) throw new Error("font css fetch failed");
        const match = (await css.text()).match(/url\((https:[^)]+\.(?:ttf|otf))\)/);
        if (!match?.[1]) throw new Error("no ttf url in font css");
        const font = await fetch(match[1]);
        if (!font.ok) throw new Error("font fetch failed");
        return font.arrayBuffer();
      };
      const [regular, bold] = await Promise.all([load(400), load(700)]);
      return { regular, bold };
    })().catch((e) => {
      fontsPromise = null;
      throw e;
    });
  }
  return fontsPromise;
}

type Node = { type: string; props: Record<string, unknown> };
const el = (type: string, props: Record<string, unknown>): Node => ({ type, props });

let watermarkPromise: Promise<string | null> | null = null;

/** Circular brand icon, inlined as a data URI so satori can draw it. */
function getWatermark(request: Request) {
  if (!watermarkPromise) {
    watermarkPromise = (async () => {
      const res = await fetch(new URL("/og-icon.png", request.url).toString());
      if (!res.ok) return null;
      const bytes = new Uint8Array(await res.arrayBuffer());
      let binary = "";
      for (const b of bytes) binary += String.fromCharCode(b);
      return `data:image/png;base64,${btoa(binary)}`;
    })().catch(() => {
      watermarkPromise = null;
      return null;
    });
  }
  return watermarkPromise;
}

/** Trim to a word boundary so long publication titles never overflow. */
function clampText(value: string, max: number) {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function buildTree(
  parshaLabel: string,
  count: number,
  pubTitle: string | null,
  watermark: string | null,
): Node {
  // Publication cards lead with the title; the weekly card leads with the parsha.
  const headline = pubTitle
    ? clampText(pubTitle, 62)
    : count > 0
      ? `${parshaLabel} — ${count} ${count === 1 ? "Dvar" : "Divrei"} Torah, ready to print`
      : `${parshaLabel} — Divrei Torah, ready to print`;

  const subline = pubTitle ? parshaLabel || "Divrei Torah, ready to print" : null;

  const headlineSize = headline.length > 46 ? (headline.length > 62 ? 50 : 58) : 68;

  return el("div", {
    style: {
      display: "flex",
      position: "relative",
      width: "100%",
      height: "100%",
      padding: 56,
      backgroundColor: CREAM,
      fontFamily: "Playfair Display",
    },
    children: [
      el("div", {
      style: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: "100%",
        height: "100%",
        border: `5px solid ${GOLD}`,
        borderRadius: 22,
        padding: 56,
        backgroundColor: CREAM,
      },
      children: [

        el("div", {
          style: {
            fontSize: 30,
            letterSpacing: 8,
            textTransform: "uppercase",
            color: GOLD,
          },
          children: "Torah for the Table",
        }),
        el("div", {
          style: { width: 150, height: 3, backgroundColor: GOLD, margin: "30px 0 44px" },
        }),
        el("div", {
          style: {
            display: "flex",
            textAlign: "center",
            fontSize: headlineSize,
            fontWeight: 700,
            lineHeight: 1.2,
            color: NAVY,
            maxWidth: 940,
          },
          children: headline,
        }),
        ...(subline
          ? [
              el("div", {
                style: {
                  display: "flex",
                  marginTop: 26,
                  textAlign: "center",
                  fontSize: 38,
                  color: NAVY,
                  opacity: 0.8,
                  maxWidth: 940,
                },
                children: subline,
              }),
            ]
          : []),
        el("div", {
          style: { marginTop: 46, fontSize: 30, color: NAVY, opacity: 0.72 },
          children: "TorahForTheTable.com",
        }),
      ],
      }),
      ...(watermark
        ? [
            el("img", {
              src: watermark,
              width: 104,
              height: 104,
              style: { position: "absolute", right: 84, bottom: 84 },
            }),
          ]
        : []),
    ],
  });
}

async function staticFallback(request: Request) {
  try {
    const res = await fetch(new URL("/og-image.png", request.url).toString());
    if (res.ok) {
      return new Response(res.body, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" },
      });
    }
  } catch {
    // fall through to redirect
  }
  return Response.redirect(new URL("/og-image.png", request.url).toString(), 302);
}

export const Route = createFileRoute("/og/image.png")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rawCount = Number(url.searchParams.get("count") ?? "0");
        const count = Number.isFinite(rawCount)
          ? Math.max(0, Math.min(99, Math.trunc(rawCount)))
          : 0;

        const raw = (url.searchParams.get("parsha") ?? "").slice(0, 60).trim();
        const pubTitle = (url.searchParams.get("title") ?? "").slice(0, 120).trim() || null;
        // A card needs at least one of parsha / title to say anything useful.
        if (!raw && !pubTitle) return staticFallback(request);
        const parshaLabel = !raw
          ? ""
          : /^(parshas|parashat)\s/i.test(raw)
            ? raw
            : `Parshas ${raw}`;

        // Edge cache keyed on the full query so each card renders at most once.
        const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
        const cacheKey = new Request(url.toString(), { method: "GET" });
        if (cache) {
          const hit = await cache.match(cacheKey);
          if (hit) return hit;
        }

        try {
          const [{ satori, Resvg }, fonts, watermark] = await Promise.all([
            getRenderer(),
            getFonts(),
            getWatermark(request),
          ]);

          const svg = await satori(buildTree(parshaLabel, count, pubTitle, watermark) as never, {
            width: WIDTH,
            height: HEIGHT,
            fonts: [
              { name: "Playfair Display", data: fonts.regular, weight: 400, style: "normal" },
              { name: "Playfair Display", data: fonts.bold, weight: 700, style: "normal" },
            ],
          });

          const png = new Resvg(svg, { fitTo: { mode: "width", value: WIDTH } })
            .render()
            .asPng();

          const response = new Response(png as unknown as BodyInit, {
            headers: {
              "Content-Type": "image/png",
              "Cache-Control": "public, max-age=86400, immutable",
            },
          });
          if (cache) await cache.put(cacheKey, response.clone());
          return response;
        } catch (e) {
          console.error("OG image generation failed", e);
          if (url.searchParams.get("debug") === "1") {
            return new Response(String((e as Error)?.stack ?? e), { status: 500 });
          }
          return staticFallback(request);
        }
      },
    },
  },
});
