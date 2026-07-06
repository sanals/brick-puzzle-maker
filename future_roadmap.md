# Future Roadmap: Frames, Borders, and Custom Faces

This document outlines the planned features for advanced frame customization and custom brick faces. The roadmap is separated into phases, prioritizing the easiest and most foundational features first.

## Phase 1: Foundation & "Normal Design" Optimization
*Focus: UI toggles, basic geometry adjustments, and optimizing the baseplate for simple wall-mounting.*

1. **Design Mode Toggle**
   - Add a global setting: **"Design Type"** (Options: *Normal Design* / *Frame Design*).
   - **Normal Design**: Meant for wall sticking.
   - **Frame Design**: Meant for inserting into an external picture frame with modular borders.

2. **Plain Borders (Studless)**
   - Add a "Studless Border" toggle.
   - Modify the `BaseplateGenerator` to skip drawing the circular projections (studs) on the outer perimeter if this setting is enabled, resulting in a completely smooth, plain border.

3. **Baseplate Thickness Reduction**
   - For "Normal Design", introduce a parameter to significantly reduce the base height of the plates.
   - Automatically disable the generation of connector holes between chunks for "Normal Design" to speed up processing and reduce material usage.

## Phase 2: Custom Brick Faces (Tiles)
*Focus: Allowing users to decorate their mosaics with custom shapes without compromising browser performance.*

1. **Custom Face Library**
   - Create a set of procedural geometries or load lightweight `.gltf` / `.obj` models for shapes like a **Leaf, Heart, Wave, and Sun**.
   - Add a UI selector in the "Lego Bricks" tab to choose the top-face style of the active brick.

2. **High-Performance Instancing**
   - To prevent browser lag, we cannot render individual complex meshes.
   - We will categorize bricks by their assigned "Face Shape" and use dedicated `THREE.InstancedMesh` groups for each shape. This ensures that rendering 5,000 heart-shaped bricks is just as fast as rendering 5,000 standard square bricks.

3. **Export Integration**
   - Update the 3MF exporter to correctly merge or include these custom 3D geometries on top of the base bricks during the export process.

## Phase 3: Modular "Frame Design" Assembly System
*Focus: Complex CSG (Constructive Solid Geometry) operations to detach borders and create interlocking mechanics.*

1. **Detached Border Generation**
   - When "Frame Design" is active, completely separate the border from the main puzzle grid. The border will become its own set of printable pieces.

2. **Interlocking Mechanics**
   - Generate interlocking connector holes along the inner edge of the detached border pieces.
   - Generate corresponding connector holes along the outer edge of the main baseplate grid.
   - These holes will perfectly align, allowing the user to assemble the puzzle using standard Lego Technic pins.

3. **Tapered Outer Edge**
   - Modify the outer side of the detached border pieces to be thinner (stepped down). 
   - This thinner edge will act as a lip that easily slides into the grooves of a standard wooden/metal picture frame.
   - Update the chunking and export logic to ensure these new frame pieces can be grouped and exported efficiently.

## Phase 4: Extreme Performance Enhancements
*Focus: Scaling to massive grids (e.g., 200x200) without crashing the browser or freezing the UI.*

1. **Level of Detail (LOD) UI Toggle**
   - Introduce a "Performance Mode" toggle in the UI with clear warnings about its impact on visual fidelity vs. speed.
   - **Preview Mode (High Performance):** Generate extremely simplified meshes for bricks (e.g., simple cubes with basic cylinders for studs, omitting all internal tubes and bottom cavities). This drastically cuts polygon count for rendering.
   - **Printable Mode (High Fidelity):** Generate the true, mathematically accurate geometry required for CSG and 3D printing.
   - Exporter will always override and use High Fidelity for the final `.3mf` file.

2. **Web Worker Offloading**
   - Move the heavy CSG (Constructive Solid Geometry) boolean operations into background `Web Workers`.
   - This ensures the main browser thread never freezes when generating large baseplates or processing complex modifications, allowing the user to interact with the UI while the geometry generates in the background.
