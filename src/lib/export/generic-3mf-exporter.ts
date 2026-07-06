import JSZip from "jszip";
import * as THREE from "three";
import * as BufferGeometryUtils from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { bambuProjectSettings } from "./bambu-project-settings";

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

const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

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

  // Since three-bvh-csg can output geometries with un-deduplicated vertices 
  // (which causes open edges), we MUST weld them.
  // However, CSG math introduces floating point noise. 
  // We use a tolerance of 1e-2 (0.01mm) to robustly weld them back together!
  let exportGeo = geometry.clone();
  if (exportGeo.index) {
    exportGeo = exportGeo.toNonIndexed();
  }
  
  // Auto-center the geometry around the origin in X/Z and rest on Y=0
  // so it correctly centers on the Bambu Studio bed (which will translate it to 128,128)
  exportGeo.computeBoundingBox();
  let bedCenterX = 128;
  let bedCenterY = 128;
  let printerModel = "Bambu Lab A1";
  let printerProfile = "0.20mm Standard @BBL A1";
  let nozzleProfile = "Bambu Lab A1 0.4 nozzle";

  if (exportGeo.boundingBox) {
    const sizeX = exportGeo.boundingBox.max.x - exportGeo.boundingBox.min.x;
    const sizeZ = exportGeo.boundingBox.max.z - exportGeo.boundingBox.min.z;
    
    // A1 Mini has a 180x180 bed. Center is 90, 90.
    if (sizeX <= 175 && sizeZ <= 175) {
      bedCenterX = 90;
      bedCenterY = 90;
      printerModel = "Bambu Lab A1 mini";
      printerProfile = "0.20mm Standard @BBL A1M";
      nozzleProfile = "Bambu Lab A1 mini 0.4 nozzle";
    }

    const center = new THREE.Vector3();
    exportGeo.boundingBox.getCenter(center);
    exportGeo.translate(-center.x, -exportGeo.boundingBox.min.y, -center.z);
  }

  // Strip metadata to keep file small and avoid merge issues
  const attrs = Object.keys(exportGeo.attributes);
  attrs.forEach(key => {
    if (key !== 'position') {
      exportGeo.deleteAttribute(key);
    }
  });

  await yieldToMain(); // Yield to prevent browser UI freezing during heavy welding
  exportGeo = BufferGeometryUtils.mergeVertices(exportGeo, 1e-2);
  
  const p = exportGeo.getAttribute("position");
  const index = exportGeo.index;
  
  if (!index) {
    throw new Error("Geometry must be indexed after mergeVertices");
  }

  exportGeo.computeBoundingBox();
  const bbox = exportGeo.boundingBox!;
  const cx = (bbox.max.x + bbox.min.x) / 2;
  const cz = (bbox.max.z + bbox.min.z) / 2;
  
  const plateSize = 256;
  const itemX = plateSize / 2 - cx;
  const itemY = plateSize / 2 + cz;

  const verts: string[] = [];
  const tris: string[] = [];

  const positionAttr = exportGeo.getAttribute("position");
  for (let i = 0; i < positionAttr.count; i++) {
    // Y-up -> Z-up: X3=X, Y3=-Z, Z3=Y
    verts.push(`<vertex x="${fmt(positionAttr.getX(i))}" y="${fmt(-positionAttr.getZ(i))}" z="${fmt(positionAttr.getY(i))}"/>`);
  }

  for (let i = 0; i < index.count; i += 3) {
    tris.push(`<triangle v1="${index.getX(i)}" v2="${index.getX(i + 1)}" v3="${index.getX(i + 2)}" pid="1" p1="0"/>`);
  }

  const objectId = 2; // 1 is colors

  const modelXml = `<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US"
  xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"
  xmlns:p="http://schemas.bambulab.com/package/2021"
  xmlns:m="http://schemas.microsoft.com/3dmanufacturing/material/2015/02"
  requiredextensions="p">
  <metadata name="Application">BambuStudio-02.06.00.51</metadata>
  <metadata name="BambuStudio:3mfVersion">1</metadata>
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
    <item objectid="${objectId}" p:UUID="${generateUUID()}" transform="1 0 0 0 1 0 0 0 1 ${bedCenterX} ${bedCenterY} 0" printable="1"/>
  </build>
</model>`;

  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n` +
    `  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n` +
    `  <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n` +
    `  <Default Extension="config" ContentType="application/xml"/>\n` +
    `</Types>\n`;

  const rels =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n` +
    `  <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n` +
    `  <Relationship Target="/Metadata/model_settings.config" Id="rel-2" Type="http://schemas.bambulab.com/package/2021/model_settings"/>\n` +
    `  <Relationship Target="/Metadata/project_settings.config" Id="rel-3" Type="http://schemas.bambulab.com/package/2021/project_settings"/>\n` +
    `  <Relationship Target="/Metadata/slice_info.config" Id="rel-4" Type="http://schemas.bambulab.com/package/2021/slice_info"/>\n` +
    `</Relationships>\n`;

  const modelSettingsXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="${objectId}">
    <metadata key="name" value="Baseplate"/>
    <metadata key="extruder" value="1"/>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="Plate 1"/>
    <metadata key="locked" value="false"/>
    <model_instance>
      <metadata key="object_id" value="${objectId}"/>
      <metadata key="instance_id" value="0"/>
    </model_instance>
  </plate>
  <assemble>
    <assemble_item object_id="${objectId}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 0 0 0" offset="${bedCenterX} ${bedCenterY} 0" />
  </assemble>
</config>`;

  const baseConfig = JSON.parse(bambuProjectSettings);
  baseConfig.filament_colour = [colorHex.toUpperCase() + "FF"];
  baseConfig.filament_map = ["1"];
  
  // Set printer presets dynamically based on required bed size
  baseConfig["printer_model"] = printerModel;
  baseConfig["printer_settings_id"] = nozzleProfile;
  baseConfig["default_print_profile"] = printerProfile;

  const projectSettingsXml = JSON.stringify(baseConfig, null, 2);

  const sliceInfoXml = `<?xml version="1.0" encoding="UTF-8"?>
<config>
  <header>
    <header_item key="X-BBL-Client-Type" value="slicer"/>
    <header_item key="X-BBL-Client-Version" value="1.9.1.66"/>
  </header>
</config>`;

  zip.file("[Content_Types].xml", contentTypes);
  zip.folder("_rels")!.file(".rels", rels);
  zip.folder("3D")!.file("3dmodel.model", modelXml);
  
  zip.folder("Metadata")!.file("model_settings.config", modelSettingsXml);
  zip.folder("Metadata")!.file("project_settings.config", projectSettingsXml);
  zip.folder("Metadata")!.file("slice_info.config", sliceInfoXml);

  return zip.generateAsync({ 
    type: "blob", 
    mimeType: "model/3mf",
    compression: "DEFLATE",
    compressionOptions: { level: 6 }
  });
}
