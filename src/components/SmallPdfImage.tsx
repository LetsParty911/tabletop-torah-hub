import { useState } from "react";
import { smallThumbnailUrl } from "@/lib/thumbnail-preview";

/** Unconfirmed storage images use the original immediately. Bundled small
 * covers fall back to their original once; no broken-image loop. */
export function SmallPdfImage({ src, verifiedSmallSrc, onUnavailable, ...props }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string;
  verifiedSmallSrc?: string | null;
  onUnavailable: () => void;
}) {
  const [failedSmall, setFailedSmall] = useState<string | null>(null);
  const small = smallThumbnailUrl(src, verifiedSmallSrc);
  const original = Boolean(small && failedSmall === small);
  return <img {...props} src={original || !small ? src : small} onError={() => {
    if (!original && small) setFailedSmall(small);
    else onUnavailable();
  }} />;
}