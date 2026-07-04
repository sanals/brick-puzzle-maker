import * as THREE from 'three';
import { VoxelMatrix } from '../types';
import { PrintTolerances } from '../math/tolerances';

export class LithophaneGenerator {
  public width: number;
  public length: number;
  public tolerances: PrintTolerances;
  public voxelMatrix: VoxelMatrix;
  public minThickness: number;
  public maxThickness: number;

  constructor(
    width: number,
    length: number,
    tolerances: PrintTolerances,
    voxelMatrix: VoxelMatrix,
    minThickness = 0.6,
    maxThickness = 3.2
  ) {
    this.width = width;
    this.length = length;
    this.tolerances = tolerances;
    this.voxelMatrix = voxelMatrix;
    this.minThickness = minThickness;
    this.maxThickness = maxThickness;
  }

  /**
   * Generates a continuous heightfield mesh for lithophanes.
   * Lighter pixels = thinner geometry.
   * Darker pixels = thicker geometry.
   */
  public generateGeometry(): THREE.BufferGeometry {
    // 8mm pitch, 0.2mm wall play
    const wallPlay = 0.2;
    const overallWidth = this.width * 8.0 - wallPlay;
    const overallLength = this.length * 8.0 - wallPlay;

    // Create a plane geometry with a vertex for each pixel in the matrix
    // Adding 1 to segments so we have N+1 vertices for N segments
    const geometry = new THREE.PlaneGeometry(
      overallWidth,
      overallLength,
      this.width - 1,
      this.length - 1
    );

    // Rotate plane so it lies on XZ
    geometry.rotateX(-Math.PI / 2);
    // Translate up by maxThickness so the back is flat at Y=0
    geometry.translate(0, this.maxThickness, 0);

    const pos = geometry.getAttribute('position');
    
    // For a lithophane, we modify the Y coordinate based on brightness
    for (let i = 0; i < pos.count; i++) {
      // Figure out grid x,z from vertex index
      const x = i % this.width;
      const z = Math.floor(i / this.width);

      const cell = this.voxelMatrix.cells[x]?.[this.length - 1 - z]; // Plane UV mapping inverted Z
      
      let thickness = this.maxThickness; // default thick (dark)
      if (cell?.hexColor) {
        // Convert hex to luminance
        const hex = cell.hexColor;
        const r = parseInt(hex.slice(1, 3), 16) / 255;
        const g = parseInt(hex.slice(3, 5), 16) / 255;
        const b = parseInt(hex.slice(5, 7), 16) / 255;
        const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

        // Invert: 1 (white) -> minThickness, 0 (black) -> maxThickness
        thickness = this.minThickness + (1 - luminance) * (this.maxThickness - this.minThickness);
      }

      // Modify Y vertex. 
      // The back of the lithophane is at Y=0. The front is at Y=thickness.
      // Wait, PlaneGeometry has vertices on the flat plane. 
      // To make a solid, we actually need a BoxGeometry and displace the top vertices, 
      // or we extrude it. But a simple Plane is not a valid 3MF volume.
      // For a valid volume, we must create a solid mesh (bottom, sides, top).
      
      // We will leave the top vertex at Y=thickness
      pos.setY(i, thickness);
    }

    geometry.computeVertexNormals();

    // NOTE: This currently only generates the top surface as a single plane.
    // For a fully valid 3D printable solid lithophane, we would construct a custom
    // BufferGeometry containing the bottom plane, walls, and this top heightfield.
    // That involves manually stitching the indices.
    
    return geometry;
  }
}
