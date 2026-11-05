import { useState } from "react";
import { smallThumbnailUrl } from "@/lib/thumbnail-preview";

/** Unconfirmed storage images use the original immediately. Bundled small
 * covers fall back to their original once; no broken-image loop. */
export function SmallPdfImage({ src, onUnavailable, ...props }: Omit<React.ImgHTMLAttributes<HTMLImageElement>, "src" | "onError"> & {
  src: string;
  onUnavailable: () => void;
}) {
  const [original, setOriginal] = useState(false);
  const small = smallThumbnailUrl(src);
  return <img {...props} src={original || !small ? src : small} onError={() => {
    if (!original && small) setOriginal(true);
    else onUnavailable();
  }} />;
}