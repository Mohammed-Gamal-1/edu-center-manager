export const centerCollectionKeys = ["students", "teachers", "pricing", "sessions", "bookings", "expenses", "debtPayments", "audit"] as const;

export type MergeableCenterSnapshot = {
  students: unknown[];
  teachers: unknown[];
  pricing: unknown[];
  sessions: unknown[];
  bookings: unknown[];
  expenses: unknown[];
  debtPayments?: unknown[];
  audit: unknown[];
  subjectCatalog: Record<string, unknown>;
  rooms: unknown[];
  savedAt: string;
};

export type CenterSnapshotMergeConflict = {
  path: string;
  reason: "same-record-changed" | "same-setting-changed" | "invalid-collection";
};

export type CenterSnapshotMergeResult<T extends MergeableCenterSnapshot> = {
  state: T;
  conflicts: CenterSnapshotMergeConflict[];
};

const canonicalValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, canonicalValue(entry)]),
  );
};

const sameValue = (left: unknown, right: unknown) => JSON.stringify(canonicalValue(left)) === JSON.stringify(canonicalValue(right));

export function sameCenterSnapshotContent(left: MergeableCenterSnapshot, right: MergeableCenterSnapshot) {
  return sameValue({ ...left, savedAt: "" }, { ...right, savedAt: "" });
}

const itemId = (value: unknown) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const id = (value as Record<string, unknown>).id;
  return id === undefined || id === null || String(id) === "" ? null : String(id);
};

function mergeSetting<T>(path: string, base: T, local: T, cloud: T, conflicts: CenterSnapshotMergeConflict[]) {
  const localChanged = !sameValue(local, base);
  const cloudChanged = !sameValue(cloud, base);
  if (localChanged && cloudChanged && !sameValue(local, cloud)) {
    conflicts.push({ path, reason: "same-setting-changed" });
    return local;
  }
  return localChanged ? local : cloud;
}

function mergeCatalog(base: Record<string, unknown>, local: Record<string, unknown>, cloud: Record<string, unknown>, conflicts: CenterSnapshotMergeConflict[]) {
  const merged: Record<string, unknown> = {};
  const stages = [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(cloud)])];
  for (const stage of stages) {
    const value = mergeSetting(`subjectCatalog.${stage}`, base[stage], local[stage], cloud[stage], conflicts);
    if (value !== undefined) merged[stage] = value;
  }
  return merged;
}

function mergeCollection(path: string, baseRaw: unknown, localRaw: unknown, cloudRaw: unknown, conflicts: CenterSnapshotMergeConflict[]) {
  const base = Array.isArray(baseRaw) ? baseRaw : [];
  const local = Array.isArray(localRaw) ? localRaw : [];
  const cloud = Array.isArray(cloudRaw) ? cloudRaw : [];
  const allItems = [...base, ...local, ...cloud];
  if (allItems.some((item) => itemId(item) === null)) {
    const localChanged = !sameValue(local, base);
    const cloudChanged = !sameValue(cloud, base);
    if (localChanged && cloudChanged && !sameValue(local, cloud)) {
      conflicts.push({ path, reason: "invalid-collection" });
      return local;
    }
    return localChanged ? local : cloud;
  }

  const baseById = new Map(base.map((item) => [itemId(item) as string, item]));
  const localById = new Map(local.map((item) => [itemId(item) as string, item]));
  const cloudById = new Map(cloud.map((item) => [itemId(item) as string, item]));
  const orderedIds = [...local.map((item) => itemId(item) as string), ...cloud.map((item) => itemId(item) as string)].filter((id, index, all) => all.indexOf(id) === index);
  const merged: unknown[] = [];

  for (const id of orderedIds) {
    const baseValue = baseById.get(id);
    const localValue = localById.get(id);
    const cloudValue = cloudById.get(id);
    const localChanged = !sameValue(localValue, baseValue);
    const cloudChanged = !sameValue(cloudValue, baseValue);
    let selected = localChanged ? localValue : cloudValue;
    if (localChanged && cloudChanged) {
      if (!sameValue(localValue, cloudValue)) conflicts.push({ path: `${path}.${id}`, reason: "same-record-changed" });
      selected = localValue;
    }
    if (selected !== undefined) merged.push(selected);
  }
  return merged;
}

export function mergeCenterSnapshots<T extends MergeableCenterSnapshot>(base: T, local: T, cloud: T): CenterSnapshotMergeResult<T> {
  const conflicts: CenterSnapshotMergeConflict[] = [];
  const merged: Record<string, unknown> = { ...cloud };
  for (const key of centerCollectionKeys) {
    merged[key] = mergeCollection(key, base[key], local[key], cloud[key], conflicts);
  }
  merged.subjectCatalog = mergeCatalog(base.subjectCatalog, local.subjectCatalog, cloud.subjectCatalog, conflicts);
  merged.rooms = mergeSetting("rooms", base.rooms, local.rooms, cloud.rooms, conflicts);
  merged.savedAt = local.savedAt;
  return { state: merged as T, conflicts };
}
