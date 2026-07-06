import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PrintTolerances } from '../math/tolerances';

export class ConnectorGenerator {
  public tolerances: PrintTolerances;
  public connectorHoleDiameter: number;
  public connectorHoleDepth: number;

  constructor(
    tolerances: PrintTolerances, 
    connectorHoleDiameter: number = 5.1,
    connectorHoleDepth: number = 8.5
  ) {
    this.tolerances = tolerances;
    this.connectorHoleDiameter = connectorHoleDiameter;
    this.connectorHoleDepth = connectorHoleDepth;
  }

  public generateGeometry(): THREE.BufferGeometry {
    const geometriesToMerge: THREE.BufferGeometry[] = [];
    
    // Technic pin design for FDM printing
    // The standard hole is 4.8mm to 5.0mm. We use 4.8mm diameter for the pin body (radius 2.4).
    // The total length of a pin connecting two 1-stud walls is about 16mm.
    // If the user specifies a larger/smaller hole, we adjust the pin size relative to it (-0.3mm tolerance).
    const pinRadius = (this.connectorHoleDiameter - 0.3) / 2;
    // We want the pin to be slightly shorter than the combined depth of both holes so it fits flush.
    const pinLength = (this.connectorHoleDepth * 2) - 1.0; 
    const ridgeRadius = pinRadius + 0.2; // Center ridge slightly larger to act as a stopper
    const ridgeWidth = 1.0;

    // We'll create it lying down along the X axis
    // 1. Left side cylinder
    const leftSideLength = (pinLength - ridgeWidth) / 2;
    const leftCyl = new THREE.CylinderGeometry(pinRadius, pinRadius, leftSideLength, 16);
    leftCyl.rotateZ(Math.PI / 2);
    leftCyl.translate(-leftSideLength / 2 - ridgeWidth / 2, 0, 0);
    geometriesToMerge.push(leftCyl);

    // 2. Right side cylinder
    const rightSideLength = leftSideLength;
    const rightCyl = new THREE.CylinderGeometry(pinRadius, pinRadius, rightSideLength, 16);
    rightCyl.rotateZ(Math.PI / 2);
    rightCyl.translate(rightSideLength / 2 + ridgeWidth / 2, 0, 0);
    geometriesToMerge.push(rightCyl);

    // 3. Center Ridge
    const ridgeCyl = new THREE.CylinderGeometry(ridgeRadius, ridgeRadius, ridgeWidth, 16);
    ridgeCyl.rotateZ(Math.PI / 2);
    geometriesToMerge.push(ridgeCyl);

    // 4. Chamfers on ends for easy insertion
    const chamferLength = 1.0;
    const chamferRadius = pinRadius - 0.4;
    
    // Left Chamfer
    const leftChamfer = new THREE.CylinderGeometry(chamferRadius, pinRadius, chamferLength, 16);
    leftChamfer.rotateZ(Math.PI / 2);
    leftChamfer.translate(-pinLength / 2 + chamferLength / 2, 0, 0);
    geometriesToMerge.push(leftChamfer);
    
    // Right Chamfer
    const rightChamfer = new THREE.CylinderGeometry(pinRadius, chamferRadius, chamferLength, 16);
    rightChamfer.rotateZ(Math.PI / 2);
    rightChamfer.translate(pinLength / 2 - chamferLength / 2, 0, 0);
    geometriesToMerge.push(rightChamfer);

    const merged = mergeGeometries(geometriesToMerge, false);
    
    // Color it light gray for rendering 
    this.applyVertexColors(merged, new THREE.Color('#9ca3af'));
    
    merged.computeVertexNormals();
    return merged;
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
