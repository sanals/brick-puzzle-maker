# Phase 1: The Mosaic & Cartography Studio

## Objective
Adapt the 2D pixel processing architecture from `pixel-puzzle-maker_2` and combine it with topographical data logic (inspired by `leifgehrmann/lego-art-map-generator`) to generate complex, data-driven LEGO mosaics and 3D landscapes.

## Core Features & Generators

### 1. The Pro Pixel Art & Portrait Engine
- **Concept:** Translates user uploaded images (JPEGs/PNGs) into 2D studded LEGO baseplates.
- **Enhancements over previous puzzle maker:**
  - **Image Downsampling:** Expose the downsampling algorithm (e.g., nearest-neighbor vs. area averaging) as a user option to control how a 4K image reduces to a 96x96 stud mosaic.
  - **BrickLink Color Mapping:** Use a manually curated palette inspired by real-world LEGO filament/brick colors to avoid trademark/API issues while ensuring users can buy matching real-world parts.
  - **Stud Omission & Physical Assembly:** If a user hides a color in the palette, the engine skips generating those 1x1 plates, leaving the raw baseplate exposed. To physically assemble the mosaic, users have two valid options: 
    1. **Buy Real LEGO Pieces:** Use the generated BOM as a shopping list (color, qty) and snap official pieces onto the neutral baseplate (zero MMU dependency).
    2. **Print in Batches:** Export per-color geometry files (the zip pipeline), print one color at a time using a single extruder, and place them by hand.
  - **Outputs:** 
    - The actual 3D visualization.
    - A step-by-step building guide for printing batches of colors and assembling the baseplate.
    - A Bill of Materials (BOM) for users who just want to 3D print the baseplate and order real LEGO tiles for the pixels.
  - **Color-Blind Accessibility:** Since this tool hinges on users visually distinguishing colors to pick real parts, the palette picker and BOM UI must include pattern/texture or text-label swatch identification (not color alone), plus a deuteranopia-simulation toggle for the mosaic preview so users can self-check their art before ordering parts.
  - **Mini-Map Engraving & Registration:** For massive posters (e.g., 96x96 studs), the engine slices the model into multiple 16x16 plates. It automatically engraves coordinates (A1, A2, B1) onto the back using a robust **text-to-geometry pipeline** (font loading -> 2D extrusion -> CSG subtraction). Additionally, the slicing algorithm will generate interlocking keyed edges (e.g., dovetails) or Technic pin holes on the plate borders utilizing the **`pressFit`** tolerance class to ensure adjacent plates snap together perfectly during physical assembly.

### 2. Topographic & Bathymetric Map Modeler
- **Concept:** Generate stunning 3D stepped landscapes using real-world map data. *Note: This has a hard dependency on Phase 0's non-uniform instancing model to support variable heights per column.*
- **Integration:** 
  - Allow users to upload grayscale DEM (Digital Elevation Model) or Bathymetric (ocean depth) images.
- **Parametric Generation & Scaling:**
  - The script samples the image grid. Instead of color mapping, it maps 8-bit brightness (0-255) to *Height*.
  - *Quantization Logic:* Users define a "Max Height" (e.g., 20 plates). The 0-255 brightness range is linearly scaled and quantized to discrete plate heights (3.2mm increments).
  - *Performance & Attribution:* Since DEMs cause non-uniform heights that break instancing reuse, large maps will easily exceed the 10k stud performance budget. Implement explicit **LOD (Level of Detail) / Chunking** strategies for the viewport. Additionally, clearly document and comply with attribution requirements for DEM source imagery (e.g., USGS, SRTM).
  - Generates a breathtaking 3D physical map that looks incredibly premium when side-lit.

### 3. Soundwave & Lithophane Generators
- **Soundwaves:** Upload an MP3/WAV. The browser uses the Web Audio API to extract a frequency array, normalizing it to a 32x32 stud spectrogram grid (32 frequency bins × 32 time windows) to generate a 3D physical equalizer wave out of standard LEGO bricks.
- **Lithophanes:** Generate a true, variable-depth surface where local wall thickness varies per-pixel to encode image brightness.
  - **Architecture Note:** Unlike the discrete instances used for topography, this generator must utilize a *continuous deformed mesh* (vertex-displaced heightfield geometry) strategy. It will act as a third distinct geometry pipeline alongside CSG and Instancing.
  - **Material & Attachment:** The UI must enforce or warn the user if a translucent material profile is not selected, as lithophanes require light to pass through. To avoid slow and failure-prone boolean unions on high-vertex-count deformed meshes, the lithophane surface and the structural studded frame will be generated as **mechanically adjacent** parts (printed separately and friction-fit together utilizing the **`pressFit`** tolerance) rather than a single unified CSG mesh.

## Open Source Repos to Leverage
- **`ethantr/lego-mosaic`:** A TypeScript reference for the Pro Pixel Art Engine.
- **`leifgehrmann/lego-art-map-generator`:** A reference for distributing bathymetric colored tiles.

## Agent Execution Instructions for Phase 1
When executing this phase, the AI agent must:
1. **Analyze `ethantr/lego-mosaic`:** Fetch the raw source code and review their image quantization algorithms. Port their logic for mapping pixels to nearest colors and generating the accurate "Piece Count" (Bill of Materials) list.
2. **Analyze `leifgehrmann/lego-art-map-generator`:** Fetch the raw source code. Do not just read the README. Understand the math used to sample grayscale maps and translate those values. We will adapt this data to map to Z-axis heights (stacking 1x1 plates) in our Three.js engine.
