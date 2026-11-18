import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { HeaderSearchToggle } from "./HeaderSearchToggle";
afterEach(cleanup);
describe("header search toggle", () => {
  it("shows the word Search and an accessible name that starts with it when closed", () => {
    const onToggle = vi.fn();
    render(<HeaderSearchToggle open={false} onToggle={onToggle} />);
    const button = screen.getByRole("button", { name: "Search Torah For The Table" });
    expect(button).toHaveProperty("textContent", "Search");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
  it("shows Close when the search panel is open", () => {
    render(<HeaderSearchToggle open onToggle={() => {}} />);
    const button = screen.getByRole("button", { name: "Close site search" });
    expect(button).toHaveProperty("textContent", "Close");
    expect(button.getAttribute("aria-expanded")).toBe("true");
  });
});
