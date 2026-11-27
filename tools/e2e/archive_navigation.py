"""Archive client-navigation check (Playwright, headless Chromium).

Usage: python3 tools/e2e/archive_navigation.py [BASE_URL]
Default BASE_URL is the local preview (http://localhost:8080).

Analytics endpoints and GTM are blocked so the run never records visits.
Each step asserts that the visible results change to match the new URL
without a manual reload, that a visible "Updating results…" status appears
while data is slowed down, and that browser Back/Forward and a full reload
(SSR) show the matching content.
"""
import asyncio, sys, time
from playwright.async_api import async_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
SLOW_MS = 1200  # artificial delay on archive data requests so pending UI is observable
failures = []

def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        failures.append(msg)

SIG = """() => {
  const groups = [...document.querySelectorAll('#archive-results h3')].map(h => h.textContent.trim());
  const first = document.querySelector('#archive-results h4')?.textContent.trim() || (document.body.innerText.includes('No matches') ? 'NO MATCHES' : '');
  return { url: location.pathname + location.search, groups, first, h1: document.querySelector('h1')?.textContent.trim() };
}"""

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(str(e)))
        await page.route(lambda u: "googletagmanager" in u or "google-analytics" in u or "/api/" in u or u.split("#")[0].endswith("/pdf"), lambda r: r.abort())

        async def slow(route):
            await asyncio.sleep(SLOW_MS / 1000)
            await route.continue_()
        await page.route("**/_serverFn/**", slow)

        await page.goto(BASE + "/archive", wait_until="networkidle", timeout=90000)
        await page.wait_for_timeout(1000)
        status = page.locator("main [role=status]").filter(has_text="Updating results")

        async def step(name, action, expect):
            before = await page.evaluate(SIG)
            await action()
            saw_pending = False
            for _ in range(80):
                if await status.count():
                    saw_pending = True
                now = await page.evaluate(SIG)
                if expect(now) and now != before and not await status.count():
                    break
                await page.wait_for_timeout(100)
            now = await page.evaluate(SIG)
            check(expect(now), f"{name}: content matches URL {now['url']} -> {now['groups'][:2]} / {now['first']}")
            return saw_pending, now

        selects = page.locator("select")
        saw, _ = await step("parsha filter", lambda: selects.nth(1).select_option(label="Toldos"),
                            lambda s: "parsha=Toldos" in s["url"] and s["groups"] == ["Parshas Toldos"])
        check(saw, "pending status visible while archive data loads")
        await step("audience filter", lambda: page.get_by_role("button", name="Filter by audience: Children").click(),
                   lambda s: "audience=Children" in s["url"])
        aria = await page.get_by_role("button", name="Filter by audience: Children").get_attribute("aria-label")
        check("selection" in aria and "publication" not in aria, f"audience chip label uses selections: {aria}")
        await step("clear filters", lambda: page.get_by_role("button", name="Clear filters").click(),
                   lambda s: s["url"] == "/archive" and len(s["groups"]) > 1)
        # During loading, the chosen filter stays visible instead of reverting.
        await selects.nth(1).select_option(label="Noach")
        await page.wait_for_timeout(300)
        check(await status.count() == 1 and await selects.nth(1).input_value() == "Noach",
              "chosen parsha stays selected while results update")
        check(await page.locator("#archive-results h4").count() == 0,
              "stale publication cards are not displayed during a pending archive request")
        await page.wait_for_timeout(SLOW_MS + 2000)
        await step("clear parsha", lambda: page.get_by_role("button", name="Clear filters").click(),
                   lambda s: s["url"] == "/archive")
        await step("year filter", lambda: selects.nth(0).select_option("5786"),
                   lambda s: "year=5786" in s["url"] and "%22" not in s["url"])
        await step("clear year", lambda: page.get_by_role("button", name="Clear filters").click(),
                   lambda s: s["url"] == "/archive")
        await step("search", lambda: page.locator("input[type=search]:visible").last.fill("noach"),
                   lambda s: "q=noach" in s["url"] and any("Noach" in g for g in s["groups"]))
        await step("clear search", lambda: page.get_by_role("button", name="Clear filters").click(),
                   lambda s: s["url"] == "/archive")
        _, page1 = await step("noop", lambda: asyncio.sleep(0), lambda s: True)
        await step("next page", lambda: page.get_by_role("button", name="Next →").click(),
                   lambda s: "page=2" in s["url"] and s["first"] != page1["first"])
        await step("browser back", lambda: page.go_back(), lambda s: s["url"] == "/archive" and s["first"] == page1["first"])
        await step("browser forward", lambda: page.go_forward(), lambda s: "page=2" in s["url"])
        await step("back again", lambda: page.go_back(), lambda s: s["url"] == "/archive")
        title = (await page.locator("#archive-results h4 a").first.text_content()).strip()
        await step("open result", lambda: page.locator("#archive-results h4 a").first.click(),
                   lambda s: s["url"].startswith("/view/") and s["h1"] == title)
        await step("back to archive", lambda: page.go_back(), lambda s: s["url"] == "/archive" and len(s["groups"]) > 1)

        # Full reload (SSR) of a filtered URL shows the same filtered content.
        await page.goto(BASE + "/archive?parsha=Toldos&audience=Children", wait_until="networkidle")
        s = await page.evaluate(SIG)
        check(s["groups"] == ["Parshas Toldos"], f"SSR reload of filtered URL: {s['groups']}")

        # Reader page: a related Dvar Torah opens, and one Back returns to the first.
        await page.goto(BASE + "/archive", wait_until="networkidle")
        await page.locator("#archive-results h4 a").first.click()
        await page.wait_for_url("**/view/**")
        await page.wait_for_timeout(SLOW_MS + 3000)
        first_title = (await page.locator("h1").first.text_content()).strip()
        related = page.locator("section", has_text="More Torah for this parsha").locator("a[href^='/view/']")
        if await related.count():
            target = (await related.first.locator("p").first.text_content()).strip()
            await related.first.click()
            await page.wait_for_timeout(SLOW_MS + 3000)
            check((await page.locator("h1").first.text_content()).strip() == target, f"related link opens {target}")
            await page.go_back(wait_until="commit", timeout=10000)
            await page.wait_for_timeout(SLOW_MS + 3000)
            check((await page.locator("h1").first.text_content()).strip() == first_title, "one Back returns to the previous reader page")

        check(not errors, f"no page errors ({errors[:2]})")

        # Mobile: no horizontal overflow on archive and homepage.
        m = await browser.new_context(viewport={"width": 390, "height": 844})
        mp = await m.new_page()
        await mp.route(lambda u: "googletagmanager" in u or "google-analytics" in u or "/api/" in u, lambda r: r.abort())
        for path in ["/", "/archive"]:
            await mp.goto(BASE + path, wait_until="networkidle", timeout=90000)
            sw, iw = await mp.evaluate("[document.documentElement.scrollWidth, window.innerWidth]")
            check(sw <= iw, f"mobile {path} no horizontal overflow ({sw} <= {iw})")
        await browser.close()
    print(f"\n{len(failures)} failure(s)")
    sys.exit(1 if failures else 0)

asyncio.run(main())
