import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Desktop header search trigger. Icon-only at md (keeps the nav on one line),
 * icon plus a visible word from lg up. The accessible name always begins with
 * the visible word so voice-control users can say what they see.
 */
export const HeaderSearchToggle = forwardRef<HTMLButtonElement, { open: boolean; onToggle: () => void }>(
  function HeaderSearchToggle({ open, onToggle }, ref) {
    return (
      <Button
        ref={ref}
        variant="ghost"
        type="button"
        aria-label={open ? "Close site search" : "Search Torah For The Table"}
        aria-expanded={open}
        onClick={onToggle}
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center gap-1.5 rounded-full border px-0 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 lg:w-auto lg:px-3.5 ${open ? "border-primary bg-primary text-primary-foreground hover:bg-primary/90" : "border-accent/35 bg-background text-primary hover:bg-accent/10"}`}
      >
        {open ? <X className="h-4 w-4" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
        <span className="hidden font-serif text-sm font-semibold lg:inline">{open ? "Close" : "Search"}</span>
      </Button>
    );
  },
);
