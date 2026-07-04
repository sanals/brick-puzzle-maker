# Phase 2: Structural & Organizer Factory

## Objective
Tap into the massively popular 3D printing niche of "Home Organization" (Sections 1 & 2 of LEGO_IDEAS). We will build generators that create functional, load-bearing parts with integrated LEGO stud matrices, allowing users to build modular storage systems.

## Core Features & Generators

### 1. The Gridfinity-to-LEGO Adapter
- **Concept:** Gridfinity is the gold standard for 3D printed drawer organization. It uses a 42x42mm grid system. LEGO uses an 8x8mm pitch.
- **Generator:** A tool that mathematically aligns the two grids. It generates a rigid plastic bridge: the top face features perfectly spaced Gridfinity square cups, and the bottom face features standard LEGO tubes/notches.
- **Tolerance Reconciliation:** This part bridges two systems with independently tight tolerances. The generator must explicitly reconcile the LEGO `snapFit` tolerance (from Phase 0) on the bottom with the Gridfinity official clearance spec on the top.
- **Use Case:** Users can snap Gridfinity tool holders directly onto a giant LEGO baseplate bolted to a workshop wall.

### 2. Parametric Device & Tool Enclosures
- **Concept:** Need a wall mount for an iPad, a TV remote, or a digital caliper? 
- **Implementation:**
  - **Inputs:** User inputs the exact X, Y, and Z dimensions of their object (e.g., `150mm x 70mm x 10mm`). They can add an optional "Lip" to secure the object.
  - **CSG Operations:** The script takes a solid block, uses Constructive Solid Geometry (CSG) to subtract a cavity for the device. The cavity will automatically apply the **`clearanceFit`** tolerance allowance to the user's dimensions so the physical device can actually slide in without an interference fit. A strict **minimum wall thickness check** (tied to nozzle diameter) must be enforced on the cavity subtraction to prevent unprintable or structurally void shells.
  - **Integration:** It then maps a 2D array of LEGO studs onto the entire exterior of the block.
  - **Result:** A custom device holder that snaps onto any LEGO wall or desk base.

### 3. Structural Brackets & Floating Shelves
- **Concept:** Giant 3D printed bricks designed to hold actual weight (books, collectibles) when mounted to real walls.
- **Implementation:** 
  - Standard LEGO bricks are hollow and weak. Our generator will add heavy internal cross-bracing (like infill) and counter-sunk screw holes matching standard drywall anchors.
  - **Anchor Specification:** Drywall anchor sizes vary widely (#6, #8, #10). The UI will make the anchor screw hole diameter a parametric input so users can match their specific hardware.
  - The outer shell maintains perfect stud geometry to act as a display shelf for hundreds of minifigures or models.
- **Safety / Load Rating:** Since these parts hold physical weight, the generator UI will include a load-rating disclaimer. The estimated safe load (in kg) will be calculated using a stated, conservative heuristic (factored by infill, wall thickness, and `materialProfile` tensile strength). The UI must explicitly pin this exact copy: *"This is a conservative engineering estimate, not a certified calculation — consult a professional for heavy or safety-critical loads."*

### 4. Custom Typography Signage
- **Concept:** Instead of trying to build letters out of small square bricks, users can type their name, and we generate a solid custom word block.
- **Implementation:** Upload a font or type a string. We extrude the 2D text into a 3D block, calculate its bounding box, and array standard studs precisely on the top face so it integrates with standard bricks.
- **Font Licensing Policy:** Since font EULAs vary heavily on derivative use and embedding, the platform will bundle a set of open-license fonts (e.g., Google Fonts) by default, and require an explicit user-acknowledgment step if they upload their own `.ttf` files.

## Agent Execution Instructions for Phase 2
When executing this phase, the AI agent must:
1. **Gridfinity Tolerance Verification:** Zack Freedman's original spec was based on Fusion 360 files, not a clean math doc, leading to real-world tolerance variance across the community. The agent must explicitly fetch the `gridfinity-unofficial/specification` repo and cross-check the tolerances against `vector76/gridfinity_openscad` (a two-source verification) to accurately reconcile the `snapFit` allowance on the Gridfinity cup side before building the bridge generator.
