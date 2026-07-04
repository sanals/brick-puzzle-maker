import * as THREE from 'three';
import { FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';
import { TextGeometry } from 'three/examples/jsm/geometries/TextGeometry.js';
import { SUBTRACTION, Evaluator, Brush } from 'three-bvh-csg';

let font: any = null;

export async function loadFont() {
  if (font) return font;
  const loader = new FontLoader();
  return new Promise((resolve, reject) => {
    loader.load(
      '/helvetiker_regular.typeface.json',
      (loadedFont) => {
        font = loadedFont;
        resolve(font);
      },
      undefined,
      reject
    );
  });
}

/**
 * Subtracts text from the bottom of a geometry.
 */
export async function engraveTextOnBottom(
  baseGeometry: THREE.BufferGeometry,
  text: string,
  plateWidthMm: number,
  plateLengthMm: number
): Promise<THREE.BufferGeometry> {
  const f = await loadFont();

  const textGeo = new TextGeometry(text, {
    font: f,
    size: 10,
    depth: 2,
    curveSegments: 2,
    bevelEnabled: false
  });

  textGeo.computeBoundingBox();
  const tb = textGeo.boundingBox!;
  const xOffset = -0.5 * (tb.max.x - tb.min.x);
  const zOffset = -0.5 * (tb.max.y - tb.min.y); // Text is generated on XY plane

  // Move text to center
  textGeo.translate(xOffset, zOffset, 0);
  
  // Rotate to face bottom
  textGeo.rotateX(-Math.PI / 2);

  // Translate to bottom of the baseplate (assuming bottom is at Y=0)
  // We want to engrave 1mm deep, so text goes from Y=-1 to Y=1
  textGeo.translate(0, 1, 0);

  const textMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
  const textBrush = new Brush(textGeo, textMaterial);
  textBrush.updateMatrixWorld();

  const baseMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const baseBrush = new Brush(baseGeometry, baseMaterial);
  baseBrush.updateMatrixWorld();

  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  
  const result = evaluator.evaluate(baseBrush, textBrush, SUBTRACTION);
  return result.geometry;
}
