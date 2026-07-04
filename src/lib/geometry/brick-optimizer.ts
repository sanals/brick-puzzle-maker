import { VoxelMatrix } from '../types';

export interface OptimizedBrick {
  x: number; // grid coordinate X
  z: number; // grid coordinate Z
  width: number; // in studs
  length: number; // in studs
  hexColor: string;
}

export interface OptimizerOptions {
  allowNonStandardSizes: boolean;
}

// Standard sizes sorted by area descending, then length descending
const STANDARD_SIZES = [
  { w: 2, l: 4 },
  { w: 4, l: 2 },
  { w: 2, l: 3 },
  { w: 3, l: 2 },
  { w: 2, l: 2 },
  { w: 1, l: 4 },
  { w: 4, l: 1 },
  { w: 1, l: 3 },
  { w: 3, l: 1 },
  { w: 1, l: 2 },
  { w: 2, l: 1 },
  { w: 1, l: 1 },
];

export class BrickOptimizer {
  private matrix: VoxelMatrix;
  private width: number;
  private length: number;
  private visited: boolean[][];

  constructor(matrix: VoxelMatrix, width: number, length: number) {
    this.matrix = matrix;
    this.width = width;
    this.length = length;
    
    // Initialize visited tracking array
    this.visited = Array.from({ length: width }, () => new Array(length).fill(false));
  }

  public optimize(options: OptimizerOptions): OptimizedBrick[] {
    const bricks: OptimizedBrick[] = [];

    // Group cells by color first, so we optimize per color
    const colorGroups = new Map<string, { x: number, z: number }[]>();

    for (let x = 0; x < this.width; x++) {
      for (let z = 0; z < this.length; z++) {
        const cell = this.matrix.cells[x]?.[z];
        if (cell?.hexColor) {
          const color = cell.hexColor;
          if (!colorGroups.has(color)) colorGroups.set(color, []);
          colorGroups.get(color)!.push({ x, z });
        }
      }
    }

    for (const [color, cells] of colorGroups.entries()) {
      // Create a local grid for just this color
      const colorGrid: boolean[][] = Array.from({ length: this.width }, () => new Array(this.length).fill(false));
      for (const { x, z } of cells) {
        colorGrid[x][z] = true;
      }

      for (let x = 0; x < this.width; x++) {
        for (let z = 0; z < this.length; z++) {
          if (!colorGrid[x][z] || this.visited[x][z]) continue;

          // Found an unvisited cell of this color, greedily find the best rectangle starting here
          if (options.allowNonStandardSizes) {
            // Find arbitrary max rectangle
            let bestW = 1;
            let bestL = 1;
            let maxArea = 1;

            // Expand in X
            let tempW = 1;
            while (x + tempW < this.width && colorGrid[x + tempW][z] && !this.visited[x + tempW][z]) {
              tempW++;
            }
            
            // For each possible width, see how far we can expand in Z
            for (let w = 1; w <= tempW; w++) {
              let l = 1;
              let canExpandZ = true;
              while (canExpandZ && z + l < this.length) {
                // Check if the whole row of width `w` at `z + l` is valid
                for (let dx = 0; dx < w; dx++) {
                  if (!colorGrid[x + dx][z + l] || this.visited[x + dx][z + l]) {
                    canExpandZ = false;
                    break;
                  }
                }
                if (canExpandZ) l++;
              }
              
              if (w * l > maxArea) {
                maxArea = w * l;
                bestW = w;
                bestL = l;
              }
            }

            this.markVisited(x, z, bestW, bestL);
            bricks.push({ x, z, width: bestW, length: bestL, hexColor: color });
          } else {
            // Standard sizes only
            let placed = false;
            for (const size of STANDARD_SIZES) {
              if (this.canPlace(x, z, size.w, size.l, colorGrid)) {
                this.markVisited(x, z, size.w, size.l);
                bricks.push({ x, z, width: size.w, length: size.l, hexColor: color });
                placed = true;
                break;
              }
            }
            // Fallback (should never happen because 1x1 is in standard sizes)
            if (!placed) {
              this.markVisited(x, z, 1, 1);
              bricks.push({ x, z, width: 1, length: 1, hexColor: color });
            }
          }
        }
      }
    }

    return bricks;
  }

  private canPlace(startX: number, startZ: number, w: number, l: number, colorGrid: boolean[][]): boolean {
    if (startX + w > this.width || startZ + l > this.length) return false;
    
    for (let x = startX; x < startX + w; x++) {
      for (let z = startZ; z < startZ + l; z++) {
        if (!colorGrid[x][z] || this.visited[x][z]) return false;
      }
    }
    return true;
  }

  private markVisited(startX: number, startZ: number, w: number, l: number) {
    for (let x = startX; x < startX + w; x++) {
      for (let z = startZ; z < startZ + l; z++) {
        this.visited[x][z] = true;
      }
    }
  }
}
