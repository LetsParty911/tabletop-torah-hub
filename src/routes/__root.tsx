import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
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
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/66d66607-a406-4b1e-ba15-ef8cb13eba06/id-preview-d1f0526a--ecc2dc14-06c9-413d-8b78-6436ae57c98e.lovable.app-1776630884092.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/66d66607-a406-4b1e-ba15-ef8cb13eba06/id-preview-d1f0526a--ecc2dc14-06c9-413d-8b78-6436ae57c98e.lovable.app-1776630884092.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
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
  return <Outlet />;
}
