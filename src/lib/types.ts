// Shared domain types for the Pixel Puzzle Maker engine.

export type EmbossingStyle = "raised" | "recessed"

/** A single quantized palette entry. */
export const MIN_COLORS = 2
export const MAX_COLORS = 16

export interface CropRatio {
  id: string
  label: string
  w: number
  h: number
}

export const CROP_RATIOS: CropRatio[] = [
  { id: "1:1", label: "1:1", w: 1, h: 1 },
  { id: "1:2", label: "1:2", w: 1, h: 2 },
  { id: "1:3", label: "1:3", w: 1, h: 3 },
  { id: "1:4", label: "1:4", w: 1, h: 4 },
  { id: "2:3", label: "2:3", w: 2, h: 3 },
  { id: "3:4", label: "3:4", w: 3, h: 4 },
  { id: "2:1", label: "2:1", w: 2, h: 1 },
  { id: "3:1", label: "3:1", w: 3, h: 1 },
  { id: "4:1", label: "4:1", w: 4, h: 1 },
  { id: "3:2", label: "3:2", w: 3, h: 2 },
  { id: "4:3", label: "4:3", w: 4, h: 3 },
]

export type BasePlateSize = 16 | 24
export type ScaleMultiplier = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export interface PaletteColor {
  /** Stable index assigned by the quantizer (0-based). */
  index: number
  /** Uppercase identifier key: A, B, C ... */
  label: string
  /** Hex string, e.g. "#1f2a44". */
  hex: string
  /** sRGB components 0-255. */
  rgb: [number, number, number]
  /** Number of pixels assigned to this color. */
  count: number
  /** Surface coverage as a fraction 0..1. */
  coverage: number
  /** Whether the color should be ignored */
  ignored?: boolean
}

export interface VoxelCell {
  hexColor: string
  label: string
  /** Palette index this cell maps to. */
  colorIndex: number
  /** For heightmaps / topography */
  height?: number
}

/**
 * The single-source voxel matrix data structure.
 * Indexed as matrix[x][y] where x is column, y is row.
 */
export interface VoxelMatrix {
  width: number
  height: number
  cells: VoxelCell[][]
  palette: PaletteColor[]
}

/** Printer bed presets in millimeters. */
export interface PrinterBed {
  id: string
  name: string
  width: number
  depth: number
}

export const PRINTER_BEDS: PrinterBed[] = [
  { id: "bambu-a1", name: "Bambu Lab Standard (256x256)", width: 256, depth: 256 },
  { id: "bambu-mini", name: "Bambu Lab A1 mini (180x180)", width: 180, depth: 180 },
  { id: "prusa-mk4", name: "Prusa MK4 (250x210)", width: 250, depth: 210 },
  { id: "ender-3", name: "Ender 3 (220x220)", width: 220, depth: 220 },
]

export interface PuzzleConfig {
  basePlateSize: BasePlateSize
  resolutionMultiplier: ScaleMultiplier
  cropRatio: CropRatio
  colorCount: number
  embossing: EmbossingStyle
  bedId: string
  bedWidth: number
  bedDepth: number
}

export const DEFAULT_CONFIG: PuzzleConfig = {
  basePlateSize: 24,
  resolutionMultiplier: 1,
  cropRatio: CROP_RATIOS[0],
  colorCount: 4,
  embossing: "raised",
  bedId: "bambu-a1",
  bedWidth: 256,
  bedDepth: 256,
}

export type ProcessingMode = "dynamic-kmeans" | "nearest-lego" | "heightmap";

/** Worker request/response contracts. */
export interface ProcessRequest {
  type: "process"
  mode: ProcessingMode
  imageData: ImageData
  width: number
  height: number
  colorCount?: number // Used only in dynamic-kmeans mode
  maxHeight?: number // Used only in heightmap mode
}

export interface ProcessResponse {
  type: "result"
  matrix: VoxelMatrix
}

export interface ProcessError {
  type: "error"
  message: string
}

export type WorkerOutbound = ProcessResponse | ProcessError
