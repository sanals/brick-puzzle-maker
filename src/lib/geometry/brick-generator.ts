import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PrintTolerances, STUD_PITCH } from '../math/tolerances';
import { VoxelMatrix } from '../types';
import { KlemmbrickGenerator } from './klemmbrick-generator';
import { BrickOptimizer, OptimizerOptions, OptimizedBrick } from './brick-optimizer';

export class BrickGenerator {
  public width: number;
  public length: number;
  public tolerances: PrintTolerances;
  public voxelMatrix: VoxelMatrix;
  public targetColorHex?: string; // If set, only generate bricks of this color
  public optimizePieces: boolean;
  public allowNonStandardSizes: boolean;
  public customBricks?: OptimizedBrick[];

  constructor(
    width: number, 
    length: number, 
    tolerances: PrintTolerances, 
    voxelMatrix: VoxelMatrix,
    targetColorHex?: string,
    optimizePieces: boolean = true,
    allowNonStandardSizes: boolean = false,
    customBricks?: OptimizedBrick[]
  ) {
    this.width = width;
    this.length = length;
    this.tolerances = tolerances;
    this.voxelMatrix = voxelMatrix;
    this.targetColorHex = targetColorHex;
    this.optimizePieces = optimizePieces;
    this.allowNonStandardSizes = allowNonStandardSizes;
    this.customBricks = customBricks;
  }

  public generateGeometry(): THREE.BufferGeometry {
    const geometriesToMerge: THREE.BufferGeometry[] = [];
    
    // 1x1 Plate dimensions
    const plateHeight = 3.2;
    const wallPlay = 0.2;
    const blockWidth = STUD_PITCH - wallPlay;
    const blockLength = STUD_PITCH - wallPlay;

    // The entire mosaic base is centered at 0,0
    const overallWidth = this.width * STUD_PITCH - wallPlay;
    const overallLength = this.length * STUD_PITCH - wallPlay;
    
    const startX = -overallWidth / 2 + (STUD_PITCH / 2) - (wallPlay / 2);
    const startZ = -overallLength / 2 + (STUD_PITCH / 2) - (wallPlay / 2);

    // Use customBricks if provided, otherwise run BrickOptimizer to greedily combine pixels
    let optimizedBricks = this.customBricks;
    
    if (!optimizedBricks) {
      const optimizer = new BrickOptimizer(this.voxelMatrix, this.width, this.length);
      optimizedBricks = optimizer.optimize({
        allowNonStandardSizes: this.allowNonStandardSizes
      });
    }
    
    // If optimization is turned off, manually convert all to 1x1 bricks
    if (!this.optimizePieces) {
      optimizedBricks = [];
      for (let x = 0; x < this.width; x++) {
        for (let z = 0; z < this.length; z++) {
          const cell = this.voxelMatrix.cells[x]?.[z];
          if (cell?.hexColor) {
            optimizedBricks.push({ x, z, width: 1, length: 1, hexColor: cell.hexColor });
          }
        }
      }
    }

    // Cache generated Klemmbrick units to avoid rebuilding the same sizes repeatedly
    const geometryCache = new Map<string, THREE.BufferGeometry>();
    const getUnitGeometry = (w: number, l: number) => {
      const key = `${w}x${l}`;
      if (!geometryCache.has(key)) {
        const gen = new KlemmbrickGenerator(w, l, this.tolerances, 1/3);
        geometryCache.set(key, gen.generateGeometry());
      }
      return geometryCache.get(key)!;
    };

    for (const brick of optimizedBricks) {
      // Skip if target color is specified and doesn't match
      if (this.targetColorHex && brick.hexColor !== this.targetColorHex) continue;

      // The position of a multi-stud brick is based on its top-left (startX, startZ)
      // Wait, KlemmbrickGenerator centers the brick around the origin for its overall size!
      // So if a brick is w=2, l=4, its center is at startX + (x + w/2 - 0.5) * STUD_PITCH
      // Actually, let's look at KlemmbrickGenerator: it builds the brick centered at (0,0) across its WxL.
      // So if we place it, we need to translate its center to the correct global center.
      // The local grid center of this brick is at x + (w-1)/2, z + (l-1)/2
      
      const centerX = startX + brick.x * STUD_PITCH + ((brick.width - 1) * STUD_PITCH) / 2;
      const centerZ = startZ + brick.z * STUD_PITCH + ((brick.length - 1) * STUD_PITCH) / 2;
      
      const unit = getUnitGeometry(brick.width, brick.length);
      const brickClone = unit.clone();
      
      brickClone.translate(centerX, 3.2, centerZ);

      // Apply Vertex Colors
      const color = new THREE.Color(brick.hexColor);
      const positionAttribute = brickClone.getAttribute('position');
      const colors = new Float32Array(positionAttribute.count * 3);
      for (let i = 0; i < positionAttribute.count; i++) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      brickClone.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      geometriesToMerge.push(brickClone);
    }

    if (geometriesToMerge.length === 0) {
      // Return an empty geometry if no pieces match
      return new THREE.BufferGeometry();
    }

    const mergedGeometry = mergeGeometries(geometriesToMerge, false);
    mergedGeometry.computeVertexNormals();

    return mergedGeometry;
  }
}
