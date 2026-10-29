import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import UploadPdfForm, { type UploadResult } from "@/components/admin/UploadPdfForm";

// Focused tests for the two-action upload form: Upload & Publish (default
// submit) vs Save as Draft, busy/double-submit handling, and the persistent
// server-confirmed success message. No network, storage, or database calls.

function renderForm(overrides: Partial<React.ComponentProps<typeof UploadPdfForm>> = {}) {
  const props: React.ComponentProps<typeof UploadPdfForm> = {
    onSubmit: vi.fn((e: React.FormEvent) => e.preventDefault()),
    onSaveDraft: vi.fn(),
    uploadParshaReady: true,
    parshaKey: "Vayeira",
    onParshaChange: vi.fn(),
    canonicalPubs: [],
    titleFreeText: true,
    publicationId: "",
    onPublicationSelectValue: vi.fn(),
    onChooseFromPublications: vi.fn(),
    title: "Stories for the Shabbos Table",
    onTitleChange: vi.fn(),
    uploadAudience: "",
    onUploadAudienceChange: vi.fn(),
    uploadFormatType: "",
    onUploadFormatTypeChange: vi.fn(),
    showUploadDetails: false,
    onToggleDetails: vi.fn(),
    uploadDescription: "",
    onUploadDescriptionChange: vi.fn(),
    onFileInputChange: vi.fn(),
    busyAction: null,
    uploadResult: null,
    msg: null,
    ...overrides,
  };
  render(<UploadPdfForm {...props} />);
  return props;
}

afterEach(cleanup);

describe("UploadPdfForm actions", () => {
  it("shows Upload & Publish as the primary submit and Save as Draft as secondary, with no Published checkbox", () => {
    renderForm();
    const publish = screen.getByRole("button", { name: "Upload & Publish" });
    expect(publish.getAttribute("type")).toBe("submit");
    const draft = screen.getByRole("button", { name: "Save as Draft" });
    expect(draft.getAttribute("type")).toBe("button");
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("default form submit (Enter) triggers onSubmit (publish), not draft", () => {
    const props = renderForm();
    const form = document.querySelector("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
    expect(props.onSaveDraft).not.toHaveBeenCalled();
  });

  it("Save as Draft triggers only onSaveDraft", () => {
    const props = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Save as Draft" }));
    expect(props.onSaveDraft).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
  });

  it("disables both buttons and shows publishing busy text while publishing", () => {
    renderForm({ busyAction: "publish" });
    const publish = screen.getByRole("button", { name: "Uploading & publishing…" });
    const draft = screen.getByRole("button", { name: "Save as Draft" });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect((draft as HTMLButtonElement).disabled).toBe(true);
  });

  it("disables both buttons and shows draft busy text while saving a draft", () => {
    renderForm({ busyAction: "draft" });
    const publish = screen.getByRole("button", { name: "Upload & Publish" });
    const draft = screen.getByRole("button", { name: "Saving draft…" });
    expect((publish as HTMLButtonElement).disabled).toBe(true);
    expect((draft as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("UploadPdfForm success confirmation", () => {
  const publishedResult: UploadResult = {
    id: "abc-123",
    title: "Stories for the Shabbos Table",
    parsha: "Vayeira",
    jewishYear: 5787,
    published: true,
  };

  it("published result shows status, title/parsha/year, and an Open PDF link to the real route", () => {
    renderForm({ uploadResult: publishedResult });
    expect(screen.getByText("Published — visible to readers")).toBeTruthy();
    expect(
      screen.getByText("Stories for the Shabbos Table · Parshas Vayeira · 5787"),
    ).toBeTruthy();
    const link = screen.getByRole("link", { name: "Open PDF" });
    expect(link.getAttribute("href")).toBe("/view/abc-123/pdf");
  });

  it("draft result says not visible to readers and offers no Open PDF link", () => {
    renderForm({ uploadResult: { ...publishedResult, published: false } });
    expect(screen.getByText("Saved as draft — not visible to readers")).toBeTruthy();
    expect(
      screen.getByText("Stories for the Shabbos Table · Parshas Vayeira · 5787"),
    ).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open PDF" })).toBeNull();
  });

  it("shows no success block when there is no result", () => {
    renderForm();
    expect(screen.queryByText(/visible to readers/)).toBeNull();
  });
});
