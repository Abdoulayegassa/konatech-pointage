export type OfflineEvidenceRecord = {
  evidenceId: string;
  clientRequestId: string;
  employeeId: string;
  organizationId: string;
  siteId?: string;
  createdAt: string;
  mimeType: string;
  size: number;
  blob: Blob;
};

const DATABASE = 'inout-offline-evidence-v1';
const STORE = 'evidence';
export const MAX_OFFLINE_SELFIE_BYTES = 700_000;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Offline evidence storage is unavailable.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'evidenceId' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open offline evidence storage.'));
    request.onblocked = () => reject(new Error('Offline evidence storage is blocked.'));
  });
}

export async function putOfflineEvidence(record: OfflineEvidenceRecord) {
  if (record.size <= 0 || record.size > MAX_OFFLINE_SELFIE_BYTES || record.blob.size !== record.size || record.blob.type !== record.mimeType) {
    throw new Error('Offline selfie is invalid or exceeds the supported size.');
  }
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not persist offline evidence.'));
      tx.onabort = () => reject(tx.error ?? new Error('Offline evidence transaction was aborted.'));
    });
  } finally { db.close(); }
}

export async function getOfflineEvidence(evidenceId: string) {
  const db = await openDatabase();
  try {
    return await new Promise<OfflineEvidenceRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const request = tx.objectStore(STORE).get(evidenceId);
      request.onsuccess = () => resolve(request.result as OfflineEvidenceRecord | undefined);
      request.onerror = () => reject(request.error ?? new Error('Could not read offline evidence.'));
    });
  } finally { db.close(); }
}

export async function deleteOfflineEvidence(evidenceId: string) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(evidenceId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not remove offline evidence.'));
      tx.onabort = () => reject(tx.error ?? new Error('Offline evidence cleanup was aborted.'));
    });
  } finally { db.close(); }
}

export async function pruneUnreferencedOfflineEvidence(referencedIds: Set<string>) {
  const db = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const record = cursor.value as OfflineEvidenceRecord;
        if (!referencedIds.has(record.evidenceId)) cursor.delete();
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('Could not prune orphaned offline evidence.'));
      tx.onabort = () => reject(tx.error ?? new Error('Offline evidence cleanup was aborted.'));
    });
  } finally { db.close(); }
}
