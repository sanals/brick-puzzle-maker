// Phase 2: High-performance voxel core engine.
// Pure functions (no DOM) so they can run inside a Web Worker.

import type { PaletteColor, VoxelCell, VoxelMatrix } from "../types"
import { getClosestBrickColour, allBrickColours, hexToRgb } from "../math/lego-colors";

/** Deterministic 32-bit PRNG (mulberry32). Same seed => same sequence. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Convert 0-255 rgb to a "#rrggbb" string. */
export function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0")
  return `#${h(r)}${h(g)}${h(b)}`
}

/** Spreadsheet-style label: A, B, ... Z, AA, AB ... */
export function labelForIndex(index: number): string {
  let n = index
  let label = ""
  do {
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26) - 1
  } while (n >= 0)
  return label
}

/** Relative luminance (0..1) for choosing readable overlay text. */
export function luminance(r: number, g: number, b: number): number {
  const f = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

/** Pick black or white text for maximum contrast against a background. */
export function contrastText(r: number, g: number, b: number): string {
  return luminance(r, g, b) > 0.4 ? "#0b1020" : "#f8fafc"
}

export interface DownscaledImage {
  width: number
  height: number
  /** Flat RGB array, length width*height*3, row-major (y outer, x inner). */
  pixels: Uint8ClampedArray
}

/**
 * Center-crop "cover" downscale using strict nearest-neighbor sampling.
 * The source is cropped to a centered square then sampled into a size x size grid.
 */
export function exactResample(image: ImageData, targetWidth: number, targetHeight: number): DownscaledImage {
  const { width: sw, height: sh, data } = image
  const outWidth = targetWidth
  const outHeight = targetHeight
  const out = new Uint8ClampedArray(outWidth * outHeight * 3)

  for (let gy = 0; gy < outHeight; gy++) {
    const srcY = Math.floor(((gy + 0.5) / outHeight) * sh)
    for (let gx = 0; gx < outWidth; gx++) {
      const srcX = Math.floor(((gx + 0.5) / outWidth) * sw)
      const sIdx = (srcY * sw + srcX) * 4
      const oIdx = (gy * outWidth + gx) * 3
      out[oIdx] = data[sIdx]
      out[oIdx + 1] = data[sIdx + 1]
      out[oIdx + 2] = data[sIdx + 2]
    }
  }
  return { width: outWidth, height: outHeight, pixels: out }
}

interface Cluster {
  r: number
  g: number
  b: number
}

function dist2(r: number, g: number, b: number, c: Cluster): number {
  const dr = r - c.r
  const dg = g - c.g
  const db = b - c.b
  return dr * dr + dg * dg + db * db
}

/**
 * Deterministic k-means++ color quantization.
 * Uses a fixed-seed PRNG so identical input always yields identical palette.
 */
export function quantize(
  img: DownscaledImage,
  k: number,
  seed = 0x9e3779b9,
): { palette: Cluster[]; assignments: Int32Array } {
  const { pixels } = img
  const pixelCount = pixels.length / 3
  const rand = mulberry32(seed)
  const effectiveK = Math.max(1, Math.min(k, pixelCount))

  // --- k-means++ seeding ---
  const centers: Cluster[] = []
  const first = Math.floor(rand() * pixelCount)
  centers.push({
    r: pixels[first * 3],
    g: pixels[first * 3 + 1],
    b: pixels[first * 3 + 2],
  })

  const dClosest = new Float64Array(pixelCount).fill(Infinity)
  while (centers.length < effectiveK) {
    const last = centers[centers.length - 1]
    let total = 0
    for (let i = 0; i < pixelCount; i++) {
      const d = dist2(pixels[i * 3], pixels[i * 3 + 1], pixels[i * 3 + 2], last)
      if (d < dClosest[i]) dClosest[i] = d
      total += dClosest[i]
    }
    if (total === 0) {
      // All remaining pixels identical to chosen centers; pad deterministically.
      const idx = Math.floor(rand() * pixelCount)
      centers.push({
        r: pixels[idx * 3],
        g: pixels[idx * 3 + 1],
        b: pixels[idx * 3 + 2],
      })
      continue
    }
    let target = rand() * total
    let chosen = 0
    for (let i = 0; i < pixelCount; i++) {
      target -= dClosest[i]
      if (target <= 0) {
        chosen = i
        break
      }
    }
    centers.push({
      r: pixels[chosen * 3],
      g: pixels[chosen * 3 + 1],
      b: pixels[chosen * 3 + 2],
    })
  }

  // --- Lloyd iterations ---
  const assignments = new Int32Array(pixelCount)
  const maxIters = 30
  for (let iter = 0; iter < maxIters; iter++) {
    let moved = false
    // Assign step
    for (let i = 0; i < pixelCount; i++) {
      const r = pixels[i * 3]
      const g = pixels[i * 3 + 1]
      const b = pixels[i * 3 + 2]
      let best = 0
      let bestD = Infinity
      for (let c = 0; c < centers.length; c++) {
        const d = dist2(r, g, b, centers[c])
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best
        moved = true
      }
    }
    // Update step
    const sumR = new Float64Array(centers.length)
    const sumG = new Float64Array(centers.length)
    const sumB = new Float64Array(centers.length)
    const counts = new Int32Array(centers.length)
    for (let i = 0; i < pixelCount; i++) {
      const c = assignments[i]
      sumR[c] += pixels[i * 3]
      sumG[c] += pixels[i * 3 + 1]
      sumB[c] += pixels[i * 3 + 2]
      counts[c]++
    }
    for (let c = 0; c < centers.length; c++) {
      if (counts[c] > 0) {
        centers[c] = {
          r: sumR[c] / counts[c],
          g: sumG[c] / counts[c],
          b: sumB[c] / counts[c],
        }
      }
    }
    if (!moved && iter > 0) break
  }

  return { palette: centers, assignments }
}

/**
 * Build the single-source voxel matrix from a downscaled image.
 * Palette entries are sorted by luminance for stable, deterministic labels.
 */
export function buildMatrix(img: DownscaledImage, k: number, seed?: number): VoxelMatrix {
  const { width, height } = img
  const { palette, assignments } = quantize(img, k, seed)

  // Count occurrences.
  const rawCounts = new Array(palette.length).fill(0)
  for (let i = 0; i < assignments.length; i++) rawCounts[assignments[i]]++

  // Stable ordering: darkest -> lightest, so labels are deterministic.
  const order = palette
    .map((c, i) => ({ i, lum: luminance(c.r, c.g, c.b) }))
    .sort((a, b) => a.lum - b.lum || a.i - b.i)

  const oldToNew = new Map<number, number>()
  const totalPixels = width * height
  const finalPalette: PaletteColor[] = order.map((entry, newIdx) => {
    oldToNew.set(entry.i, newIdx)
    const c = palette[entry.i]
    const r = Math.round(c.r)
    const g = Math.round(c.g)
    const b = Math.round(c.b)
    const count = rawCounts[entry.i]
    return {
      index: newIdx,
      label: labelForIndex(newIdx),
      hex: rgbToHex(r, g, b),
      rgb: [r, g, b],
      count,
      coverage: count / totalPixels,
    }
  })

  // Build cells as matrix[x][y].
  const cells: VoxelCell[][] = Array.from({ length: width }, () => new Array<VoxelCell>(height))
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const oldIdx = assignments[gy * width + gx]
      const newIdx = oldToNew.get(oldIdx) ?? 0
      const p = finalPalette[newIdx]
      cells[gx][gy] = {
        hexColor: p.hex,
        label: p.label,
        colorIndex: newIdx,
      }
    }
  }

  return { width, height, cells, palette: finalPalette }
}

/**
 * Build the voxel matrix using nearest real LEGO color.
 */
export function buildLegoMatrix(img: DownscaledImage): VoxelMatrix {
  const { width, height, pixels } = img;
  
  // Track counts to build dynamic palette of ONLY used colors
  const usedColors = new Map<string, number>(); 
  
  // Array of mapped colors
  const mappedHexes: string[] = [];

  for (let i = 0; i < pixels.length; i += 3) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    
    const nearest = getClosestBrickColour(r, g, b);
    const hex = nearest.hexColour;
    mappedHexes.push(hex);
    
    usedColors.set(hex, (usedColors.get(hex) || 0) + 1);
  }

  // Create Palette
  const totalPixels = width * height;
  const palette: PaletteColor[] = [];
  let index = 0;
  
  const hexToIndex = new Map<string, number>();
  
  for (const [hex, count] of usedColors.entries()) {
    // find name
    const legoColor = allBrickColours.find(c => c.hexColour === hex)!;
    const [r, g, b] = hexToRgb(hex);
    
    palette.push({
      index,
      label: legoColor.name,
      hex,
      rgb: [r, g, b],
      count,
      coverage: count / totalPixels
    });
    
    hexToIndex.set(hex, index);
    index++;
  }

  // Sort palette by luminance for stable UI
  palette.sort((a, b) => luminance(a.rgb[0], a.rgb[1], a.rgb[2]) - luminance(b.rgb[0], b.rgb[1], b.rgb[2]));
  // Reassign indices
  palette.forEach((p, i) => {
    p.index = i;
    hexToIndex.set(p.hex, i);
  });

  const cells: VoxelCell[][] = Array.from({ length: width }, () => new Array<VoxelCell>(height))
  
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const hex = mappedHexes[gy * width + gx];
      const pIndex = hexToIndex.get(hex)!;
      const p = palette[pIndex];
      
      cells[gx][gy] = {
        hexColor: hex,
        label: p.label,
        colorIndex: p.index
      }
    }
  }

  return { width, height, cells, palette }
}

/**
 * Build the voxel matrix representing a heightmap based on grayscale brightness.
 */
export function buildHeightmapMatrix(img: DownscaledImage, maxHeight: number): VoxelMatrix {
  const { width, height, pixels } = img;
  
  const cells: VoxelCell[][] = Array.from({ length: width }, () => new Array<VoxelCell>(height));
  
  for (let gy = 0; gy < height; gy++) {
    for (let gx = 0; gx < width; gx++) {
      const r = pixels[(gy * width + gx) * 3];
      const g = pixels[(gy * width + gx) * 3 + 1];
      const b = pixels[(gy * width + gx) * 3 + 2];
      
      const lum = luminance(r, g, b); // 0 to 1
      
      // Map luminance to height plates
      const h = Math.round(lum * maxHeight);
      
      cells[gx][gy] = {
        hexColor: '#cccccc', // Default gray
        label: 'Height',
        colorIndex: 0,
        height: h
      };
    }
  }

  return { width, height, cells, palette: [] }
}

