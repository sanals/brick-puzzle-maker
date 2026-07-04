import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { getDB, saveProject, getProject } from './storage-utils';
import { VoxelMatrix, PaletteColor } from '../lib/types';
import { OptimizedBrick } from '../lib/geometry/brick-optimizer';

export type MaterialProfile = 'PLA Rigid' | 'PETG' | 'TPU Flexible' | 'Translucent';

export interface PuzzleState {
  // Global Print Parameters
  width: number;
  length: number;
  snapFit: number;
  setWidth: (w: number) => void;
  setLength: (l: number) => void;
  setSnapFit: (s: number) => void;

  infillPercentage: number;
  shellCount: number;
  materialProfile: MaterialProfile;
  voxelMatrix: VoxelMatrix | null;
  activePaintColor: PaletteColor | null;

  // History for Undo/Redo
  history: VoxelMatrix[];
  historyIndex: number;
  paintMode: 'stud' | 'brick' | 'edit';
  customBricks: OptimizedBrick[] | null;
  setCustomBricks: (bricks: OptimizedBrick[] | null) => void;

  // Wizard Flow
  setupStep: 1 | 2;
  setSetupStep: (step: 1 | 2) => void;
  resetToSetup: () => void;

  // Actions
  setInfillPercentage: (infill: number) => void;
  setShellCount: (shells: number) => void;
  setMaterialProfile: (profile: MaterialProfile) => void;
  setVoxelMatrix: (matrix: VoxelMatrix | null) => void;
  setActivePaintColor: (color: PaletteColor | null) => void;
  
  commitHistory: () => void;
  undo: () => void;
  redo: () => void;
  setPaintMode: (mode: 'stud' | 'brick' | 'edit') => void;

  paintStud: (x: number, y: number) => void;
  paintStudsBatch: (coords: {x: number, z: number}[]) => void;
  deuteranopiaSimulation: boolean;
  setDeuteranopiaSimulation: (sim: boolean) => void;
  explodedView: boolean;
  setExplodedView: (val: boolean) => void;
  optimizePieces: boolean;
  setOptimizePieces: (val: boolean) => void;
  allowNonStandardSizes: boolean;
  setAllowNonStandardSizes: (val: boolean) => void;
  showBaseplate: boolean;
  setShowBaseplate: (val: boolean) => void;
  showBricks: boolean;
  setShowBricks: (val: boolean) => void;
}

export const usePuzzleStore = create<PuzzleState>()(
  persist(
    (set) => ({
      width: 16,
      length: 16,
      snapFit: 0,
      setWidth: (width) => set({ width }),
      setLength: (length) => set({ length }),
      setSnapFit: (snapFit) => set({ snapFit }),
      infillPercentage: 15,
      shellCount: 2,
      materialProfile: 'PLA Rigid',
      voxelMatrix: null,
      activePaintColor: null,
      history: [],
      historyIndex: -1,
      paintMode: 'stud',
      customBricks: null,
      setCustomBricks: (bricks) => set({ customBricks: bricks }),

      setupStep: 1,
      setSetupStep: (step) => set({ setupStep: step }),
      resetToSetup: () => set({ 
        setupStep: 1, 
        voxelMatrix: null, 
        customBricks: null, 
        history: [], 
        historyIndex: -1 
      }),

      setInfillPercentage: (infillPercentage) => set({ infillPercentage }),
      setShellCount: (shellCount) => set({ shellCount }),
      setMaterialProfile: (materialProfile) => set({ materialProfile }),
      setVoxelMatrix: (voxelMatrix) => set({ 
        voxelMatrix,
        history: voxelMatrix ? [structuredClone(voxelMatrix)] : [],
        historyIndex: voxelMatrix ? 0 : -1
      }),
      setActivePaintColor: (activePaintColor) => set({ activePaintColor }),
      
      setPaintMode: (mode) => set({ paintMode: mode }),

      commitHistory: () => set((state) => {
        if (!state.voxelMatrix) return state;
        // Slice history to current index in case we are committing after an undo
        const newHistory = state.history.slice(0, state.historyIndex + 1);
        newHistory.push(structuredClone(state.voxelMatrix));
        
        // Keep a max history of 50 steps
        if (newHistory.length > 50) {
          newHistory.shift();
        }
        return {
          history: newHistory,
          historyIndex: newHistory.length - 1
        };
      }),

      undo: () => set((state) => {
        if (state.historyIndex > 0) {
          const newIndex = state.historyIndex - 1;
          return {
            historyIndex: newIndex,
            voxelMatrix: structuredClone(state.history[newIndex])
          };
        }
        return state;
      }),

      redo: () => set((state) => {
        if (state.historyIndex < state.history.length - 1) {
          const newIndex = state.historyIndex + 1;
          return {
            historyIndex: newIndex,
            voxelMatrix: structuredClone(state.history[newIndex])
          };
        }
        return state;
      }),

      paintStud: (x, y) => set((state) => {
        if (!state.voxelMatrix || !state.activePaintColor) return state;
        
        // Ensure bounds
        if (x < 0 || x >= state.voxelMatrix.width || y < 0 || y >= state.voxelMatrix.height) {
          return state;
        }

        // Deep copy the cells to trigger re-render
        const newCells = [...state.voxelMatrix.cells];
        newCells[x] = [...newCells[x]];
        
        newCells[x][y] = {
          hexColor: state.activePaintColor.hex,
          label: state.activePaintColor.label,
          colorIndex: state.activePaintColor.index,
        };

        return {
          ...state,
          voxelMatrix: {
            ...state.voxelMatrix,
            cells: newCells
          }
        };
      }),

      paintStudsBatch: (coords) => set((state) => {
        if (!state.voxelMatrix || !state.activePaintColor || coords.length === 0) return state;
        
        const newCells = [...state.voxelMatrix.cells];
        let changed = false;

        for (const {x, z: y} of coords) {
          if (x >= 0 && x < state.voxelMatrix.width && y >= 0 && y < state.voxelMatrix.height) {
            newCells[x] = [...newCells[x]];
            newCells[x][y] = {
              hexColor: state.activePaintColor.hex,
              label: state.activePaintColor.label,
              colorIndex: state.activePaintColor.index,
            };
            changed = true;
          }
        }

        if (!changed) return state;

        return {
          ...state,
          voxelMatrix: {
            ...state.voxelMatrix,
            cells: newCells
          }
        };
      }),
      deuteranopiaSimulation: false,
      setDeuteranopiaSimulation: (sim) => set({ deuteranopiaSimulation: sim }),
      explodedView: false,
      setExplodedView: (val) => set({ explodedView: val }),
      optimizePieces: true,
      setOptimizePieces: (val) => set({ optimizePieces: val }),
      allowNonStandardSizes: false,
      setAllowNonStandardSizes: (val) => set({ allowNonStandardSizes: val }),
      showBaseplate: true,
      setShowBaseplate: (val) => set({ showBaseplate: val }),
      showBricks: true,
      setShowBricks: (val) => set({ showBricks: val }),
    }),
    {
      name: 'brick-puzzle-storage', // name of item in the storage (must be unique)
      storage: createJSONStorage(() => ({
        // Custom storage using our IndexedDB utils
        getItem: async (name: string): Promise<string | null> => {
          try {
            const state = await getProject(name);
            return state ? JSON.stringify(state) : null;
          } catch (e) {
            console.error('Error getting project from IDB:', e);
            return null;
          }
        },
        setItem: async (name: string, value: string): Promise<void> => {
          try {
            await saveProject(name, JSON.parse(value));
          } catch (e) {
            console.error('Error saving project to IDB:', e);
          }
        },
        removeItem: async (name: string): Promise<void> => {
           // We might not want to remove projects automatically via zustand, but we can if needed.
        },
      })),
      // We can implement explicitly versioning/migrations here
      version: 1,
      migrate: (persistedState: any, version: number) => {
        if (version === 0) {
          // migration logic
        }
        return persistedState as PuzzleState;
      },
    }
  )
);
