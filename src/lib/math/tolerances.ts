import { MaterialProfile } from '@/store/usePuzzleStore';

export type FitType = 'snapFit' | 'slidingFit' | 'pressFit' | 'clearanceFit';

export const STUD_PITCH = 8.0;
export const BASE_STUD_DIAMETER = 4.8;
export const BASE_STUD_HEIGHT = 1.8;
export const BASE_WALL_THICKNESS = 1.2;

// The standard distance between studs diagonally is sqrt(2) * 8 = 11.3137
// The outer tube diameter is 11.3137 - 4.8 = 6.5137 mm
export const BASE_TUBE_OUTER_DIAMETER = (Math.SQRT2 * STUD_PITCH) - BASE_STUD_DIAMETER;

export interface PrintTolerances {
  studDiameter: number;
  tubeDiameter: number; // Outer diameter of the bottom post/tube
  wallThickness: number;
  splineLength: number; // Anti-stud spline length
}

/**
 * Pure function to calculate physical dimensions based on tolerances.
 * Includes adjustments based on material properties and the global snapFit calibration.
 */
export function calculateTolerances(
  material: MaterialProfile,
  snapFitCalibration: number = 0
): Record<FitType, PrintTolerances> {
  // Base logic to adjust for shrinkages.
  // PLA is standard. PETG is stickier/blobs more. TPU is flexible so it needs to be tighter.
  
  let materialDelta = 0;
  switch (material) {
    case 'PETG':
      materialDelta = 0.05; // Slightly looser to compensate for PETG blob/stringing
      break;
    case 'TPU Flexible':
      materialDelta = -0.1; // Needs to be tighter to hold since it flexes easily
      break;
    case 'Translucent':
      materialDelta = 0.02; 
      break;
    case 'PLA Rigid':
    default:
      materialDelta = 0;
      break;
  }
  
  // The global offset we apply to compensate for over-extrusion
  // Positive means we need more space (studs get smaller, holes get bigger)
  const baseOffset = snapFitCalibration + materialDelta;
  
  const createTolerances = (delta: number): PrintTolerances => {
    const totalOffset = baseOffset + delta;
    return {
      studDiameter: BASE_STUD_DIAMETER - totalOffset,
      tubeDiameter: BASE_TUBE_OUTER_DIAMETER - totalOffset,
      wallThickness: BASE_WALL_THICKNESS - (totalOffset / 2),
      // splineLength: 0.27 is the theoretical distance (4 - 0.1(play) - 1.2(wall) - 0.03(play) - 2.4(stud_radius) = 0.27)
      splineLength: 0.27 + (totalOffset / 2), 
    };
  };

  return {
    snapFit: createTolerances(0),
    slidingFit: createTolerances(0.15), // Looser
    pressFit: createTolerances(-0.05),  // Tighter
    clearanceFit: createTolerances(0.3), // Very loose
  };
}
