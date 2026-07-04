import JSZip from 'jszip';
import { BaseplateGenerator } from '../geometry/baseplate-generator';
import { engraveTextOnBottom } from '../geometry/csg-utils';
import { build3MF } from './generic-3mf-exporter';
import { VoxelMatrix, VoxelCell } from '../types';
import { PrintTolerances } from '../math/tolerances';

export async function exportChunkedBaseplates(
  width: number,
  length: number,
  tolerances: PrintTolerances,
  voxelMatrix: VoxelMatrix | null,
  chunkSize = 16
): Promise<Blob> {
  const zip = new JSZip();

  const numChunksX = Math.ceil(width / chunkSize);
  const numChunksZ = Math.ceil(length / chunkSize);

  for (let cx = 0; cx < numChunksX; cx++) {
    for (let cz = 0; cz < numChunksZ; cz++) {
      const startX = cx * chunkSize;
      const startZ = cz * chunkSize;
      const chunkWidth = Math.min(chunkSize, width - startX);
      const chunkLength = Math.min(chunkSize, length - startZ);

      // Create a sub-matrix for this chunk
      let chunkMatrix: VoxelMatrix | null = null;
      if (voxelMatrix) {
        const cells: VoxelCell[][] = Array.from({ length: chunkWidth }, () => new Array<VoxelCell>(chunkLength));
        for (let x = 0; x < chunkWidth; x++) {
          for (let z = 0; z < chunkLength; z++) {
            cells[x][z] = voxelMatrix.cells[startX + x][startZ + z];
          }
        }
        chunkMatrix = {
          width: chunkWidth,
          height: chunkLength,
          cells,
          palette: voxelMatrix.palette
        };
      }

      // Generate base geometry
      const generator = new BaseplateGenerator(chunkWidth, chunkLength, tolerances, 1/3, chunkMatrix);
      let geometry = generator.generateGeometry();

      // Engrave text on bottom (e.g. "A1", "B2")
      const colLetter = String.fromCharCode(65 + cx); // A, B, C...
      const rowNumber = cz + 1; // 1, 2, 3...
      const label = `${colLetter}${rowNumber}`;

      geometry = await engraveTextOnBottom(geometry, label, chunkWidth * 8, chunkLength * 8);

      // Export to 3MF
      const fileBlob = await build3MF(geometry);
      zip.file(`Plate_${label}.3mf`, fileBlob);
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
