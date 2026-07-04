import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PuzzleDBSchema extends DBSchema {
  assets: {
    key: string;
    value: {
      id: string;
      data: Blob | ArrayBuffer;
      createdAt: number;
    };
  };
  projects: {
    key: string;
    value: {
      id: string;
      state: any;
      updatedAt: number;
    };
  };
}

const DB_NAME = 'brick-puzzle-db';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<PuzzleDBSchema>> | null = null;

export async function getDB() {
  if (typeof window === 'undefined') return null; // SSR safety
  
  if (!dbPromise) {
    dbPromise = openDB<PuzzleDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('assets', { keyPath: 'id' });
        db.createObjectStore('projects', { keyPath: 'id' });
      },
    });
  }
  return dbPromise;
}

export async function saveAsset(id: string, data: Blob | ArrayBuffer) {
  const db = await getDB();
  if (!db) return;
  await db.put('assets', {
    id,
    data,
    createdAt: Date.now(),
  });
}

export async function getAsset(id: string) {
  const db = await getDB();
  if (!db) return null;
  const asset = await db.get('assets', id);
  return asset?.data || null;
}

export async function saveProject(id: string, state: any) {
  const db = await getDB();
  if (!db) return;
  await db.put('projects', {
    id,
    state,
    updatedAt: Date.now(),
  });
}

export async function getProject(id: string) {
  const db = await getDB();
  if (!db) return null;
  const project = await db.get('projects', id);
  return project?.state || null;
}

export async function deleteAsset(id: string) {
  const db = await getDB();
  if (!db) return;
  await db.delete('assets', id);
}

export async function getAllProjects() {
  const db = await getDB();
  if (!db) return [];
  return db.getAll('projects');
}

/**
 * Sweeps for orphaned assets. Should be called periodically or on idle.
 * Uses the currently saved projects to find referenced assets, and deletes any 
 * that are in the assets store but not referenced in any project.
 */
export async function runGarbageCollection() {
  const db = await getDB();
  if (!db) return;
  
  const allProjects = await db.getAll('projects');
  const referencedAssetIds = new Set<string>();
  
  // Logic to extract asset IDs from projects.
  // We assume any string matching a UUID or specific pattern in the state could be an asset ID.
  // A robust implementation would walk the state object looking for specific fields.
  const extractRefs = (obj: any) => {
    if (typeof obj === 'string') {
      // Assuming asset IDs have a specific format, e.g. 'asset-uuid'
      if (obj.startsWith('asset-')) {
        referencedAssetIds.add(obj);
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(extractRefs);
    } else if (obj !== null && typeof obj === 'object') {
      Object.values(obj).forEach(extractRefs);
    }
  };
  
  allProjects.forEach(p => extractRefs(p.state));
  
  const allAssets = await db.getAllKeys('assets');
  let deletedCount = 0;
  
  for (const assetId of allAssets) {
    if (!referencedAssetIds.has(assetId)) {
      await db.delete('assets', assetId);
      deletedCount++;
    }
  }
  
  if (deletedCount > 0) {
    console.log(`[GC] Cleaned up ${deletedCount} orphaned assets.`);
  }
}
