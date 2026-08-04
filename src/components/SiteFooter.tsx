import { Link } from "@tanstack/react-router";

export function SiteFooter() {
  return (
    <footer className="py-4 space-y-2">
      <div className="text-center text-sm text-muted-foreground flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <Link
        to="/"
        className="hover:text-primary hover:underline transition-colors duration-150"
      >
        Home
      </Link>
      <span aria-hidden>·</span>
      <Link
        to="/archive"
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
      <span aria-hidden>·</span>
      <span>© {new Date().getFullYear()} Torah for the Table</span>
      </div>
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
