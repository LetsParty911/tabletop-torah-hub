import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const track = vi.hoisted(() => vi.fn());
vi.mock("@/lib/first-party-analytics", () => ({ trackFp: track }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: { to: string; children: ReactNode }) => (
    <a href={to} {...rest}>{children}</a>
  ),
}));

import { FeaturedAudioBookCard } from "./FeaturedAudioBookCard";
import type { AudioBook } from "@/lib/parsha-audio-book";

const book: AudioBook = {
  id: "6b7c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e",
  parsha_key: "vayetzei",
  jewish_year: 5787,
  title: "Parsha Audio Book — Parshas Vayetzei",
  description: null,
  audio_path: "5787/vayetzei/6b7c1f2e-3a4d-4b5c-8d9e-0f1a2b3c4d5e.mp3",
  cover_path: null,
  published: true,
  created_at: "2026-11-12T00:00:00.000Z",
};

const text = (node: Element) => node.textContent?.replace(/\s+/g, " ").trim() ?? "";

afterEach(() => { cleanup(); track.mockClear(); });

describe("homepage audio card copy", () => {
  it("uses the Parsha Alive name with the come-alive tagline as one heading", () => {
    render(<FeaturedAudioBookCard book={book} />);
    const heading = screen.getByRole("heading", { level: 2 });
    expect(text(heading)).toBe("Parsha Alive — Hear the Parsha Come Alive!");
    // The old feature label must not survive as a second competing heading.
    expect(text(heading)).not.toContain("Parsha Audio Book");
  });

  it("keeps exactly one short description next to the listen action", () => {
    render(<FeaturedAudioBookCard book={book} />);
    const descriptions = screen.getAllByText("Exciting, professionally narrated Parsha storytelling for all ages.");
    expect(descriptions).toHaveLength(1);
    expect(screen.queryByText(/professionally narrated story, brought to life/)).toBeNull();
  });

  it("keeps the parsha-specific title and the single Listen Now action, with no added download control", () => {
    render(<FeaturedAudioBookCard book={book} />);
    expect(screen.getByText("Parshas Vayetzei")).toBeTruthy();
    const actions = screen.getAllByRole("link");
    expect(actions).toHaveLength(1);
    expect(text(actions[0])).toBe("Listen Now");
    expect(actions[0].getAttribute("href")).toBe("/parsha-audio-book");
    expect(screen.queryByRole("button", { name: /download/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /download/i })).toBeNull();
  });

  it("preserves the existing listen tracking event and placement", () => {
    render(<FeaturedAudioBookCard book={book} />);
    fireEvent.click(screen.getByRole("link", { name: "Listen Now" }));
    expect(track).toHaveBeenCalledTimes(1);
    expect(track.mock.calls[0][0]).toBe("recommendation_click");
    expect(track.mock.calls[0][1]).toMatchObject({
      publication_id: book.id,
      publication_title: book.title,
      parsha: "vayetzei",
      metadata: { placement: "homepage_featured_audio_book", content_type: "audio_book" },
    });
  });
});
