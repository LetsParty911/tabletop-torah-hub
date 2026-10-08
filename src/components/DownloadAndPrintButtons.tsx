import type { ComponentProps } from "react";
import { DownloadToPrintButton } from "@/components/DownloadToPrintButton";

type Props = ComponentProps<typeof DownloadToPrintButton>;

/**
 * Card-level download row. The Print PDF button itself lives inside
 * DownloadToPrintButton (with its print_click/print_fallback_open tracking),
 * so this wrapper adds no second button.
 */
export function DownloadAndPrintButtons(props: Props) {
  return <DownloadToPrintButton {...props} />;
}
