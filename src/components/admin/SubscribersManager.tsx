import React, { useState } from "react";
import { adminDeleteSubscribers } from "@/integrations/supabase/api.functions";

export type Subscriber = { id: string; email: string; created_at: string };

type SubscribersManagerProps = {
  accessToken: string | null;
  subscribers: Subscriber[];
  onChanged: () => Promise<void> | void;
};

function formatSignupDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export default function SubscribersManager({ accessToken, subscribers, onChanged }: SubscribersManagerProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subscribers;
    return subscribers.filter((s) => s.email.toLowerCase().includes(q));
  }, [subscribers, query]);

  const allVisibleSelected =
    filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const s of filtered) next.delete(s.id);
      } else {
        for (const s of filtered) next.add(s.id);
      }
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runDelete = async (ids: string[], emails: string[]) => {
    if (ids.length === 0) return;
    if (!accessToken) return;
    const preview = emails.slice(0, 10).join("\n");
    const more = emails.length > 10 ? `\n…and ${emails.length - 10} more` : "";
    const msg =
      ids.length === 1
        ? `Delete this subscriber?\n\n${preview}\n\nThis cannot be undone.`
        : `Delete ${ids.length} subscribers?\n\n${preview}${more}\n\nThis cannot be undone.`;
    if (!confirm(msg)) return;
    setBusy(true);
    setError(null);
    try {
      await adminDeleteSubscribers({ data: { accessToken, ids } });
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const deleteSelected = () => {
    const ids = Array.from(selected);
    const emailById = new Map(subscribers.map((s) => [s.id, s.email]));
    const emails = ids.map((id) => emailById.get(id) ?? id);
    runDelete(ids, emails);
  };

  const deleteOne = (row: Subscriber) => runDelete([row.id], [row.email]);

  const downloadCsv = () => {
    const escape = (v: string) => {
      if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
      return v;
    };
    const header = "email,signup_date\n";
    const body = subscribers
      .map((s) => `${escape(s.email)},${escape(formatSignupDate(s.created_at))}`)
      .join("\n");
    const csv = header + body + (body ? "\n" : "");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-serif text-2xl font-semibold text-primary">
          Subscribers ({subscribers.length})
        </h2>
        <div className="text-xs text-muted-foreground">
          {selected.size > 0 ? `${selected.size} selected` : `Showing ${filtered.length} of ${subscribers.length}`}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="search"
          placeholder="Search by email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-[220px] rounded border border-input bg-background px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={downloadCsv}
          disabled={subscribers.length === 0}
          className="rounded border border-input px-3 py-1 text-sm disabled:opacity-50"
        >
          Download CSV
        </button>
        <button
          type="button"
          onClick={deleteSelected}
          disabled={busy || selected.size === 0}
          className="rounded border border-destructive px-3 py-1 text-sm text-destructive disabled:opacity-50"
        >
          {busy ? "Deleting…" : `Delete selected${selected.size ? ` (${selected.size})` : ""}`}
        </button>
      </div>

      {error && <div className="mt-2 text-xs text-destructive">{error}</div>}

      <div className="mt-3 max-h-96 overflow-auto rounded border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="w-8 px-2 py-2 text-left">
                <input
                  type="checkbox"
                  aria-label="Select all visible"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="px-2 py-2 text-left">Email</th>
              <th className="px-2 py-2 text-left whitespace-nowrap">Signup date</th>
              <th className="px-2 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr key={s.id} className="border-t border-border/60">
                <td className="px-2 py-2 align-middle">
                  <input
                    type="checkbox"
                    aria-label={`Select ${s.email}`}
                    checked={selected.has(s.id)}
                    onChange={() => toggleOne(s.id)}
                  />
                </td>
                <td className="px-2 py-2 align-middle break-all">{s.email}</td>
                <td className="px-2 py-2 align-middle whitespace-nowrap text-muted-foreground">
                  {formatSignupDate(s.created_at)}
                </td>
                <td className="px-2 py-2 align-middle text-right">
                  <button
                    type="button"
                    onClick={() => deleteOne(s)}
                    disabled={busy}
                    className="rounded border border-destructive px-2 py-1 text-xs text-destructive disabled:opacity-50"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                  {subscribers.length === 0 ? "No subscribers yet." : "No matches for that search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
