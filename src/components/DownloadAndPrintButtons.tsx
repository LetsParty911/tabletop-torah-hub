import type { ComponentProps } from "react";
import { Printer } from "lucide-react";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";
import { trackFp } from "@/lib/first-party-analytics";

type Props = ComponentProps<typeof DownloadToPrintButton>;

export function DownloadAndPrintButtons(props: Props) {
  const {
    publicationId,
    publicationName,
    publicationTitle,
    publicationSeries,
    publisher,
    parsha,
    jewishYear,
    className = "",
  } = props;

  const displayName = publicationName ?? publicationTitle;
  const printHref = publicationId
    ? `/view/${publicationId}/pdf`
    : props.href.replace(/\/download(?:\?.*)?$/, "/pdf");

  return (
    <div className="flex w-full flex-wrap items-center gap-2">
      <DownloadToPrintButton {...props} className={className} />
      <a
        href={printHref}
        target="_blank"
        rel="nofollow noopener noreferrer"
        onClick={() => {
          trackFp("print_click", {
            publication_id: publicationId ?? null,
            publication_title: publicationTitle ?? null,
            publication_series: publicationSeries ?? publicationName ?? null,
            publisher: publisher ?? null,
            parsha: parsha ?? null,
            jewish_year: jewishYear ?? null,
          });
        }}
        aria-label={displayName ? `Print ${displayName}` : "Print PDF"}
        className="inline-flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-primary/30 bg-background px-4 py-2 text-sm font-medium text-primary transition-colors duration-150 hover:border-accent hover:bg-accent/10 active:scale-[0.96] touch-manipulation"
      >
        <Printer className="h-4 w-4 shrink-0" />
        <span>Print PDF</span>
      </a>
    </div>
  );
}
