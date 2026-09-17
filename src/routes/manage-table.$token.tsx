import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { SiteFooter } from "@/components/SiteFooter";
import {
  getSubscriberPreferences,
  saveSubscriberPreferences,
  type SubscriberPreferences,
} from "@/integrations/supabase/subscriber-preferences.functions";

export const Route = createFileRoute("/manage-table/$token")({
  component: ManageTablePage,
  head: () => ({
    meta: [
      { title: "Manage My Table — Torah for the Table" },
      {
        name: "description",
        content: "Choose the kinds of Divrei Torah you want in your weekly Torah for the Table email.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type State =
  | { kind: "loading" }
  | { kind: "invalid" }
  | { kind: "ready"; preferences: SubscriberPreferences; configured: boolean }
  | { kind: "saving"; preferences: SubscriberPreferences }
  | { kind: "saved"; preferences: SubscriberPreferences }
  | { kind: "error"; preferences: SubscriberPreferences; message: string };

const preferenceOptions: Array<{
  key: keyof Pick<
    SubscriberPreferences,
    | "wantsChildren"
    | "wantsFamilyStory"
    | "wantsQuickVort"
    | "wantsQuestions"
    | "wantsHalacha"
    | "wantsDeeper"
  >;
  title: string;
  description: string;
}> = [
  {
    key: "wantsChildren",
    title: "Something for children",
    description: "Kid-friendly Torah that is easier to read or bring to the table.",
  },
  {
    key: "wantsFamilyStory",
    title: "A family story",
    description: "Story-led Torah that works well for a mixed-age Shabbos table.",
  },
  {
    key: "wantsQuickVort",
    title: "A quick vort",
    description: "A short piece for when you want something meaningful without a long read.",
  },
  {
    key: "wantsQuestions",
    title: "Questions or Q&A",
    description: "Material that gives the table something to ask, answer, or discuss together.",
  },
  {
    key: "wantsHalacha",
    title: "Practical halacha",
    description: "Halachic material suitable for Shabbos or Yom Tov discussion.",
  },
  {
    key: "wantsDeeper",
    title: "Deeper learning",
    description: "Longer or more in-depth Torah for adults who want more study material.",
  },
];

function ManageTablePage() {
  const { token } = Route.useParams();
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await getSubscriberPreferences({ data: { token } });
        if (cancelled) return;
        if (!result.valid) {
          setState({ kind: "invalid" });
          return;
        }
        setState({
          kind: "ready",
          preferences: result.preferences,
          configured: result.configured,
        });
      } catch {
        if (!cancelled) setState({ kind: "invalid" });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const current =
    state.kind === "ready" ||
    state.kind === "saving" ||
    state.kind === "saved" ||
    state.kind === "error"
      ? state.preferences
      : null;

  const update = (next: SubscriberPreferences) => {
    setState({ kind: "ready", preferences: next, configured: true });
  };

  const handleSave = async () => {
    if (!current) return;
    const snapshot = current;
    setState({ kind: "saving", preferences: snapshot });
    try {
      const result = await saveSubscriberPreferences({
        data: { token, preferences: snapshot },
      });
      if (!result.ok) {
        setState({
          kind: "error",
          preferences: snapshot,
          message: result.error ?? "Could not save your preferences.",
        });
        return;
      }
      setState({ kind: "saved", preferences: snapshot });
    } catch {
      setState({
        kind: "error",
        preferences: snapshot,
        message: "Could not save your preferences. Please try again.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <section className="parchment-frame">
          <div className="parchment-panel text-center">
            <p className="font-sans text-[0.65rem] font-bold uppercase tracking-[0.2em] text-accent-readable">
              Weekly email preferences
            </p>
            <h1 className="mt-2 font-serif text-3xl font-bold text-primary sm:text-4xl">
              Manage My Table
            </h1>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Tell us what kind of Torah is most useful at your table. We will use these preferences to shape your weekly selections as personalized delivery rolls out.
            </p>
          </div>
        </section>

        {state.kind === "loading" && (
          <p className="mt-8 text-center text-muted-foreground">Checking your private link…</p>
        )}

        {state.kind === "invalid" && (
          <section className="mt-8 rounded-2xl border border-accent/30 bg-card/40 p-7 text-center">
            <h2 className="font-serif text-2xl font-semibold text-primary">This link is no longer valid</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Preference links are tied to an active Torah for the Table subscription. You can subscribe again from the homepage if needed.
            </p>
            <a
              href="/"
              className="mt-5 inline-flex rounded-full bg-primary px-5 py-2.5 font-serif font-semibold text-primary-foreground hover:bg-accent hover:text-accent-foreground"
            >
              Return to homepage
            </a>
          </section>
        )}

        {current && (
          <>
            <section className="mt-8 rounded-2xl border border-accent/30 bg-card/35 p-5 sm:p-6">
              <h2 className="font-serif text-2xl font-semibold text-primary">What belongs at your table?</h2>
              <p className="mt-1 text-sm text-muted-foreground">Choose as many as you like.</p>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {preferenceOptions.map((option) => {
                  const checked = Boolean(current[option.key]);
                  return (
                    <label
                      key={option.key}
                      className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                        checked
                          ? "border-accent bg-accent/10"
                          : "border-accent/30 bg-background/60 hover:border-accent/60"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) =>
                            update({ ...current, [option.key]: event.target.checked })
                          }
                          className="mt-1 h-4 w-4 accent-[hsl(var(--primary))]"
                        />
                        <div>
                          <p className="font-serif font-semibold text-primary">{option.title}</p>
                          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                            {option.description}
                          </p>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 rounded-2xl border border-accent/30 bg-card/35 p-5 sm:p-6">
              <h2 className="font-serif text-xl font-semibold text-primary">How long is too long?</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional. We can use this as a ceiling when choosing shorter weekly material.
              </p>
              <select
                value={current.maxPages ?? ""}
                onChange={(event) =>
                  update({
                    ...current,
                    maxPages: event.target.value ? Number(event.target.value) : null,
                  })
                }
                className="mt-4 h-11 w-full rounded-xl border border-accent/35 bg-background px-3 text-sm text-foreground outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 sm:max-w-xs"
              >
                <option value="">No page limit</option>
                <option value="1">1 page</option>
                <option value="2">Up to 2 pages</option>
                <option value="3">Up to 3 pages</option>
                <option value="5">Up to 5 pages</option>
                <option value="10">Up to 10 pages</option>
              </select>
            </section>

            <div className="mt-6 text-center">
              <button
                type="button"
                disabled={state.kind === "saving"}
                onClick={handleSave}
                className="inline-flex min-w-44 items-center justify-center rounded-full bg-primary px-6 py-3 font-serif font-semibold text-primary-foreground transition-colors hover:bg-accent hover:text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60"
              >
                {state.kind === "saving" ? "Saving…" : "Save My Table"}
              </button>

              {state.kind === "saved" && (
                <p className="mt-3 text-sm font-medium text-primary">Your preferences are saved.</p>
              )}
              {state.kind === "error" && (
                <p className="mt-3 text-sm text-destructive">{state.message}</p>
              )}

              <p className="mx-auto mt-4 max-w-xl text-xs leading-relaxed text-muted-foreground">
                Your private link can be used to change these preferences later. No account is required.
              </p>
            </div>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
