import JSZip from 'jszip';
import { BaseplateGenerator } from '../geometry/baseplate-generator';
import { BrickGenerator } from '../geometry/brick-generator';
import { build3MF } from './generic-3mf-exporter';
import { VoxelMatrix } from '../types';
import { PrintTolerances } from '../math/tolerances';

/**
 * Exports a ZIP containing the baseplate and separate 3MF files for each color in the mosaic.
 */
export async function exportMosaicBatches(
  width: number,
  length: number,
  tolerances: PrintTolerances,
  voxelMatrix: VoxelMatrix
): Promise<Blob> {
  const zip = new JSZip();

  // 1. Export the blank neutral baseplate
  const baseGen = new BaseplateGenerator(width, length, tolerances, 1/3, null);
  const baseGeo = baseGen.generateGeometry();
  const baseBlob = await build3MF(baseGeo, '#3b82f6');
  zip.file(`00_Baseplate_${width}x${length}.3mf`, baseBlob);

  // 2. Export each color layer separately
  for (const color of voxelMatrix.palette) {
    if (color.count === 0) continue;

    // Generate just the bricks for this color
    const brickGen = new BrickGenerator(width, length, tolerances, voxelMatrix, color.hex);
    const colorGeo = brickGen.generateGeometry();
    
    // Safety check, in case none were actually generated
    if (colorGeo.attributes.position && colorGeo.attributes.position.count > 0) {
      const colorBlob = await build3MF(colorGeo, color.hex);
      const safeName = color.label.replace(/[^a-zA-Z0-9]/g, '_');
      zip.file(`Bricks_${safeName}.3mf`, colorBlob);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
