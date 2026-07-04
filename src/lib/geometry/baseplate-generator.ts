import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PrintTolerances, STUD_PITCH, BASE_STUD_HEIGHT } from '../math/tolerances';
import { VoxelMatrix } from '../types';

export interface InstanceData {
  matrix: THREE.Matrix4;
}

export interface NonUniformInstancedGeometry {
  baseGeometry: THREE.BufferGeometry;
  instances: InstanceData[];
}

export class BaseplateGenerator {
  public width: number;
  public length: number;
  public tolerances: PrintTolerances;
  public baseHeightRatio: number; // 1 for standard brick, 1/3 for plate
  public voxelMatrix?: VoxelMatrix | null;

  constructor(width: number, length: number, tolerances: PrintTolerances, baseHeightRatio: number = 1/3, voxelMatrix?: VoxelMatrix | null) {
    this.width = width;
    this.length = length;
    this.tolerances = tolerances;
    this.baseHeightRatio = baseHeightRatio;
    this.voxelMatrix = voxelMatrix;
  }

  /**
   * Generates a precise 3D mesh by merging the base box with stud cylinders.
   * This handles non-uniform elements seamlessly since each stud can be transformed
   * independently before baking.
   */
  public generateGeometry(): THREE.BufferGeometry {
    const geometriesToMerge: THREE.BufferGeometry[] = [];
    
    // Standard brick height is 9.6mm. Plate is 3.2mm.
    const blockHeight = 9.6 * this.baseHeightRatio;
    
    // The play between adjoining bricks is generally 0.2mm overall (0.1mm per side)
    const wallPlay = 0.2;
    const overallWidth = this.width * STUD_PITCH - wallPlay;
    const overallLength = this.length * STUD_PITCH - wallPlay;

    // 1. Base Box(es)
    let isHeightmap = false;
    if (this.voxelMatrix && this.voxelMatrix.cells[0]?.[0]?.height !== undefined) {
      isHeightmap = true;
    }

    if (!isHeightmap) {
      const boxGeo = new THREE.BoxGeometry(overallWidth, blockHeight, overallLength);
      // Center the baseplate at origin in X/Z, rest on Y=0
      boxGeo.translate(0, blockHeight / 2, 0);
      // Baseplate is usually a neutral color (e.g. blue here or gray). Let's use blue base for visual.
      const baseColor = new THREE.Color('#3b82f6');
      this.applyVertexColors(boxGeo, baseColor);
      geometriesToMerge.push(boxGeo);
    }

    // 2. Studs
    const studRadius = this.tolerances.studDiameter / 2;
    // We use 16 segments for performance, which is sufficient for printing tiny studs
    const studGeo = new THREE.CylinderGeometry(studRadius, studRadius, BASE_STUD_HEIGHT, 16);
    studGeo.translate(0, BASE_STUD_HEIGHT / 2, 0); // rest cylinder on origin

    const startX = -overallWidth / 2 + (STUD_PITCH / 2) - (wallPlay / 2);
    const startZ = -overallLength / 2 + (STUD_PITCH / 2) - (wallPlay / 2);

    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.length; z++) {
        const cell = this.voxelMatrix?.cells[x]?.[z];
        const cellHeightMultiplier = cell?.height ?? 1;
        // Plate height is 3.2mm. Height of 1 means 1 plate. Height 0 means 0 plates.
        const currentBlockHeight = isHeightmap ? cellHeightMultiplier * 3.2 : blockHeight;

        const posX = startX + x * STUD_PITCH;
        const posZ = startZ + z * STUD_PITCH;

        // If heightmap, create the column box for this cell
        if (isHeightmap && currentBlockHeight > 0) {
          const colGeo = new THREE.BoxGeometry(STUD_PITCH, currentBlockHeight, STUD_PITCH);
          colGeo.translate(posX, currentBlockHeight / 2, posZ);
          this.applyVertexColors(colGeo, new THREE.Color('#3b82f6'));
          geometriesToMerge.push(colGeo);
        }

        // Create the stud on top
        if (currentBlockHeight > 0) {
          const studClone = studGeo.clone();
          studClone.translate(posX, currentBlockHeight, posZ);

          // For mosaics, the baseplate should remain uniformly colored.
          // For heightmaps, we can color the studs if desired.
          let c = new THREE.Color('#3b82f6');
          if (isHeightmap && cell?.hexColor) {
            c = new THREE.Color(cell.hexColor);
          }
          this.applyVertexColors(studClone, c);

          geometriesToMerge.push(studClone);
        }
      }
    }

    // Merge everything into a single BufferGeometry for CSG or rendering
    const mergedGeometry = mergeGeometries(geometriesToMerge, false);
    
    mergedGeometry.computeVertexNormals();

    return mergedGeometry;
  }

  /**
   * For Phase 1 compatibility: return the non-uniform data structure before merging.
   * Useful when different components need different boolean operations.
   */
  /**
   * Helper to set vertex colors for a whole geometry buffer
   */
  private applyVertexColors(geometry: THREE.BufferGeometry, color: THREE.Color) {
    const positionAttribute = geometry.getAttribute('position');
    const colors = new Float32Array(positionAttribute.count * 3);
    for (let i = 0; i < positionAttribute.count; i++) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }
}
