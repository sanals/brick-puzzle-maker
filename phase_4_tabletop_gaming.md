# Phase 4: Tabletop RPG & Strategy Tools

## Objective
Target the massive tabletop gaming community (D&D, Warhammer, Board Games). We will create specialized 3D printable components (Section 4 of LEGO_IDEAS) that utilize the LEGO system's modularity to build dynamic maps, game aides, and organizers that can be rapidly disassembled.

## Core Features & Generators

### 1. The Hex Terrain Matrix (Settlers / Battletech)
- **Concept:** Standard board game hexes (like Settlers of Catan) are not compatible with square LEGO plates.
- **Generator:** A tool where users define the radius of a hexagon. The engine generates a perfect hex base. It calculates a bounding box, masks a standard 8mm pitch stud array using the hex path (via CSG intersection), and drops perfect studs onto the hex.
- **Performance Budget:** Large hex maps doing CSG intersection per-stud can be slow. The generator must adhere to the performance budget established in Phase 0 (e.g., maintaining 60fps or baking within X seconds).
- **Result:** Players can snap standard LEGO trees, houses, and minifigures onto their custom 3D printed hex boards.

### 2. D&D Modular Dungeon System
- **Concept:** Snap-together dungeon walls for D&D maps, allowing for massive modular layouts that don't shift when accidentally bumped.
- **Generator:** 
  - Standardized straight and corner wall segments.
  - The bottom features no studs, just flat plates.
  - The *Sides* of the base feature standard Technic pin holes. 
  - We generate simple printed friction pins to snap rooms and corridors together horizontally. These printed pins must use the **`pressFit`** or **`slidingFit`** tolerance class (from Phase 0) to ensure they are functional, unlike static studs. Alternatively, users can opt to use real LEGO Technic pins.

### 3. Modular Dice Towers
- **Concept:** Dice towers are fun, but usually static. A LEGO-compatible dice tower lets users theme it differently for every campaign (Sci-Fi one night, Castle the next).
- **Implementation:** 
  - The generator builds a core structural chassis featuring internal angled ramps (baffles). Note: *Baffle angles and clearances are functional mechanical designs and will require physical prototyping, as there is no CI check that guarantees dice won't jam.*
  - The four exterior walls of the chassis are covered entirely in a grid of standard LEGO studs.
  - Users print the core, then click flat tiles, bricks, and minifigures onto the walls to decorate it.

### 4. Custom Miniature Bases & Dials
- **Concept:** Warhammer and D&D miniatures have standard bases (25mm, 32mm rounds).
- **Implementation:** 
  - Generate round bases with a single central LEGO stud to mount custom builds, or a ring of studs around the edge.
  - Generate 2-part snapping concentric dials (like HeroClix) with numbers to track Health/Mana, using a central Technic axle pin for rotation. The central axle and ring mechanism explicitly requires the **`slidingFit`** tolerance class from Phase 0 to rotate freely without binding.

## Open Source Repos to Leverage
- **`LasseD/buildinginstructions.js`:** Reference for step-by-step 3D instructions.

## Agent Execution Instructions for Phase 4
When executing this phase, the AI agent must:
1. **LDraw Format Conversion Mini-Project:** `buildinginstructions.js` requires the `LDraw` format, whereas our pipeline generates Three.js BufferGeometry/InstancedMesh. Building or integrating a converter pipeline (Native Geometry -> LDraw) is realistically **its own mini-project** and must be scoped with dedicated milestones. This involves geometry conversion, color-palette remapping (back to LDraw's canonical numeric codes), and adapting the stepping/parsing engine.
2. **Clone `LasseD/buildinginstructions.js`:** Clone the repo and analyze the source code to understand how it parses LDraw formats and steps through the geometries to render interactive assembly instructions. Adapt this logic for our tabletop generated geometries.
