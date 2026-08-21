import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";
import { supabase } from "@/integrations/supabase/client";
import { registerPwa } from "@/pwa-register";
import { captureAttribution, trackPageView } from "@/lib/site-analytics";

import { SiteLogoHorizontal } from "@/components/SiteLogo";
import { getSafePostLoginRedirect, POST_LOGIN_REDIRECT_KEY } from "@/lib/auth-redirect";

// GTM is now the sole analytics path. GA4 is loaded via GTM (container GTM-WMVV6CJ7).
const GTM_CONTAINER_ID = "GTM-WMVV6CJ7";

declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

function GoogleAnalytics() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  // Load GTM (primary analytics container) on public routes only.
  useEffect(() => {
    if (isAdmin) return;
    if (typeof window === "undefined") return;
    if (!GTM_CONTAINER_ID) return;
    if (document.getElementById("gtm-src")) return;

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      "gtm.start": new Date().getTime(),
      event: "gtm.js",
    });

    const s = document.createElement("script");
    s.id = "gtm-src";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_CONTAINER_ID}`;
    document.head.appendChild(s);
  }, [isAdmin]);


  // GTM <noscript> iframe fallback — rendered into <body> on public routes only.
  // (Kept out of <head> to comply with HTML5 noscript content rules.)
  if (isAdmin || !GTM_CONTAINER_ID) return null;
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_CONTAINER_ID}`}
        height="0"
        width="0"
        style={{ display: "none", visibility: "hidden" }}
        title="gtm"
      />
    </noscript>
  );
}

function AuthRedirectHandler() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (typeof window === "undefined") return;

      const hasAuthCallback =
        window.location.search.includes("code=") ||
        window.location.hash.includes("access_token=") ||
        window.location.hash.includes("refresh_token=");

      if (hasAuthCallback) {
        try {
          await supabase.auth.exchangeCodeForSession(window.location.href);
        } catch {
          /* Lovable OAuth may already have restored the session. */
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;

      const saved = getSafePostLoginRedirect(
        window.sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY),
      );
      if (!saved) return;

      window.sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
      const current = window.location.pathname + window.location.search + window.location.hash;
      if (saved !== current) {
        window.location.replace(saved);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

function NotFoundComponent() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const previousTitle = document.title;
    document.title = "Page Not Found — Torah for the Table";
    let tag = document.querySelector('meta[name="robots"][data-notfound="1"]') as HTMLMetaElement | null;

    if (!tag) {
      tag = document.createElement("meta");
      tag.setAttribute("name", "robots");
      tag.setAttribute("data-notfound", "1");
      document.head.appendChild(tag);
    }
    tag.setAttribute("content", "noindex");
    return () => {
      document.title = previousTitle;
      tag?.parentNode?.removeChild(tag);
    };

  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">

      <div className="max-w-md text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          404
        </p>
        <h1 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
          Page not found
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Sorry, we couldn't find the page you were looking for.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Home
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Contact
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Contact
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      // Page-specific title, description, og:*, and twitter:* are set on leaf routes.
      { property: "og:type", content: "website" },
      // PWA
      { name: "theme-color", content: "#1A365D" },
      { name: "application-name", content: "Torah for the Table" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "Torah Table" },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/favicon-180x180.png" },

      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400;1,500;1,600&family=Inter:wght@400;500;600;700&display=swap" },
      // AI crawler discovery hints
      { rel: "alternate", type: "text/plain", href: "https://torahforthetable.com/llms.txt", title: "llms.txt" },
      { rel: "sitemap", type: "application/xml", href: "https://torahforthetable.com/sitemap.xml" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "Torah for the Table",
          url: "https://torahforthetable.com",
          logo: "https://torahforthetable.com/favicon.png",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "Torah for the Table",
          url: "https://torahforthetable.com",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function PwaRegistrar() {
  useEffect(() => {
    registerPwa();
  }, []);
  return null;
}

// First-party pageview tracking. Fires on every client-side route change
// (this is a SPA, so a load-only hook would undercount). Admin paths are
// skipped inside trackPageView.
function PageViewTracker() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    captureAttribution(pathname);
    trackPageView(pathname);
  }, [pathname]);
  return null;
}

function SiteNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdmin) return null;

  const linkCls =
    "font-serif whitespace-nowrap text-[11px] sm:text-base text-primary/80 hover:text-primary hover:underline transition-colors duration-150";
  const activeCls = "text-primary font-semibold";


  return (
    <nav
      aria-label="Primary"
      className="sticky top-0 z-40 border-b border-accent/30 bg-background/90 backdrop-blur-sm"
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <Link to="/" aria-label="Torah for the Table — home" className="shrink-0">
          <SiteLogoHorizontal />
        </Link>
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-6 overflow-x-auto">

          <Link to="/" activeOptions={{ exact: true }} className={linkCls} activeProps={{ className: `${linkCls} ${activeCls}` }}>
            Home
          </Link>
          <Link to="/short-vorts" className={linkCls} activeProps={{ className: `${linkCls} ${activeCls}` }}>
            Short Vorts
          </Link>
          <Link to="/resources" className={linkCls} activeProps={{ className: `${linkCls} ${activeCls}` }}>
            Resources
          </Link>
          <Link to="/about" className={linkCls} activeProps={{ className: `${linkCls} ${activeCls}` }}>
            About
          </Link>
          <Link to="/mission" className={linkCls} activeProps={{ className: `${linkCls} ${activeCls}` }}>
            Mission
          </Link>
          <Link to="/contact" className={linkCls} activeProps={{ className: `${linkCls} ${activeCls}` }}>
            Contact
          </Link>
        </div>
      </div>
    </nav>
  );
}

function RootComponent() {
  return (
    <>
      <AuthRedirectHandler />
      <GoogleAnalytics />
      <PageViewTracker />
      <PwaRegistrar />
      <SiteNav />
      <Outlet />
    </>
  );
}
