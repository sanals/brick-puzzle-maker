import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Evaluator, Brush } from 'three-bvh-csg';
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
  public baseHeightRatio: number;
  public voxelMatrix?: VoxelMatrix | null;
  public hasLeftHoles: boolean;
  public hasRightHoles: boolean;
  public hasTopHoles: boolean;
  public hasBottomHoles: boolean;
  public connectorHoleDiameter: number;
  public connectorHoleDepth: number;
  public isExport: boolean;

  constructor(
    width: number, 
    length: number, 
    tolerances: PrintTolerances, 
    baseHeightRatio: number = 1.0, 
    voxelMatrix?: VoxelMatrix | null,
    hasLeftHoles: boolean = false,
    hasRightHoles: boolean = false,
    hasTopHoles: boolean = false,
    hasBottomHoles: boolean = false,
    connectorHoleDiameter: number = 5.1,
    connectorHoleDepth: number = 8.5,
    isExport: boolean = false
  ) {
    this.width = width;
    this.length = length;
    this.tolerances = tolerances;
    this.baseHeightRatio = baseHeightRatio;
    this.voxelMatrix = voxelMatrix;
    this.hasLeftHoles = hasLeftHoles;
    this.hasRightHoles = hasRightHoles;
    this.hasTopHoles = hasTopHoles;
    this.hasBottomHoles = hasBottomHoles;
    this.connectorHoleDiameter = connectorHoleDiameter;
    this.connectorHoleDepth = connectorHoleDepth;
    this.isExport = isExport;
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
    // Sink the stud slightly to avoid coplanar CSG precision errors (infinite loops)
    const studGeo = new THREE.CylinderGeometry(studRadius, studRadius, BASE_STUD_HEIGHT + 0.02, 16);
    studGeo.translate(0, (BASE_STUD_HEIGHT + 0.02) / 2 - 0.01, 0); // rest cylinder on origin, sunken by 0.01

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

    let mergedGeometry = geometriesToMerge[0];
    const studsGeometries = geometriesToMerge.slice(1);

    // Only run heavy CSG union for export. For live rendering, triangle soup is much faster.
    if (this.isExport && studsGeometries.length > 0) {
      const baseBrush = new Brush(geometriesToMerge[0]); // The main box
      const evaluator = new Evaluator();
      evaluator.useGroups = false;

      const mergedStuds = mergeGeometries(studsGeometries, false);
      const studsBrush = new Brush(mergedStuds);
      const unionResult = evaluator.evaluate(baseBrush, studsBrush, 0); // 0 = ADDITION
      mergedGeometry = unionResult.geometry;
    } else if (studsGeometries.length > 0) {
      mergedGeometry = mergeGeometries(geometriesToMerge, false);
    }
    
    // 3. Technic CSG Holes
    if (this.hasLeftHoles || this.hasRightHoles || this.hasTopHoles || this.hasBottomHoles) {
      const holeRadius = this.connectorHoleDiameter / 2; // Default FDM tolerance for a 4.8mm pin is 5.1
      const holeDepth = this.connectorHoleDepth; // Depth of the hole into the side
      const holeY = 4.8; // Center of a 9.6mm tall brick
      const holeInterval = 8; // One hole every 8 studs

      const holeGeometries: THREE.BufferGeometry[] = [];

      // Helper to generate symmetric holes along an edge
      const generateHoles = (
        isXEdge: boolean, 
        edgeOffset: number, 
        lengthStuds: number,
        startStudOffset: number
      ) => {
        const holeIndices = new Set<number>();
        
        // Lego Math dictates that perfectly symmetric 8-stud repeating grids 
        // are impossible on most board sizes. 
        // The most foolproof and standard way to guarantee any two boards 
        // can connect flush at their corners is to place exactly two holes per edge, 
        // anchored a fixed distance from the corners.
        // We place them at the 5th stud from the corner (index 4).
        if (lengthStuds >= 12) {
          holeIndices.add(4);
          holeIndices.add(lengthStuds - 1 - 4);
        }

        Array.from(holeIndices).forEach(i => {
          const geo = new THREE.CylinderGeometry(holeRadius, holeRadius, holeDepth, 16);
          // Rotate cylinder so it points into the face
          if (isXEdge) {
            geo.rotateZ(Math.PI / 2); // points along X
            geo.translate(edgeOffset, holeY, startStudOffset + i * STUD_PITCH);
          } else {
            geo.rotateX(Math.PI / 2); // points along Z
            geo.translate(startStudOffset + i * STUD_PITCH, holeY, edgeOffset);
          }
          holeGeometries.push(geo);
        });
      };

      if (this.hasLeftHoles) generateHoles(true, -overallWidth / 2, this.length, startZ);
      if (this.hasRightHoles) generateHoles(true, overallWidth / 2, this.length, startZ);
      if (this.hasTopHoles) generateHoles(false, -overallLength / 2, this.width, startX);
      if (this.hasBottomHoles) generateHoles(false, overallLength / 2, this.width, startX);

      if (holeGeometries.length > 0) {
        const mergedHoles = mergeGeometries(holeGeometries, false);
        
        // Use three-bvh-csg to subtract holes
        const baseBrush = new Brush(mergedGeometry);
        const holeBrush = new Brush(mergedHoles);
        
        const evaluator = new Evaluator();
        const result = evaluator.evaluate(baseBrush, holeBrush, 1); // 1 = SUBTRACTION
        
        mergedGeometry = result.geometry;
      }
    }

    mergedGeometry.computeVertexNormals();

    return mergedGeometry;
  }
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
