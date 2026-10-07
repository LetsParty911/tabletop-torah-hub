import { Link } from "@tanstack/react-router";

import { SiteLogoHorizontal } from "@/components/SiteLogo";

export function SiteFooter() {
  const linkClass =
    "hover:text-primary hover:underline transition-colors duration-150 after:content-['·'] after:mx-3 after:text-muted-foreground last:after:hidden";

  return (
    <footer id="site-footer" className="space-y-1.5 px-4 pb-6 pt-2.5 sm:pb-8 md:pb-10">
      <Link
        to="/"
        aria-label="Torah For The Table — home"
        className="mx-auto mb-3 flex w-fit flex-col items-center gap-2"
      >
        <SiteLogoHorizontal className="!text-[1.15rem] sm:!text-[1.35rem]" />
        <span aria-hidden="true" className="h-px w-40 bg-accent/45 sm:w-52" />
      </Link>
      <div className="flex flex-wrap items-center justify-center gap-y-1.5 text-center text-[0.82rem] sm:text-sm text-muted-foreground">
        <Link to="/" className={linkClass}>
          Home
        </Link>
        <Link to="/archive" className={linkClass}>
          Archive
        </Link>
        <Link to="/divrei-torah-parsha" className={linkClass}>
          Divrei Torah by Parsha
        </Link>
        <Link to="/publications" className={linkClass}>
          Publications
        </Link>
        <Link to="/short-vorts" className={linkClass}>
          Brief Insights
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
        © {new Date().getFullYear()} Torah For The Table
      </p>
      <p className="text-center text-xs text-muted-foreground">
        <Link
          to="/about"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Torah For The Table is a registered 501(c)(3) nonprofit organization.
        </Link>
      </p>
    </footer>
  );
}
