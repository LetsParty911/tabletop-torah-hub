export type MyTableItem = {
  id: string;
  title: string;
  publication: string | null;
  publisher: string | null;
  parsha: string | null;
  audience: string | null;
  formatType: string | null;
  pageCount: number | null;
  description: string | null;
  savedAt: string;
};

const STORAGE_KEY = "tftt_my_table_v1";
const EVENT_NAME = "tftt:my-table-changed";

export function readMyTable(): MyTableItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is MyTableItem => !!item && typeof item.id === "string");
  } catch {
    return [];
  }
}

function writeMyTable(items: MyTableItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { count: items.length } }));
}

export function isInMyTable(id: string): boolean {
  return readMyTable().some((item) => item.id === id);
}

export function addToMyTable(item: Omit<MyTableItem, "savedAt">): MyTableItem[] {
  const existing = readMyTable().filter((saved) => saved.id !== item.id);
  const next = [{ ...item, savedAt: new Date().toISOString() }, ...existing];
  writeMyTable(next.slice(0, 100));
  return next;
}

export function removeFromMyTable(id: string): MyTableItem[] {
  const next = readMyTable().filter((item) => item.id !== id);
  writeMyTable(next);
  return next;
}

export function clearMyTable(): void {
  writeMyTable([]);
}

export function subscribeMyTable(callback: (items: MyTableItem[]) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => callback(readMyTable());
  window.addEventListener(EVENT_NAME, handler as EventListener);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT_NAME, handler as EventListener);
    window.removeEventListener("storage", handler);
  };
}
