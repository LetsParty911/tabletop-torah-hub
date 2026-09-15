from pathlib import Path

root = Path('src/routes/__root.tsx')
text = root.read_text()
desktop = '''            <Link
              to="/about"
              className={linkCls}
              activeProps={{ className: `${linkCls} ${activeCls}` }}
            >
              About
            </Link>
'''
desktop_new = desktop + '''            <Link
              to="/contact"
              className={linkCls}
              activeProps={{ className: `${linkCls} ${activeCls}` }}
            >
              Contact
            </Link>
'''
if desktop not in text:
    raise SystemExit('desktop About nav block not found')
text = text.replace(desktop, desktop_new, 1)
mobile = '''              <Link
                to="/about"
                className={mobileLinkCls}
                activeProps={{ className: `${mobileLinkCls} bg-accent/10 font-semibold` }}
              >
                About
              </Link>
'''
mobile_new = mobile + '''              <Link
                to="/contact"
                className={mobileLinkCls}
                activeProps={{ className: `${mobileLinkCls} bg-accent/10 font-semibold` }}
              >
                Contact
              </Link>
'''
if mobile not in text:
    raise SystemExit('mobile About nav block not found')
root.write_text(text.replace(mobile, mobile_new, 1))

index = Path('src/routes/index.tsx')
text = index.read_text()
anchor = '''  const shabbatShuvaLabel =
    isFallback && normalizedCurrentKey === "ha'azinu" && showYomKippurNotice
      ? `Shabbat Shuva / ${currentLabel}`
      : currentLabel;
'''
addition = anchor + '''  const heroDateLine = readingDate
    ? new Date(`${readingDate}T12:00:00Z`)
        .toLocaleDateString("en-US", {
          timeZone: "America/New_York",
          weekday: "long",
          month: "long",
          day: "numeric",
        })
        .replace(/^Saturday,/, "Shabbos,")
    : null;
'''
if anchor not in text:
    raise SystemExit('hero date anchor not found')
text = text.replace(anchor, addition, 1)

hero = '''            </h1>
            <p className="mx-auto mt-3 max-w-2xl font-serif text-base leading-relaxed text-primary sm:text-lg md:text-xl">
'''
hero_new = '''            </h1>
            {heroDateLine && (
              <p className="mt-2 font-sans text-xs font-semibold uppercase tracking-[0.14em] text-accent-readable sm:text-sm">
                {heroDateLine}
              </p>
            )}
            <p className="mx-auto mt-3 max-w-2xl font-serif text-base leading-relaxed text-primary sm:text-lg md:text-xl">
'''
if hero not in text:
    raise SystemExit('hero insertion point not found')
text = text.replace(hero, hero_new, 1)

featured = '''                  <div className="parchment-panel">
                    <h2 className="font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
                      This Week's Recommended Picks
                    </h2>
'''
featured_new = '''                  <div className="parchment-panel">
                    <p className="text-center font-sans text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-readable sm:text-xs">
                      <span aria-hidden="true">★</span> Featured
                    </p>
                    <h2 className="mt-1 font-serif text-2xl sm:text-3xl md:text-4xl font-bold text-primary text-center">
                      This Week's Recommended Picks
                    </h2>
'''
if featured not in text:
    raise SystemExit('featured anchor not found')
text = text.replace(featured, featured_new, 1)

old_filters = '                <div id="filters" className="mt-5 sticky top-14 z-30 -mx-3 bg-background/95 px-3 py-3 backdrop-blur border-b border-accent/20 sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-none sm:border-0 scroll-mt-24">\n'
new_filters = '                <div id="filters" className="mt-5 sticky top-14 sm:top-20 z-30 -mx-3 bg-background/95 px-3 py-3 backdrop-blur border-y border-accent/20 sm:mx-0 sm:rounded-xl sm:border sm:px-4 sm:shadow-sm scroll-mt-24">\n'
if old_filters not in text:
    raise SystemExit('filter wrapper not found')
text = text.replace(old_filters, new_filters, 1)

old_body = '                  <div className={`${filtersOpen ? "block" : "hidden"} mt-3 space-y-3 sm:mt-0 sm:block`}>\n'
new_body = '                  <div className={`${filtersOpen ? "block" : "hidden"} mt-3 space-y-3 sm:mt-0 sm:grid sm:grid-cols-3 sm:items-start sm:gap-4 sm:space-y-0`}>\n'
if old_body not in text:
    raise SystemExit('filter body not found')
text = text.replace(old_body, new_body, 1)
text = text.replace('                      <div className="hidden justify-end sm:flex">\n', '                      <div className="hidden justify-end sm:col-span-3 sm:flex">\n', 1)
index.write_text(text)
