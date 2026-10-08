import type { ComponentProps } from "react";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";

type Props = ComponentProps<typeof DownloadToPrintButton>;

/** A single direct Open PDF action used across all public collection cards. */
export function DownloadAndPrintButtons(props: Props) {
  return <DownloadToPrintButton {...props} />;
}
