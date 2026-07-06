import JSZip from 'jszip';
import { BaseplateGenerator } from '../geometry/baseplate-generator';
import { KlemmbrickGenerator } from '../geometry/klemmbrick-generator';
import { ConnectorGenerator } from '../geometry/connector-generator';
import { build3MF } from './generic-3mf-exporter';
import { VoxelMatrix } from '../types';
import { PrintTolerances } from '../math/tolerances';
import { OptimizedBrick } from '../geometry/brick-optimizer';

const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

/**
 * Exports a ZIP containing the baseplate and separate 3MF files for each color in the mosaic.
 */
export async function exportMosaicBatches(
  width: number,
  length: number,
  tolerances: PrintTolerances,
  voxelMatrix: VoxelMatrix,
  customBricks: OptimizedBrick[],
  baseChunkSize: number = 0,
  borderWidth: number = 0,
  connectorHoleDiameter: number = 5.1,
  connectorHoleDepth: number = 8.5,
  holePlacement: 'corners' | 'dense' = 'corners'
): Promise<Blob> {
  const zip = new JSZip();

  const totalWidth = width + 2 * borderWidth;
  const totalLength = length + 2 * borderWidth;

  // 1. Export the baseplate(s)
  if (baseChunkSize === 0) {
    const baseGen = new BaseplateGenerator(
      totalWidth, totalLength, tolerances, 1, null,
      true, true, true, true,
      connectorHoleDiameter, connectorHoleDepth,
      true, holePlacement
    );
    const baseGeo = baseGen.generateGeometry();
    const baseBlob = await build3MF(baseGeo, '#3b82f6');
    zip.file(`00_Baseplate_${totalWidth}x${totalLength}.3mf`, baseBlob);
  } else {
    const numX = Math.ceil(totalWidth / baseChunkSize);
    const numZ = Math.ceil(totalLength / baseChunkSize);

    for (let x = 0; x < numX; x++) {
      for (let z = 0; z < numZ; z++) {
        const chunkW = (x === numX - 1 && totalWidth % baseChunkSize !== 0) ? totalWidth % baseChunkSize : baseChunkSize;
        const chunkL = (z === numZ - 1 && totalLength % baseChunkSize !== 0) ? totalLength % baseChunkSize : baseChunkSize;
        
        const gen = new BaseplateGenerator(
          chunkW, chunkL, tolerances, 1, null, 
          true, true, true, true,
          connectorHoleDiameter, connectorHoleDepth,
          true, holePlacement
        );
        const baseGeo = gen.generateGeometry();
        const baseBlob = await build3MF(baseGeo, '#3b82f6');
        zip.file(`00_Baseplate_Chunk_${x + 1}_${z + 1}.3mf`, baseBlob);
        await yieldToMain();
      }
    }
    
    // Generate Connector Pin
    const connectorGen = new ConnectorGenerator(tolerances, connectorHoleDiameter, connectorHoleDepth);
    const pinGeo = connectorGen.generateGeometry();
    const pinBlob = await build3MF(pinGeo, '#ff0000');
    zip.file(`00_Connector_Pin.3mf`, pinBlob);
    await yieldToMain();
  }

  // 2. Export each color layer separately using custom bricks
  const colorsMap = new Map<string, { label: string, bricks: OptimizedBrick[] }>();
  
  for (const color of voxelMatrix.palette) {
    colorsMap.set(color.hex, { label: color.label, bricks: [] });
  }
  
  for (const brick of customBricks) {
    if (colorsMap.has(brick.hexColor)) {
      colorsMap.get(brick.hexColor)!.bricks.push(brick);
    }
  }

  for (const [hex, data] of colorsMap.entries()) {
    if (data.bricks.length === 0) continue;

    const zipFolder = zip.folder(`Bricks_${data.label.replace(/[^a-zA-Z0-9]/g, '_')}`);
    if (!zipFolder) continue;

    // Group identical bricks in this color by WxL
    const brickTypes = new Map<string, number>();
    for (const b of data.bricks) {
      const key = `${b.width}x${b.length}`;
      brickTypes.set(key, (brickTypes.get(key) || 0) + 1);
    }

    for (const [key, count] of brickTypes.entries()) {
      const [w, l] = key.split('x').map(Number);
      const gen = new KlemmbrickGenerator(w, l, tolerances, 1/3, true, false);
      const geo = gen.generateGeometry();
      
      const blob = await build3MF(geo, hex);
      zipFolder.file(`Print_${count}x_of_${w}x${l}.3mf`, blob);
      await yieldToMain();
    }
  }

  return zip.generateAsync({ type: 'blob' });
}
