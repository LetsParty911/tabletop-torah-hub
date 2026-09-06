import type { ReactNode } from "react";
import { usePublicationImpression } from "@/hooks/use-publication-impression";
import { trackFp, type PublicationContext } from "@/lib/first-party-analytics";

type Props = PublicationContext & {
  className?: string;
  children: ReactNode;
};

/**
 * Wraps a publication card so it reports a deduped publication_impression
 * (>=50% visible for ~1s) and a publication_click when the visitor interacts
 * with anything inside the card. Presentation is unchanged — it renders the
 * same <article> element the card used before.
 */
export function PublicationCardTracker({ className, children, ...pub }: Props) {
  const ref = usePublicationImpression<HTMLElement>(pub);

  return (
    <article
      ref={ref}
      className={className}
      onClickCapture={() => trackFp("publication_click", pub)}
    >
      {children}
    </article>
  );
}

export default PublicationCardTracker;
