export type InventorySnapshot = {
  date: string;
  total: number;
  aws: number;
  gcp: number;
  exposed: number;
};

export type InventoryHistory = {
  snapshots: InventorySnapshot[];
  error: string | null;
};

const STORAGE_KEY = "netraom.inventory-snapshots.v1";
const MAX_SNAPSHOTS = 30;

function isSnapshot(value: unknown): value is InventorySnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.date === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(snapshot.date) &&
    ["total", "aws", "gcp", "exposed"].every(
      (key) => Number.isInteger(snapshot[key]) && Number(snapshot[key]) >= 0,
    )
  );
}

export function readInventoryHistory(): InventoryHistory {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return { snapshots: [], error: null };
    const parsed: unknown = JSON.parse(stored);
    if (!Array.isArray(parsed) || !parsed.every(isSnapshot)) {
      return { snapshots: [], error: "Saved inventory history is invalid and was not changed." };
    }
    return { snapshots: parsed.slice(-MAX_SNAPSHOTS), error: null };
  } catch {
    return { snapshots: [], error: "Saved inventory history could not be read in this browser." };
  }
}

export function recordInventorySnapshot(
  snapshots: InventorySnapshot[],
  current: InventorySnapshot,
): InventorySnapshot[] {
  return [
    ...snapshots.filter((snapshot) => snapshot.date !== current.date),
    current,
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-MAX_SNAPSHOTS);
}

export function saveInventoryHistory(snapshots: InventorySnapshot[]): string | null {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
    return null;
  } catch {
    return "Inventory history could not be saved in this browser.";
  }
}
