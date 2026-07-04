# Phase 0: Base Architecture & Infrastructure

## Objective
Establish a clean, scalable, and modular foundation for the Parametric Brick-Compatible Platform. We want to start simple by integrating existing public repositories and proven internal tools (like those from `pixel-puzzle-maker_2`), ensuring that all subsequent phases are built on a rock-solid, performant 3D engine.

## Core Technology Stack
- **Framework:** Next.js (App Router) for routing and API endpoints. *Crucial Compute Boundary:* v1 is **100% client-side compute** (CSG baking, WASM gear math, image quantization, 3MF export all happen in the browser). API routes are reserved exclusively for future auth/licensing/analytics, saving server compute costs and completely avoiding privacy/retention issues with user-uploaded files.
- **Styling:** TailwindCSS for a premium, responsive UI.
- **3D Visualization:** `Three.js` wrapped in `react-three-fiber` (R3F) and `@react-three/drei`.
- **State Management:** `zustand` to manage complex parametric states across the different tool suites.
- **Geometry Operations:** 
  - Use `three-bvh-csg` for fast native boolean operations (adding studs, subtracting holes). It is faster and better maintained for real-time use.
- **Exporting:** `jszip` and our proven `generic-3mf-exporter.ts` to compress massive arrays of studs into lightweight 3MF files.
- **State Management & Persistence:** Design `zustand` stores with robust persistence. Use `IndexedDB` (not just `localStorage`) to handle large `.json` project saves that include heavy binary assets. **Explicit Schema Versioning/Migration** must be implemented from day one to ensure Phase 1 save files load correctly in Phase 5. Undo/redo must track parameter diffs only; large binary assets (like images) are referenced by ID, not duplicated across history states. Because IndexedDB is quota-limited (especially on mobile Safari), the UI must include a **storage-usage indicator**, and the app must run an **orphaned-asset garbage collection** sweep to delete binary assets no longer referenced by any saved project.
  - **Global Print Parameters & Overrides:** The state must include `infillPercentage`, `shellCount`, and a `materialProfile` (e.g., PLA Rigid, TPU Flexible, Translucent). Crucially, the platform will support **per-generator overrides** for these parameters (e.g., a structural bracket can request 40% infill while the global setting is 15%).
- **Units:** The canonical internal unit is `mm`. A standard stud pitch is defined as exactly `8.0mm`. (Stud diameter `4.8mm` sourced from official LEGO tolerances). All generators must conform to this internal scale.
- **Security & File Parsing:** The platform accepts untrusted images (DEM, lithophanes), audio, and fonts. To prevent browser exploits or XSS, uploaded files must be size/type validated, parsed strictly via battle-tested libraries (no hand-rolled parsers), and font/image decode must happen inside a Web Worker so malformed files cannot hang the main thread.
- **Performance Budget & Degradation:** The core engine must maintain interactive 60fps viewports for up to 10,000 visible studs, and complete CSG geometry baking for a flat 48x48 plate in under 3 seconds. For complex CSG ops (hex intersections, topographic stacks), explicitly allocate higher bake-time budgets. If the geometry exceeds 10,000 studs, the UI must gracefully fallback to a degradation strategy (e.g., chunked rendering, LODs, or a dimension cap warning).

## Deliverables for Phase 0

### 1. The Global 3D Viewer & UI Shell
- Set up a master Layout that features a sidebar for controls (Parametric Sliders, Uploads) and a main `Canvas` for the 3D view.
- Implement standard R3F controls: `OrbitControls`, `GridHelper`, and lighting (`AmbientLight`, `DirectionalLight` with shadows).

### 2. The Typed "Printer Tolerance" System
- **Concept:** Every FDM printer extrudes slightly differently. LEGO requires micrometer precision to snap fit. Instead of a single global scalar, the tolerance system must be strongly typed (e.g., `snapFit`, `slidingFit`, `pressFit`, `clearanceFit`).
- **Calibration Model:** The UI provides a primary calibration slider for `snapFit` (e.g., `-0.2mm` to `+0.2mm`). The other three tolerance types are derived from this base value via engineering deltas. Crucially, these deltas must be a **function of the `materialProfile`** (accounting for differing shrinkages of PETG, PLA, and TPU) rather than a fixed offset. The UI allows users to unlock and independently override them if needed.
- *Math & Verification:* Standard LEGO stud diameter is `4.8mm`. We compensate for over-extrusion by shrinking studs and expanding holes. The sign convention for `snapFit`, **as well as the engineering deltas for `pressFit`, `slidingFit`, and `clearanceFit`**, must be explicitly verified with real print tests before baking them into the generators.

### 3. Native Three.js Primitive Engine (The Baseplate)
- Before touching OpenSCAD, we will build a pure JS parameterized Baseplate generator.
- **Why?** It's highly performant. A baseplate is just a `BoxGeometry` (the base) merged with an array of `CylinderGeometry` (the studs).
- **Data Structure:** Design a generic "instance + per-element transform/scale" data structure (not just uniform `InstancedMesh`), along with an explicit "bake instances to merged `BufferGeometry`" step. This is required for Phase 1's non-uniform topographic stacking and CSG subtractions.
- **Features:** Sliders for `Width (studs)` and `Length (studs)`. Generates the precise 3D mesh instantly using this non-uniform instancing model for rendering and merging for export.

### 4. 3MF Export Integration & Geometry Validation
- **Export Pipeline:** Hook up the `generic-3mf-exporter.ts` from `pixel-puzzle-maker_2`. Verify and adapt the exporter so it supports the non-uniform instancing data structure, including passing through `materialProfile` metadata. *Note: True AMS/MMU single-file multi-color export is deferred to Phase 5.* For multi-color generators (like Phase 1 Mosaics), the exporter relies on two simple outputs:
  1. A neutral-color 3MF for the baseplate/structural components.
  2. A `.zip` archive containing separate geometry files grouped by color (for single-extruder users to print batches manually) alongside a BOM shopping list.
- **Validation Script:** Create a testing script that loads the exported geometry and mathematically asserts the final dimensions (stud diameter, tube diameter, height) against expected values. Furthermore, check the topology to ensure the exported mesh is **watertight/manifold**, as CSG operations often produce slicer-breaking non-manifold edges.
- **Cost / Time Estimation:** Build a global utility that calculates the final merged mesh volume and factors in the global `infillPercentage` and `shellCount` parameters to accurately estimate filament weight (g) and print time before export, avoiding massive 3-5x overestimates on hollow/infilled parts. This utility must be pipeline-agnostic so it also covers Phase 3's WASM/STL outputs.

## Leveraging Existing Code & External Repositories
- **From internal:** Bring over the image quantization/palette code and manual raycast "Paint Tool" from `pixel-puzzle-maker_2`.

## Agent Execution Instructions for Phase 0
Since this phase may be executed in a fresh session, the AI agent must follow these explicit research steps BEFORE writing any geometry or UI code:
1. **Clone `bhushan6/lego-builder`:** Use terminal tools to clone this repository to a scratch directory. Traverse the source code to see how they handle React-Three-Fiber grid snapping, camera controls, and state management. Pin to a specific commit hash for deterministic reference.
2. **Analyze `cfinke/LEGO.scad`:** Fetch the raw `LEGO.scad` source file and pin the commit. **Read the actual code.** Specifically, find the mathematical formulas for the `block_bottom_type` and anti-stud tubes (the cylinders on the underside of a brick). Port these exact mathematical tolerances into our `Three.js` generator so our parts are snap-fit compatible with 3D printers.
3. **Internal Review:** View `pixel-puzzle-maker_2`'s `generic-3mf-exporter.ts` to understand how the new baseplate's non-uniform instancing model needs to be structured and merged for export.
4. **Tolerance Validation:** Implement a small validation script that verifies the exported geometry's `snapFit` dimensions match expected targets after compensation.
5. **Pure Math Testing Philosophy:** Every generator's parametric math (tolerance-delta calculations, gear involute formulas, load-rating beam formulas, TD transfer-functions) must live in a pure, framework-free function with unit test coverage, completely separate from the geometry-building code that calls it.
