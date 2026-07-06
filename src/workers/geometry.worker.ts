import * as THREE from 'three';
import { KlemmbrickGenerator } from '../lib/geometry/klemmbrick-generator';
import { BaseplateGenerator } from '../lib/geometry/baseplate-generator';
import { calculateTolerances } from '../lib/math/tolerances';

function serializeGeometry(geometry: THREE.BufferGeometry) {
  const position = geometry.attributes.position?.array as Float32Array;
  const normal = geometry.attributes.normal?.array as Float32Array;
  const uv = geometry.attributes.uv?.array as Float32Array;
  const index = geometry.index?.array as Uint32Array | Uint16Array;
  
  const transferables: Transferable[] = [];
  if (position) transferables.push(position.buffer);
  if (normal) transferables.push(normal.buffer);
  if (uv) transferables.push(uv.buffer);
  if (index) transferables.push(index.buffer);
  
  return {
    data: { position, normal, uv, index },
    transferables
  };
}

self.onmessage = (event) => {
  const { type, id, params } = event.data;

  try {
    if (type === 'GENERATE_BRICKS') {
      const { sizes, materialProfile, snapFit, highResMode } = params;
      const tolerances = calculateTolerances(materialProfile, snapFit);
      
      const results = sizes.map(([w, l]: [number, number]) => {
        const gen = new KlemmbrickGenerator(w, l, tolerances.snapFit, 1/3, false, !highResMode);
        const geometry = gen.generateGeometry();
        return { key: `${w}x${l}`, ...serializeGeometry(geometry) };
      });
      
      const allTransferables = results.flatMap((r: any) => r.transferables);
      const allData = results.map((r: any) => ({ key: r.key, data: r.data }));
      
      self.postMessage({ type: 'BRICKS_GENERATED', id, data: allData }, { transfer: allTransferables });
    }
    
    else if (type === 'GENERATE_BASEPLATE_CHUNKS') {
      const { chunks, tolerances, connectorHoleDiameter, connectorHoleDepth, holePlacement, designType, baseHeightRatio, studlessBorder, borderWidth, totalWidth, totalLength } = params;
      
      const resultChunks = chunks.map((chunkDef: any) => {
        const { gridW, gridL, passMatrix, voxelMatrix } = chunkDef;
        
        const hasHoles = designType === 'frame';
        const effectiveBaseHeightRatio = designType === 'frame' ? 1.0 : baseHeightRatio;
        
        let hl = hasHoles, hr = hasHoles, ht = hasHoles, hb = hasHoles;
        if (hasHoles) {
          // Universal Rule: Holes on all internal seams, but NO holes on the absolute outer perimeter.
          if (chunkDef.gridX === 0) hl = false;
          if (chunkDef.gridX + gridW === totalWidth) hr = false;
          if (chunkDef.gridZ === 0) ht = false;
          if (chunkDef.gridZ + gridL === totalLength) hb = false;
        }

        const gen = new BaseplateGenerator(
          gridW, gridL, tolerances.snapFit, effectiveBaseHeightRatio, passMatrix ? voxelMatrix : null,
          hl, hr, ht, hb,
          connectorHoleDiameter, connectorHoleDepth, false, holePlacement,
          studlessBorder, borderWidth, chunkDef.gridX, chunkDef.gridZ, totalWidth, totalLength, chunkDef.partType
        );
        
        const geom = gen.generateGeometry();
        return serializeGeometry(geom);
      });
      
      const allTransferables = resultChunks.flatMap((res: any) => res.transferables);
      const allData = resultChunks.map((res: any) => res.data);
      
      self.postMessage({ type: 'BASEPLATE_CHUNKS_GENERATED', id, data: allData }, { transfer: allTransferables });
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', id, error: String(error) });
  }
};
