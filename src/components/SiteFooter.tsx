import { Link } from "@tanstack/react-router";

import { SiteLogoFooter } from "@/components/SiteLogo";

export function SiteFooter() {
  const linkClass =
    "hover:text-primary hover:underline transition-colors duration-150 after:content-['·'] after:mx-3 after:text-muted-foreground last:after:hidden";

  return (
    <footer id="site-footer" className="space-y-2 px-4 pb-24 pt-4 md:pb-20">
      <Link to="/" aria-label="Torah for the Table — home" className="mx-auto mb-6 flex w-fit">
        <SiteLogoFooter />
      </Link>
      <div className="flex flex-wrap items-center justify-center gap-y-2 text-center text-sm text-muted-foreground">
        <Link to="/" className={linkClass}>
          Home
        </Link>
        <Link to="/archive" className={linkClass}>
          Archive
        </Link>
        <Link to="/publications" className={linkClass}>
          Publications
        </Link>
        <Link to="/short-vorts" className={linkClass}>
          Short Vorts
        </Link>
        <Link to="/resources" className={linkClass}>
          Resources
        </Link>
        <Link to="/about" className={linkClass}>
          About
        </Link>
        <Link to="/contact" className={linkClass}>
          Contact
        </Link>
        <Link to="/privacy" className={linkClass}>
          Privacy
        </Link>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Torah for the Table
      </p>
      <p className="text-center text-xs text-muted-foreground">
        <Link
          to="/about"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Torah For The Table is a registered 501(c)(3) nonprofit organization.
        </Link>
      </p>
      <p className="text-center text-xs text-muted-foreground/80">
        This product includes GeoLite Data created by{" "}
        <a
          href="https://www.maxmind.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          MaxMind
        </a>
        , available from{" "}
        <a
          href="https://www.maxmind.com"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          https://www.maxmind.com
        </a>
        .
      </p>
    </footer>
  );
}
