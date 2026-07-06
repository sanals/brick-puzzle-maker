import JSZip from 'jszip';
import { BaseplateGenerator } from '../geometry/baseplate-generator';
import { engraveTextOnBottom } from '../geometry/csg-utils';
import { build3MF } from './generic-3mf-exporter';
import { VoxelMatrix, VoxelCell } from '../types';
import { PrintTolerances } from '../math/tolerances';
import { ConnectorGenerator } from '../geometry/connector-generator';

const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

export async function exportChunkedBaseplates(
  width: number,
  length: number,
  tolerances: PrintTolerances,
  voxelMatrix: VoxelMatrix | null,
  chunkSize = 16,
  connectorHoleDiameter: number = 5.1,
  connectorHoleDepth: number = 8.5,
  holePlacement: 'corners' | 'dense' = 'corners'
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
      const generator = new BaseplateGenerator(
        chunkWidth, 
        chunkLength, 
        tolerances, 
        1.0, 
        chunkMatrix, 
        true, 
        true, 
        true, 
        true,
        connectorHoleDiameter,
        connectorHoleDepth,
        true, // isExport
        holePlacement
      );
      let geometry = generator.generateGeometry();

      // Engrave text on bottom (e.g. "A1", "B2")
      const colLetter = String.fromCharCode(65 + cx); // A, B, C...
      const rowNumber = cz + 1; // 1, 2, 3...
      const label = `${colLetter}${rowNumber}`;

      geometry = await engraveTextOnBottom(geometry, label, chunkWidth * 8, chunkLength * 8);

      // Export to 3MF
      const blob = await build3MF(geometry, '#3b82f6');
      zip.file(`Baseplate_Chunk_${cx + 1}_${cz + 1}.3mf`, blob);
      await yieldToMain();
    }
  }

  // Include connector pin if there are multiple chunks
  if (numChunksX > 1 || numChunksZ > 1) {
    const connGen = new ConnectorGenerator(tolerances, connectorHoleDiameter, connectorHoleDepth);
    const connGeo = connGen.generateGeometry();
    const connBlob = await build3MF(connGeo);
    zip.file('Technic_Pin.3mf', connBlob);
  }

  return zip.generateAsync({ type: 'blob' });
}
