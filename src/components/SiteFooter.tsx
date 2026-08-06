import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer
      id="site-footer"
      className="space-y-2 px-4 pb-24 pt-4 md:pb-20"
    >
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center text-sm text-muted-foreground">
        <Link
          to="/"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Home
        </Link>
        <span aria-hidden>·</span>
        <Link
          to="/archive"
          search={{}}
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Archive
        </Link>
        <span aria-hidden>·</span>
        <Link
          to="/about"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          About
        </Link>
        <span aria-hidden>·</span>
        <Link
          to="/contact"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Contact
        </Link>
        <span aria-hidden>·</span>
        <Link
          to="/mission"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Mission
        </Link>
        <span aria-hidden>·</span>
        <Link
          to="/privacy"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Privacy
        </Link>
      </div>
      <p className="text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Torah for the Table
      </p>
      <p className="text-center text-xs text-muted-foreground">
        <Link
          to="/mission"
          className="hover:text-primary hover:underline transition-colors duration-150"
        >
          Torah For The Table Inc. is a registered 501(c)(3) nonprofit organization.
        </Link>
      </p>
    </footer>
  );
}
