export const LOCAL_FIRST_DB_NAME = "eltafawoq-center-local-v1";
export const LOCAL_FIRST_DB_VERSION = 1;

export type LocalOperationStatus = "pending" | "synced" | "conflict";
export type LocalOperationSource = "local" | "cloud" | "legacy";

export type LocalOperation<T> = {
  id: string;
  sequence: number;
  deviceId: string;
  baseVersion: number;
  baseState: T | null;
  state: T;
  status: LocalOperationStatus;
  source: LocalOperationSource;
  createdAt: string;
  updatedAt: string;
  cloudState?: T;
  cloudVersion?: number;
  conflictPaths?: string[];
};

export type LocalReplica<T> = {
  state: T;
  baseVersion: number;
  baseState: T | null;
  status: LocalOperationStatus;
  operationId: string;
  sequence: number;
  deviceId: string;
  updatedAt: string;
  pendingCount: number;
  cloudState?: T;
  cloudVersion?: number;
  conflictPaths?: string[];
};

type LocalIdentity = {
  key: "identity";
  deviceId: string;
  nextSequence: number;
};

type LatestRecord<T> = Omit<LocalReplica<T>, "pendingCount"> & { key: "latest" };

const MAX_LOCAL_OPERATIONS = 40;
let databasePromise: Promise<IDBDatabase> | null = null;

const requestResult = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });

const createDeviceId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `device-${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

export function indexedDbAvailable() {
  return typeof indexedDB !== "undefined";
}

function openLocalDatabase() {
  if (!indexedDbAvailable()) return Promise.reject(new Error("IndexedDB is unavailable"));
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(LOCAL_FIRST_DB_NAME, LOCAL_FIRST_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("records")) database.createObjectStore("records", { keyPath: "key" });
      if (!database.objectStoreNames.contains("metadata")) database.createObjectStore("metadata", { keyPath: "key" });
      if (!database.objectStoreNames.contains("operations")) {
        const operations = database.createObjectStore("operations", { keyPath: "id" });
        operations.createIndex("sequence", "sequence", { unique: true });
        operations.createIndex("status", "status", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("Unable to open IndexedDB"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("IndexedDB upgrade is blocked"));
    };
  });
  return databasePromise;
}

async function unresolvedOperationCount(database: IDBDatabase) {
  const transaction = database.transaction("operations", "readonly");
  const done = transactionDone(transaction);
  const index = transaction.objectStore("operations").index("status");
  const [pending, conflicts] = await Promise.all([requestResult(index.count("pending")), requestResult(index.count("conflict"))]);
  await done;
  return pending + conflicts;
}

function trimOperations(store: IDBObjectStore) {
  return new Promise<void>((resolve, reject) => {
    let kept = 0;
    const request = store.index("sequence").openCursor(null, "prev");
    request.onerror = () => reject(request.error ?? new Error("Unable to trim local operations"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve();
        return;
      }
      kept += 1;
      if (kept > MAX_LOCAL_OPERATIONS) cursor.delete();
      cursor.continue();
    };
  });
}

async function saveSnapshot<T>(state: T, baseVersion: number, baseState: T | null, status: LocalOperationStatus, source: LocalOperationSource) {
  const database = await openLocalDatabase();
  const transaction = database.transaction(["metadata", "operations", "records"], "readwrite");
  const done = transactionDone(transaction);
  const metadata = transaction.objectStore("metadata");
  const operations = transaction.objectStore("operations");
  const records = transaction.objectStore("records");
  const existingIdentity = (await requestResult(metadata.get("identity"))) as LocalIdentity | undefined;
  const identity: LocalIdentity = existingIdentity ?? { key: "identity", deviceId: createDeviceId(), nextSequence: 0 };
  const sequence = identity.nextSequence + 1;
  identity.nextSequence = sequence;
  const now = new Date().toISOString();
  const operation: LocalOperation<T> = {
    id: `${identity.deviceId}:${sequence}`,
    sequence,
    deviceId: identity.deviceId,
    baseVersion,
    baseState,
    state,
    status,
    source,
    createdAt: now,
    updatedAt: now,
  };
  const latest: LatestRecord<T> = {
    key: "latest",
    state,
    baseVersion,
    baseState,
    status,
    operationId: operation.id,
    sequence,
    deviceId: identity.deviceId,
    updatedAt: now,
  };
  metadata.put(identity);
  operations.put({ ...operation, baseState: null });
  records.put(latest);
  await trimOperations(operations);
  await done;
  return { operation, pendingCount: await unresolvedOperationCount(database) };
}

export function savePendingLocalSnapshot<T>(state: T, baseVersion: number, baseState: T | null, source: LocalOperationSource = "local") {
  return saveSnapshot(state, baseVersion, baseState, "pending", source);
}

export function saveCloudLocalSnapshot<T>(state: T, version: number) {
  return saveSnapshot(state, version, state, "synced", "cloud");
}

export async function loadLocalReplica<T>(): Promise<LocalReplica<T> | null> {
  const database = await openLocalDatabase();
  const transaction = database.transaction("records", "readonly");
  const done = transactionDone(transaction);
  const latest = (await requestResult(transaction.objectStore("records").get("latest"))) as LatestRecord<T> | undefined;
  await done;
  if (!latest) return null;
  const { key: _key, ...replica } = latest;
  void _key;
  return { ...replica, pendingCount: await unresolvedOperationCount(database) };
}

export async function markLocalOperationSynced<T>(operationId: string, syncedState: T, version: number) {
  const database = await openLocalDatabase();
  const transaction = database.transaction(["operations", "records"], "readwrite");
  const done = transactionDone(transaction);
  const operations = transaction.objectStore("operations");
  const operation = (await requestResult(operations.get(operationId))) as LocalOperation<T> | undefined;
  if (operation) {
    const cursorRequest = operations.index("sequence").openCursor(IDBKeyRange.upperBound(operation.sequence));
    await new Promise<void>((resolve, reject) => {
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error("Unable to update local operations"));
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }
        const value = cursor.value as LocalOperation<T>;
        if (value.status !== "synced") cursor.update({ ...value, status: "synced", updatedAt: new Date().toISOString() });
        cursor.continue();
      };
    });
  }
  const records = transaction.objectStore("records");
  const latest = (await requestResult(records.get("latest"))) as LatestRecord<T> | undefined;
  if (latest?.operationId === operationId) {
    records.put({
      ...latest,
      state: syncedState,
      baseVersion: version,
      baseState: syncedState,
      status: "synced",
      updatedAt: new Date().toISOString(),
      cloudState: undefined,
      cloudVersion: undefined,
      conflictPaths: undefined,
    });
  }
  await done;
  return unresolvedOperationCount(database);
}

export async function markLocalOperationConflict<T>(operationId: string, cloudState: T, cloudVersion: number, conflictPaths: string[]) {
  const database = await openLocalDatabase();
  const transaction = database.transaction(["operations", "records"], "readwrite");
  const done = transactionDone(transaction);
  const operations = transaction.objectStore("operations");
  const operation = (await requestResult(operations.get(operationId))) as LocalOperation<T> | undefined;
  if (operation) operations.put({ ...operation, status: "conflict", cloudState, cloudVersion, conflictPaths, updatedAt: new Date().toISOString() });
  const records = transaction.objectStore("records");
  const latest = (await requestResult(records.get("latest"))) as LatestRecord<T> | undefined;
  if (latest?.operationId === operationId) {
    records.put({ ...latest, status: "conflict", cloudState, cloudVersion, conflictPaths, updatedAt: new Date().toISOString() });
  }
  await done;
  return unresolvedOperationCount(database);
}
