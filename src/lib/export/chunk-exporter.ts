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
  holePlacement: 'corners' | 'dense' = 'corners',
  designType: 'normal' | 'frame' = 'normal',
  baseHeightRatio: number = 1.0,
  studlessBorder: boolean = false,
  borderWidth: number = 0
): Promise<Blob> {
  const zip = new JSZip();

  const totalWidth = width + 2 * borderWidth;
  const totalLength = length + 2 * borderWidth;
  
  let chunkDefs: any[] = [];
  
  if (designType === 'normal' || borderWidth === 0) {
    const numX = Math.ceil(totalWidth / chunkSize);
    const numZ = Math.ceil(totalLength / chunkSize);
    for (let x = 0; x < numX; x++) {
      for (let z = 0; z < numZ; z++) {
        const chunkW = (x === numX - 1 && totalWidth % chunkSize !== 0) ? totalWidth % chunkSize : chunkSize;
        const chunkL = (z === numZ - 1 && totalLength % chunkSize !== 0) ? totalLength % chunkSize : chunkSize;
        const chunkGridStartX = x * chunkSize;
        const chunkGridStartZ = z * chunkSize;
        chunkDefs.push({ gridX: chunkGridStartX, gridZ: chunkGridStartZ, gridW: chunkW, gridL: chunkL, partType: 'main' });
      }
    }
  } else {
    // Frame logic with detached borders
    const numX = Math.ceil(width / chunkSize);
    const numZ = Math.ceil(length / chunkSize);
    for (let x = 0; x < numX; x++) {
      for (let z = 0; z < numZ; z++) {
        const chunkW = (x === numX - 1 && width % chunkSize !== 0) ? width % chunkSize : chunkSize;
        const chunkL = (z === numZ - 1 && length % chunkSize !== 0) ? length % chunkSize : chunkSize;
        const chunkGridStartX = x * chunkSize;
        const chunkGridStartZ = z * chunkSize;
        chunkDefs.push({ gridX: chunkGridStartX + borderWidth, gridZ: chunkGridStartZ + borderWidth, gridW: chunkW, gridL: chunkL, partType: 'main' });
      }
    }
    for (let x = 0; x < numX; x++) {
      const chunkW = (x === numX - 1 && width % chunkSize !== 0) ? width % chunkSize : chunkSize;
      const chunkGridStartX = x * chunkSize;
      chunkDefs.push({ gridX: chunkGridStartX + borderWidth, gridZ: 0, gridW: chunkW, gridL: borderWidth, partType: 'border_top' });
      chunkDefs.push({ gridX: chunkGridStartX + borderWidth, gridZ: length + borderWidth, gridW: chunkW, gridL: borderWidth, partType: 'border_bottom' });
    }
    for (let z = 0; z < numZ; z++) {
      const chunkL = (z === numZ - 1 && length % chunkSize !== 0) ? length % chunkSize : chunkSize;
      const chunkGridStartZ = z * chunkSize;
      chunkDefs.push({ gridX: 0, gridZ: chunkGridStartZ + borderWidth, gridW: borderWidth, gridL: chunkL, partType: 'border_left' });
      chunkDefs.push({ gridX: width + borderWidth, gridZ: chunkGridStartZ + borderWidth, gridW: borderWidth, gridL: chunkL, partType: 'border_right' });
    }
    chunkDefs.push({ gridX: 0, gridZ: 0, gridW: borderWidth, gridL: borderWidth, partType: 'corner_tl' });
    chunkDefs.push({ gridX: width + borderWidth, gridZ: 0, gridW: borderWidth, gridL: borderWidth, partType: 'corner_tr' });
    chunkDefs.push({ gridX: 0, gridZ: length + borderWidth, gridW: borderWidth, gridL: borderWidth, partType: 'corner_bl' });
    chunkDefs.push({ gridX: width + borderWidth, gridZ: length + borderWidth, gridW: borderWidth, gridL: borderWidth, partType: 'corner_br' });
  }

  for (let i = 0; i < chunkDefs.length; i++) {
    const chunkDef = chunkDefs[i];
    const { gridW, gridL, gridX, gridZ, partType } = chunkDef;
    
    // Matrix handling only applies to the main area. If we are parsing a border piece, it has no voxelMatrix underneath it.
    let chunkMatrix: VoxelMatrix | null = null;
    if (voxelMatrix && partType === 'main') {
      const cells: VoxelCell[][] = Array.from({ length: gridW }, () => new Array<VoxelCell>(gridL));
      for (let x = 0; x < gridW; x++) {
        for (let z = 0; z < gridL; z++) {
          // Adjust for borderWidth offset when referencing the original matrix
          const originalX = designType === 'frame' ? gridX - borderWidth + x : gridX + x;
          const originalZ = designType === 'frame' ? gridZ - borderWidth + z : gridZ + z;
          if (originalX >= 0 && originalX < voxelMatrix.width && originalZ >= 0 && originalZ < voxelMatrix.height) {
            cells[x][z] = voxelMatrix.cells[originalX][originalZ];
          } else {
             cells[x][z] = { height: 0, hexColor: '#3b82f6', label: '', colorIndex: 0 };
          }
        }
      }
      chunkMatrix = {
        width: gridW,
        height: gridL,
        cells,
        palette: voxelMatrix.palette
      };
    }

    const hasHoles = designType === 'frame';
    const effectiveBaseHeightRatio = designType === 'frame' ? 1.0 : baseHeightRatio;
    
    let hl = hasHoles, hr = hasHoles, ht = hasHoles, hb = hasHoles;
    if (hasHoles) {
      if (gridX === 0) hl = false;
      if (gridX + gridW === totalWidth) hr = false;
      if (gridZ === 0) ht = false;
      if (gridZ + gridL === totalLength) hb = false;
    }

    const generator = new BaseplateGenerator(
      gridW, 
      gridL, 
      tolerances, 
      effectiveBaseHeightRatio, 
      chunkMatrix, 
      hl, 
      hr, 
      ht, 
      hb,
      connectorHoleDiameter,
      connectorHoleDepth,
      true, // isExport
      holePlacement,
      studlessBorder,
      borderWidth,
      gridX,
      gridZ,
      totalWidth,
      totalLength,
      partType
    );
    let geometry = generator.generateGeometry();

    const label = `${partType}_X${gridX}_Z${gridZ}`;
    geometry = await engraveTextOnBottom(geometry, label, gridW * 8, gridL * 8);

    const blob = await build3MF(geometry, '#3b82f6');
    
    const folder = partType === 'main' ? 'Baseplates' : 'Borders';
    zip.file(`${folder}/${label}.3mf`, blob);
    await yieldToMain();
  }

  // Include connector pin if there are multiple chunks
  if (chunkDefs.length > 1) {
    const connGen = new ConnectorGenerator(tolerances, connectorHoleDiameter, connectorHoleDepth);
    const connGeo = connGen.generateGeometry();
    const connBlob = await build3MF(connGeo);
    zip.file('Technic_Pin.3mf', connBlob);
  }

  return zip.generateAsync({ type: 'blob' });
}
