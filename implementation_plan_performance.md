# Performance Optimization Plan: Instanced Rendering

The UI currently suffers from severe stuttering and frame drops when painting or moving on large baseplates (e.g. 96x96). This is because the application relies on synchronous `BufferGeometry` merging on the main thread every time a single stud is painted. For a 96x96 board, it's attempting to merge 9,216 distinct 3D geometries on every mouse drag!

## Proposed Changes

To achieve buttery-smooth 60FPS painting and rendering regardless of board size, we need to migrate from a single merged `BufferGeometry` to React Three Fiber's `<instancedMesh>`.

### 1. Refactor `CanvasView.tsx` for Instanced Rendering
Instead of asking `BrickGenerator` to merge all bricks into one giant, static geometry, we will:
- Group the bricks by their physical dimensions (e.g. all 1x1s, all 1x2s, etc.). If Greedy Meshing is OFF, this will just be one massive group of 9,216 1x1 bricks.
- Render one `<instancedMesh>` for each unique brick dimension.
- Use a `Float32Array` to pass positions and colors to the instances. Updating a color in a Float32Array takes `<1ms`, eliminating all painting lag.

### 2. Update Hit Detection (Raycasting)
- `onClick`, `onPointerDown`, and `onPointerMove` events on an `<instancedMesh>` return an `instanceId`.
- We will map this `instanceId` back to the brick's logical `(x, z)` grid coordinates to continue supporting seamless painting, cutting, and joining.

### 3. Maintain Baseplate Geometry
- The underlying baseplate geometry (which generates the locking studs and tubes underneath) is already highly optimized. Since it doesn't change color during painting, its geometry will only be regenerated when dimensions or snap-fit tolerances change.

## User Review Required

> [!IMPORTANT]
> This refactor will dramatically improve performance but requires completely replacing the brick rendering pipeline in `CanvasView.tsx`.
> Do you approve this architectural shift to Instanced Rendering?
