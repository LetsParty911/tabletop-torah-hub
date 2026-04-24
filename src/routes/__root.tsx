import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import appCss from "../styles.css?url";

const GA_MEASUREMENT_ID = "G-18CZTJF2FS";

declare global {
  interface Window {
    dataLayer: unknown[];
    gtag: (...args: unknown[]) => void;
  }
}

function GoogleAnalytics() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  useEffect(() => {
    if (isAdmin) return;
    if (typeof window === "undefined") return;
    if (document.getElementById("ga4-src")) return;

    const s = document.createElement("script");
    s.id = "ga4-src";
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(s);

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID);
  }, [isAdmin]);

  return null;
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <head>
        <meta name="robots" content="noindex" />
      </head>
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
            to="/archive"
            className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            Archive
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
      { title: "Torah for the Table" },
      {
        name: "description",
        content:
          "Weekly Torah resources for a more meaningful Shabbos and Yom Tov table.",
      },
      { property: "og:title", content: "Torah for the Table" },
      {
        property: "og:description",
        content: "Weekly Torah PDFs curated for Shabbos and Yom Tov.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Torah for the Table" },
      { name: "description", content: "Torah Table Connect allows users to view, download, and print Torah-related PDFs." },
      { property: "og:description", content: "Torah Table Connect allows users to view, download, and print Torah-related PDFs." },
      { name: "twitter:description", content: "Torah Table Connect allows users to view, download, and print Torah-related PDFs." },
      { property: "og:image", content: "https://torahforthetable.com/og-image.png" },
      { name: "twitter:image", content: "https://torahforthetable.com/og-image.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
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

function RootComponent() {
  return (
    <>
      <GoogleAnalytics />
      <Outlet />
    </>
  );
}
