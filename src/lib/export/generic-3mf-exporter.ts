import JSZip from "jszip";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";

// Helper for formatting floats
function fmt(n: number): string {
  return Number(n.toFixed(4)).toString();
}

function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Calculates volume of the geometry for cost estimation.
 * Takes infill into account roughly (shell vs infill).
 */
export function estimateFilamentWeight(geometry: THREE.BufferGeometry, infillPercentage: number, shellCount: number): { volumeCm3: number, weightGrams: number } {
  let volume = 0;
  
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  if (!idx) return { volumeCm3: 0, weightGrams: 0 };
  
  // Basic signed volume of a mesh
  for (let i = 0; i < idx.count; i += 3) {
    const p1 = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i));
    const p2 = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i+1));
    const p3 = new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i+2));
    volume += p1.dot(p2.cross(p3)) / 6.0;
  }
  
  const volumeMm3 = Math.abs(volume);
  const volumeCm3 = volumeMm3 / 1000;
  
  // Very rough heuristic for infill/shells: assume 30% of volume is shells, the rest is infill
  const adjustedVolume = volumeCm3 * 0.3 + (volumeCm3 * 0.7 * (infillPercentage / 100));
  
  // Assuming PLA density ~1.24 g/cm³
  const weightGrams = adjustedVolume * 1.24;
  
  return { volumeCm3: adjustedVolume, weightGrams };
}

/**
 * Builds a valid 3MF file (ZIP) from a Three.js geometry.
 * Can be used for single-extruder baseplates.
 */
export async function build3MF(
  geometry: THREE.BufferGeometry,
  colorHex: string = "#3b82f6"
): Promise<Blob> {
  const zip = new JSZip();

  // Weld vertices to ensure manifold geometry for Bambu Studio
  const exportGeo = BufferGeometryUtils.mergeVertices(geometry, 1e-4);
  
  const p = exportGeo.getAttribute("position");
  const index = exportGeo.index;
  
  if (!index) {
    throw new Error("Geometry must be indexed after mergeVertices");
  }

  const verts: string[] = [];
  const tris: string[] = [];

  for (let i = 0; i < p.count; i++) {
    // Y-up -> Z-up: X3=X, Y3=-Z, Z3=Y
    verts.push(`<vertex x="${fmt(p.getX(i))}" y="${fmt(-p.getZ(i))}" z="${fmt(p.getY(i))}"/>`);
  }

  for (let i = 0; i < index.count; i += 3) {
    tris.push(`<triangle v1="${index.getX(i)}" v2="${index.getX(i + 1)}" v3="${index.getX(i + 2)}" pid="1" p1="0"/>`);
  }

  const objectId = 2; // 1 is colors

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02">
  <metadata name="Application">Brick Puzzle Maker</metadata>
  <resources>
    <m:colorgroup id="1">
      <m:color color="${colorHex.toUpperCase()}FF"/>
    </m:colorgroup>
    <object id="${objectId}" p:UUID="${generateUUID()}" type="model">
      <mesh>
        <vertices>${verts.join("\n")}</vertices>
        <triangles>${tris.join("\n")}</triangles>
      </mesh>
    </object>
  </resources>
  <build>
    <item objectid="${objectId}" p:UUID="${generateUUID()}" transform="1 0 0 0 1 0 0 0 1 128 128 0" printable="1"/>
  </build>
</model>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
    `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
    `  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n` +
    `</Types>\n`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
    `  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n` +
    `</Relationships>\n`;

  zip.file("[Content_Types].xml", contentTypes);
  zip.folder("_rels")!.file(".rels", rels);
  zip.folder("3D")!.file("3dmodel.model", modelXml);

  return zip.generateAsync({ 
    type: "blob", 
    mimeType: "model/3mf",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}
