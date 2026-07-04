import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PrintTolerances, STUD_PITCH, BASE_STUD_HEIGHT } from '../math/tolerances';

export class KlemmbrickGenerator {
  public width: number;
  public length: number;
  public tolerances: PrintTolerances;
  public heightScale: number;

  constructor(
    width: number,
    length: number,
    tolerances: PrintTolerances,
    heightScale: number = 1 / 3
  ) {
    this.width = width;
    this.length = length;
    this.tolerances = tolerances;
    this.heightScale = heightScale;
  }

  public generateGeometry(): THREE.BufferGeometry {
    const geometriesToMerge: THREE.BufferGeometry[] = [];
    
    const wallPlay = 0.2;
    const baseHeight = 9.6 * this.heightScale; // 3.2mm for plate
    const ceilingThickness = 1.0; 
    const cavityHeight = baseHeight - ceilingThickness; // 2.2mm
    
    // Exact Klemmbrick 1x1 dimensions matching the reference STL
    const wallThickness = 1.0; // Thick enough for rigidity, leaves 5.8mm cavity
    const cavitySize = STUD_PITCH - wallPlay - (wallThickness * 2); // 7.8 - 2.0 = 5.8mm
    
    // The stud is 4.8mm. The ribs need to grip the stud.
    // Rib depth = (Cavity - Stud) / 2
    const targetStudDiameter = this.tolerances.studDiameter;
    const ribDepth = (cavitySize - targetStudDiameter) / 2;
    const ribWidth = 1.0; // Wide enough to print cleanly
    
    const overallWidth = this.width * STUD_PITCH - wallPlay;
    const overallLength = this.length * STUD_PITCH - wallPlay;
    const innerWidth = overallWidth - (wallThickness * 2);
    const innerLength = overallLength - (wallThickness * 2);

    // 1. Ceiling (Solid top plate)
    const ceilingGeo = new THREE.BoxGeometry(overallWidth, ceilingThickness, overallLength);
    ceilingGeo.translate(0, baseHeight - ceilingThickness / 2, 0);
    geometriesToMerge.push(ceilingGeo);

    // 2. The 4 Outer Walls
    const nsWallGeo = new THREE.BoxGeometry(overallWidth, cavityHeight, wallThickness);
    const nWall = nsWallGeo.clone();
    nWall.translate(0, cavityHeight / 2, -overallLength / 2 + wallThickness / 2);
    const sWall = nsWallGeo.clone();
    sWall.translate(0, cavityHeight / 2, overallLength / 2 - wallThickness / 2);
    geometriesToMerge.push(nWall, sWall);

    if (innerLength > 0) {
      const ewWallGeo = new THREE.BoxGeometry(wallThickness, cavityHeight, innerLength);
      const eWall = ewWallGeo.clone();
      eWall.translate(overallWidth / 2 - wallThickness / 2, cavityHeight / 2, 0);
      const wWall = ewWallGeo.clone();
      wWall.translate(-overallWidth / 2 + wallThickness / 2, cavityHeight / 2, 0);
      geometriesToMerge.push(eWall, wWall);
    }

    // 3. Top Studs
    const studRadius = this.tolerances.studDiameter / 2;
    const studGeo = new THREE.CylinderGeometry(studRadius, studRadius, BASE_STUD_HEIGHT, 16);
    studGeo.translate(0, baseHeight + (BASE_STUD_HEIGHT / 2), 0);

    const startX = -overallWidth / 2 + (STUD_PITCH / 2) - (wallPlay / 2);
    const startZ = -overallLength / 2 + (STUD_PITCH / 2) - (wallPlay / 2);

    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.length; z++) {
        const studClone = studGeo.clone();
        studClone.translate(startX + x * STUD_PITCH, 0, startZ + z * STUD_PITCH);
        geometriesToMerge.push(studClone);
      }
    }

    // 4. Inner Ribs (Perimeter)
    const nsRibGeo = new THREE.BoxGeometry(ribWidth, cavityHeight, ribDepth);
    const ewRibGeo = new THREE.BoxGeometry(ribDepth, cavityHeight, ribWidth);
    
    // North/South Ribs
    for (let x = 0; x < this.width; x++) {
      const posX = startX + x * STUD_PITCH;
      const nRib = nsRibGeo.clone();
      nRib.translate(posX, cavityHeight / 2, -innerLength / 2 + ribDepth / 2);
      const sRib = nsRibGeo.clone();
      sRib.translate(posX, cavityHeight / 2, innerLength / 2 - ribDepth / 2);
      geometriesToMerge.push(nRib, sRib);
    }
    // East/West Ribs
    for (let z = 0; z < this.length; z++) {
      const posZ = startZ + z * STUD_PITCH;
      const eRib = ewRibGeo.clone();
      eRib.translate(innerWidth / 2 - ribDepth / 2, cavityHeight / 2, posZ);
      const wRib = ewRibGeo.clone();
      wRib.translate(-innerWidth / 2 + ribDepth / 2, cavityHeight / 2, posZ);
      geometriesToMerge.push(eRib, wRib);
    }

    // 5. Central Features (Posts & Tubes)
    if (this.width === 1 && this.length === 1) {
      // 1x1: Empty cavity with ribs (no central stopper post per user request)
    } else if (this.width === 1 || this.length === 1) {
      // 1xN or Nx1: Solid/Hollow pips between studs
      const numPips = Math.max(this.width, this.length) - 1;
      const pipRadius = 3.2 / 2; // standard 3.2mm outer diameter for 1xN tubes
      const pipGeo = new THREE.CylinderGeometry(pipRadius, pipRadius, cavityHeight, 16);
      pipGeo.translate(0, cavityHeight / 2, 0);

      for (let i = 0; i < numPips; i++) {
        const pipClone = pipGeo.clone();
        if (this.width > 1) {
          const posX = startX + (i * STUD_PITCH) + (STUD_PITCH / 2);
          pipClone.translate(posX, 0, 0);
        } else {
          const posZ = startZ + (i * STUD_PITCH) + (STUD_PITCH / 2);
          pipClone.translate(0, 0, posZ);
        }
        geometriesToMerge.push(pipClone);
      }
    } else {
      // NxM: Standard receiving tubes
      const innerRadius = 4.8 / 2;
      const outerRadius = 6.51 / 2;
      
      const shape = new THREE.Shape();
      shape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false);
      const hole = new THREE.Path();
      hole.absarc(0, 0, innerRadius, 0, Math.PI * 2, true);
      shape.holes.push(hole);

      const tubeGeo = new THREE.ExtrudeGeometry(shape, {
        depth: cavityHeight,
        bevelEnabled: false,
        curveSegments: 16
      });
      tubeGeo.rotateX(Math.PI / 2);
      tubeGeo.translate(0, cavityHeight, 0);

      for (let x = 0; x < this.width - 1; x++) {
        for (let z = 0; z < this.length - 1; z++) {
          const tubeClone = tubeGeo.clone();
          const posX = startX + x * STUD_PITCH + (STUD_PITCH / 2);
          const posZ = startZ + z * STUD_PITCH + (STUD_PITCH / 2);
          tubeClone.translate(posX, 0, posZ);
          geometriesToMerge.push(tubeClone);
        }
      }
    }

    // Sanitize and merge
    const sanitizedGeometries = geometriesToMerge.map(g => {
      let geo = g;
      if (geo.index) geo = geo.toNonIndexed();
      geo.deleteAttribute('uv');
      geo.deleteAttribute('normal');
      return geo;
    });

    const merged = mergeGeometries(sanitizedGeometries, false);
    if (!merged) {
      console.error("Failed to merge Klemmbrick geometries.");
      return new THREE.BufferGeometry();
    }
    
    merged.computeVertexNormals();

    return merged;
  }
}
