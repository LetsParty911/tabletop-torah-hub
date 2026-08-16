// PWA service-worker registration with preview safety guards.
// Never registers in dev, iframe previews, or Lovable preview hosts.
// Supports a kill switch via ?sw=off which unregisters existing workers.

declare const __BUILD_ID__: string;

const SW_URL = "/sw.js";
// Cache-busting build id: changing the script URL forces the browser to fetch
// and install the new worker, and the worker derives its cache names from it.
const BUILD_ID = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";
const SW_REGISTER_URL = `${SW_URL}?v=${encodeURIComponent(BUILD_ID)}`;

function isPreviewHost(host: string): boolean {
  if (host.startsWith("id-preview--") || host.startsWith("preview--")) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  return false;
}

async function unregisterMatching() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => {
          const url = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
          return url.split("?")[0]?.endsWith(SW_URL) ?? false;
        })
        .map((r) => r.unregister())
    );
  } catch {
    /* ignore */
  }
}

export function registerPwa() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  const url = new URL(window.location.href);
  const killSwitch = url.searchParams.get("sw") === "off";
  const inIframe = window.self !== window.top;
  const host = window.location.hostname;
  const refuse = !import.meta.env.PROD || inIframe || isPreviewHost(host) || killSwitch;

  if (refuse) {
    void unregisterMatching();
    return;
  }

  // Only a *replacement* of an existing controller means a new build took
  // over; the first-ever install claiming the page must not reload it.
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController || reloading) return;
    reloading = true;
    window.location.reload();
  });


  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_REGISTER_URL, { scope: "/" })
      .then((reg) => {
        const promote = (worker: ServiceWorker | null) => {
          if (!worker) return;
          const act = () => {
            // Only swap in a new build when the page is already controlled by
            // an older worker; the very first install must not reload.
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              worker.postMessage("SKIP_WAITING");
            }
          };
          act();
          worker.addEventListener("statechange", act);
        };

        promote(reg.waiting);
        reg.addEventListener("updatefound", () => promote(reg.installing));

        const checkForUpdate = () => {
          reg.update().catch(() => {
            /* offline or transient failure */
          });
        };

        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        window.setInterval(checkForUpdate, 30 * 60 * 1000);
      })
      .catch(() => {
        /* registration failure is non-fatal */
      });
  });
}

