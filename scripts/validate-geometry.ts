import * as THREE from 'three';
import { calculateTolerances, BASE_STUD_DIAMETER, BASE_TUBE_OUTER_DIAMETER, STUD_PITCH } from '../src/lib/math/tolerances';
import { BaseplateGenerator } from '../src/lib/geometry/baseplate-generator';

console.log('--- Geometry Validation Script ---');

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
  console.log(`✅ ${message}`);
}

function runTests() {
  // 1. Math Tolerances Testing
  console.log('\nTesting Math Tolerances:');
  const plaRigid = calculateTolerances('PLA Rigid', 0);
  assert(plaRigid.snapFit.studDiameter === BASE_STUD_DIAMETER, 'PLA Rigid snapFit stud diameter equals base');
  assert(plaRigid.snapFit.tubeDiameter === BASE_TUBE_OUTER_DIAMETER, 'PLA Rigid snapFit tube diameter equals base');
  
  const plaTight = calculateTolerances('PLA Rigid', -0.1);
  assert(plaTight.snapFit.studDiameter === BASE_STUD_DIAMETER + 0.1, 'PLA Tight snapFit stud gets larger (tighter fit)');
  assert(plaTight.snapFit.tubeDiameter === BASE_TUBE_OUTER_DIAMETER + 0.1, 'PLA Tight snapFit tube gets larger (tighter fit)');
  
  const tpuFlex = calculateTolerances('TPU Flexible', 0);
  assert(tpuFlex.snapFit.studDiameter === BASE_STUD_DIAMETER + 0.1, 'TPU Flex inherently shrinks studs by 0.1 for tighter fit');
  
  // 2. Baseplate Geometry Generation
  console.log('\nTesting Baseplate Generation (4x4):');
  const gen = new BaseplateGenerator(4, 4, plaRigid.snapFit);
  const geo = gen.generateGeometry();
  
  assert(geo.isBufferGeometry, 'Generated object is BufferGeometry');
  assert(geo.attributes.position.count > 0, 'Geometry has vertices');
  
  geo.computeBoundingBox();
  const bbox = geo.boundingBox!;
  
  // Width should be (4 * 8) - 0.2 = 31.8mm
  const expectedWidth = (4 * 8.0) - 0.2;
  const actualWidth = bbox.max.x - bbox.min.x;
  
  assert(Math.abs(actualWidth - expectedWidth) < 0.001, `Bounding box X size matches expected ${expectedWidth}mm (actual: ${actualWidth}mm)`);
  
  console.log('\nAll validations passed! 🎉');
}

runTests();
