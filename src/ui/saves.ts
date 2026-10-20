// Save slots in the browser's IndexedDB: three manual slots and an autosave,
// each a gzip-compressed JSON snapshot of the match plus a small summary for
// the slot list. Everything stays on the device.
import type { SaveData } from '../sim/save';

export type SlotId = 'auto' | 'slot1' | 'slot2' | 'slot3';
export const SLOTS: SlotId[] = ['slot1', 'slot2', 'slot3'];

export interface SaveMeta {
  /** Map type and size, e.g. "Islands · Standard". */
  title: string;
  /** Match clock, seconds. */
  time: number;
  age: number;
  savedAt: number;
  camera?: { x: number; y: number; level: number };
}

interface Record_ {
  meta: SaveMeta;
  /** gzip bytes, or plain JSON where CompressionStream is missing. */
  data: ArrayBuffer | string;
}

const DB = 'hearth-crown';
const STORE = 'saves';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = run(t.objectStore(STORE));
    t.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    t.onerror = t.onabort = () => {
      db.close();
      reject(t.error ?? req.error);
    };
  });
}

async function compress(json: string): Promise<ArrayBuffer | string> {
  if (typeof CompressionStream === 'undefined') return json;
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

async function decompress(data: ArrayBuffer | string): Promise<string> {
  if (typeof data === 'string') return data;
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export async function writeSave(slot: SlotId, meta: SaveMeta, data: SaveData): Promise<void> {
  const rec: Record_ = { meta, data: await compress(JSON.stringify(data)) };
  await tx('readwrite', (s) => s.put(rec, slot));
}

export async function readSave(slot: SlotId): Promise<{ meta: SaveMeta; data: SaveData } | null> {
  const rec = await tx<Record_ | undefined>('readonly', (s) => s.get(slot));
  if (!rec) return null;
  return { meta: rec.meta, data: JSON.parse(await decompress(rec.data)) as SaveData };
}

/** Summaries of every slot (null where empty), without unpacking the saves. */
export async function listSaves(): Promise<Record<SlotId, SaveMeta | null>> {
  const out = { auto: null, slot1: null, slot2: null, slot3: null } as Record<SlotId, SaveMeta | null>;
  try {
    const db = await open();
    await Promise.all(
      (Object.keys(out) as SlotId[]).map(
        (k) =>
          new Promise<void>((resolve) => {
            const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(k);
            req.onsuccess = () => {
              out[k] = (req.result as Record_ | undefined)?.meta ?? null;
              resolve();
            };
            req.onerror = () => resolve();
          }),
      ),
    );
    db.close();
  } catch {
    // Storage unavailable (private browsing): no saves.
  }
  return out;
}

export async function deleteSave(slot: SlotId): Promise<void> {
  await tx('readwrite', (s) => s.delete(slot));
}

const AGE_NAMES = ['Settlement', 'Township', 'Stronghold', 'Dominion'];

/** "Islands · Standard — 12:05, Township Age — saved 3 min ago". */
export function describe(meta: SaveMeta): { title: string; detail: string } {
  const m = Math.floor(meta.time / 60), s = Math.floor(meta.time % 60);
  const ago = Math.round((Date.now() - meta.savedAt) / 60000);
  const when = ago < 1 ? 'just now' : ago < 60 ? `${ago} min ago` : ago < 1440 ? `${Math.round(ago / 60)} h ago` : new Date(meta.savedAt).toLocaleDateString();
  return { title: meta.title, detail: `${m}:${String(s).padStart(2, '0')} · ${AGE_NAMES[meta.age] ?? ''} Age · saved ${when}` };
}
