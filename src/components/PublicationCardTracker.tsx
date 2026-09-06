import type { ReactNode } from "react";
import { usePublicationImpression } from "@/hooks/use-publication-impression";
import { trackFp, type PublicationContext } from "@/lib/first-party-analytics";

type Props = PublicationContext & {
  className?: string;
  children: ReactNode;
};

/**
 * Wraps a publication card so it reports a deduped publication_impression
 * (>=50% visible for ~1s) and a publication_click only when the visitor opens
 * that publication. Download/share interactions inside the card do not count
 * as publication clicks. Presentation is unchanged — it renders the same
 * <article> element the card used before.
 */
export function PublicationCardTracker({ className, children, ...pub }: Props) {
  const ref = usePublicationImpression<HTMLElement>(pub);

  return (
    <article
      ref={ref}
      className={className}
      onClickCapture={(event) => {
        if (!pub.publication_id) return;
        const target = event.target;
        if (!(target instanceof Element)) return;

        const link = target.closest("a");
        const href = link?.getAttribute("href");
        if (!href) return;

        let pathname = href;
        try {
          pathname = new URL(href, window.location.origin).pathname;
        } catch {
          return;
        }

        const normalizedPath = pathname.replace(/\/+$/, "");
        const publicationPath = `/view/${pub.publication_id}`;
        if (normalizedPath !== publicationPath) return;

        trackFp("publication_click", pub);
      }}
    >
      {children}
    </article>
  );
}

export default PublicationCardTracker;
