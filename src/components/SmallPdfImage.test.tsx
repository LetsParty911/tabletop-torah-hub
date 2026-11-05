// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SmallPdfImage } from "./SmallPdfImage";
import { smallThumbnailUrl } from "@/lib/thumbnail-preview";
afterEach(cleanup);
describe("small preview fallback", () => {
  const src = "https://example.test/storage/v1/object/public/pdf-thumbs/8c7e8593-cebf-4bf4-b53c-ad41691cd3c9.png";
  it("uses the original immediately when storage derivative availability is unconfirmed", () => {
    expect(smallThumbnailUrl(src)).toBeNull();
    const unavailable = vi.fn();
    render(<SmallPdfImage src={src} alt="First page" onUnavailable={unavailable} />);
    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toBe(src);
    fireEvent.error(image);
    expect(unavailable).toHaveBeenCalledTimes(1);
    expect(image.getAttribute("src")).toBe(src);
  });
  it("tries the bundled permanent cover then its original exactly once", () => {
    const src = "/publication-covers/mi-kaamcha-yisroel-permanent.jpg";
    const unavailable = vi.fn();
    render(<SmallPdfImage src={src} alt="First page" onUnavailable={unavailable} />);
    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toBe("/publication-covers/mi-kaamcha-yisroel-small.webp");
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
  it("falls back from a verified version and resets for a new replacement URL", () => {
    const small = src.replace(".png", `.${"a".repeat(32)}.small.webp`);
    const replacement = src.replace(".png", `.${"b".repeat(32)}.small.webp`);
    const unavailable = vi.fn();
    const { rerender } = render(<SmallPdfImage src={src} verifiedSmallSrc={small} alt="Cover" onUnavailable={unavailable} />);
    const image = screen.getByRole("img");
    expect(image.getAttribute("src")).toBe(small);
    fireEvent.error(image);
    expect(image.getAttribute("src")).toBe(src);
    rerender(<SmallPdfImage src={src} verifiedSmallSrc={replacement} alt="Cover" onUnavailable={unavailable} />);
    expect(image.getAttribute("src")).toBe(replacement);
    expect(unavailable).not.toHaveBeenCalled();
  });
  it("rejects another publication or origin even when provided as verified", () => {
    expect(smallThumbnailUrl(src, src.replace("example.test", "other.test"))).toBeNull();
    expect(smallThumbnailUrl(src, src.replace("8c7e8593", "1c7e8593").replace(".png", `.${"a".repeat(32)}.small.webp`))).toBeNull();
  });
});