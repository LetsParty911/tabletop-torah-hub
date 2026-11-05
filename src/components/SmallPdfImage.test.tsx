// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SmallPdfImage } from "./SmallPdfImage";
import { smallThumbnailUrl } from "@/lib/thumbnail-preview";
afterEach(cleanup);
describe("small preview fallback", () => {
  const src = "https://example.test/storage/v1/object/public/pdf-thumbs/8c7e8593-cebf-4bf4-b53c-ad41691cd3c9.png";
  it("tries the free public derivative then the same original exactly once", () => {
    const unavailable = vi.fn();
    render(<SmallPdfImage src={src} alt="First page" onUnavailable={unavailable} />);
    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toBe(src.replace(".png", ".small.webp"));
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe(src);
    expect(unavailable).not.toHaveBeenCalled();
    fireEvent.error(image);
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
  it("preserves permanent cover sources with small copies", () => {
    expect(smallThumbnailUrl("/publication-covers/mi-kaamcha-yisroel-permanent.jpg")).toBe("/publication-covers/mi-kaamcha-yisroel-small.webp");
    expect(smallThumbnailUrl("/publication-covers/torah-wellsprings-plaque-v2.jpg")).toBe("/publication-covers/torah-wellsprings-small.webp");
  });
  it("never converts arbitrary URLs to paid transformations", () => {
    expect(smallThumbnailUrl("https://example.test/cover.png")).toBeNull();
    expect(smallThumbnailUrl("http://localhost/private.png")).toBeNull();
  });
});