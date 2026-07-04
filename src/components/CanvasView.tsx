'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows } from '@react-three/drei';
import { BaseplateGenerator } from '@/lib/geometry/baseplate-generator';
import { BrickGenerator } from '@/lib/geometry/brick-generator';
import { BrickOptimizer } from '@/lib/geometry/brick-optimizer';
import { calculateTolerances, STUD_PITCH } from '@/lib/math/tolerances';
import { usePuzzleStore, MaterialProfile } from '@/store/usePuzzleStore';
import * as THREE from 'three';

interface CanvasViewProps {
  width: number;
  length: number;
  materialProfile: MaterialProfile;
  snapFit: number;
}

export function CanvasView({ width, length, materialProfile, snapFit }: CanvasViewProps) {
  const { 
    voxelMatrix, 
    activePaintColor, 
    paintStud,
    paintStudsBatch,
    commitHistory,
    paintMode, 
    customBricks,
    setCustomBricks,
    deuteranopiaSimulation, 
    explodedView,
    optimizePieces,
    allowNonStandardSizes,
    showBaseplate,
    showBricks
  } = usePuzzleStore();
  const controlsRef = useRef<any>(null);
  const [isPainting, setIsPainting] = useState(false);
  const [editDragStart, setEditDragStart] = useState<{x: number, z: number, localX: number, localZ: number} | null>(null);
  const [hoverAction, setHoverAction] = useState<{
    type: 'cut' | 'join';
    axis: 'x' | 'z';
    index: number;
    brick?: any;
    brick1?: any;
    brick2?: any;
    brickIndex?: number;
    brick1Index?: number;
    brick2Index?: number;
    dominantBrick?: any;
    dominantSide?: -1 | 1;
  } | null>(null);

  // Memoize the geometry generation so it only recalculates when params change
  const { baseGeometry, bricksGeometry } = useMemo(() => {
    const tolerances = calculateTolerances(materialProfile, snapFit);
    
    // Check if it's a heightmap by looking at the first cell
    const isHeightmap = voxelMatrix?.cells[0]?.[0]?.height !== undefined;

    // For a Heightmap, we want the baseplate to use the matrix to generate columns.
    // For a Mosaic, the baseplate is neutral (no matrix) and bricks sit on top.
    const baseGenerator = new BaseplateGenerator(
      width, 
      length, 
      tolerances.snapFit, 
      1/3, 
      isHeightmap ? voxelMatrix : null
    );
    
    const baseGeo = baseGenerator.generateGeometry();

    let bricksGeo = null;
    // Generate separate 1x1 bricks if it's a mosaic
    if (voxelMatrix && !isHeightmap) {
      const brickGen = new BrickGenerator(
        width, 
        length, 
        tolerances.snapFit, 
        voxelMatrix, 
        undefined,
        optimizePieces,
        allowNonStandardSizes,
        customBricks || undefined
      );
      const generatedGeo = brickGen.generateGeometry();
      if (generatedGeo.attributes.position && generatedGeo.attributes.position.count > 0) {
         bricksGeo = generatedGeo;
      }
    }

    return { baseGeometry: baseGeo, bricksGeometry: bricksGeo };
  }, [width, length, materialProfile, snapFit, voxelMatrix, customBricks, optimizePieces, allowNonStandardSizes]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return; // Only process left click
    e.stopPropagation(); // Stop orbit controls if painting or editing
    if (paintMode === 'edit') {
      const coords = getGridCoords(e.point);
      if (coords) setEditDragStart(coords);
    } else if (activePaintColor) {
      if (paintMode === 'stud') {
        setIsPainting(true);
        commitHistory(); // Save state before stroke begins
        paintAtPoint(e.point);
      }
    }
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0) return; // Only process left click
    if (paintMode === 'brick' && activePaintColor) {
      e.stopPropagation();
      commitHistory(); // Save state for undo
      paintAtPoint(e.point);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (paintMode === 'edit' && !editDragStart) {
      const coords = getGridCoords(e.point);
      if (coords) {
        const action = getHoverAction(coords);
        setHoverAction(action);
      } else {
        setHoverAction(null);
      }
    } else if (paintMode === 'edit' && editDragStart) {
      setHoverAction(null);
    } else if (isPainting && activePaintColor && paintMode === 'stud') {
      e.stopPropagation();
      paintAtPoint(e.point);
    } else {
      setHoverAction(null);
    }
  };

  const handlePointerUp = (e?: ThreeEvent<PointerEvent>) => {
    setIsPainting(false);
    if (e && paintMode === 'edit' && editDragStart && customBricks) {
      e.stopPropagation();
      const endCoords = getGridCoords(e.point);
      if (endCoords) {
        handleEditAction(editDragStart, endCoords, e.point);
      }
      setEditDragStart(null);
    }
  };

  const getGridCoords = (point: THREE.Vector3) => {
    const wallPlay = 0.2;
    const overallWidth = width * STUD_PITCH - wallPlay;
    const overallLength = length * STUD_PITCH - wallPlay;
    
    const localX = point.x + overallWidth / 2;
    const localZ = point.z + overallLength / 2;
    
    const xIndex = Math.floor(localX / STUD_PITCH);
    const zIndex = Math.floor(localZ / STUD_PITCH);
    
    if (xIndex >= 0 && xIndex < width && zIndex >= 0 && zIndex < length) {
      return { x: xIndex, z: zIndex, localX, localZ };
    }
    return null;
  };

  const getHoverAction = (start: {x: number, z: number, localX: number, localZ: number}) => {
    if (!customBricks) return null;
    
    // First, find the closest grid boundary
    const fracX = (start.localX / STUD_PITCH) - start.x;
    const fracZ = (start.localZ / STUD_PITCH) - start.z;

    const distLeft = fracX;
    const distRight = 1 - fracX;
    const distTop = fracZ;
    const distBottom = 1 - fracZ;

    const minDist = Math.min(distLeft, distRight, distTop, distBottom);

    if (minDist > 0.35) return null;

    let hoverAxis: 'x' | 'z';
    let hoverIndex: number;
    let dominantSide: -1 | 1;

    if (minDist === distLeft) { hoverAxis = 'x'; hoverIndex = start.x; dominantSide = 1; }
    else if (minDist === distRight) { hoverAxis = 'x'; hoverIndex = start.x + 1; dominantSide = -1; }
    else if (minDist === distTop) { hoverAxis = 'z'; hoverIndex = start.z; dominantSide = 1; }
    else { hoverAxis = 'z'; hoverIndex = start.z + 1; dominantSide = -1; }

    // First check if it's a CUT inside a brick
    const hoveredBrickIndex = customBricks.findIndex(b => 
      start.x >= b.x && start.x < b.x + b.width &&
      start.z >= b.z && start.z < b.z + b.length
    );

    if (hoveredBrickIndex !== -1) {
      const brick = customBricks[hoveredBrickIndex];
      // Check if the boundary is strictly INSIDE the hovered brick
      if (hoverAxis === 'x' && hoverIndex > brick.x && hoverIndex < brick.x + brick.width) {
        return { type: 'cut' as const, axis: hoverAxis, index: hoverIndex, brick, brickIndex: hoveredBrickIndex };
      }
      if (hoverAxis === 'z' && hoverIndex > brick.z && hoverIndex < brick.z + brick.length) {
        return { type: 'cut' as const, axis: hoverAxis, index: hoverIndex, brick, brickIndex: hoveredBrickIndex };
      }
    }

    // If it's NOT a cut inside a brick, it might be a JOIN on the boundary between two bricks!
    if (hoverAxis === 'x') {
      const b1Idx = customBricks.findIndex(b => b.x + b.width === hoverIndex && start.z >= b.z && start.z < b.z + b.length);
      const b2Idx = customBricks.findIndex(b => b.x === hoverIndex && start.z >= b.z && start.z < b.z + b.length);
      
      if (b1Idx !== -1 && b2Idx !== -1) {
        const b1 = customBricks[b1Idx];
        const b2 = customBricks[b2Idx];
        if (b1.z === b2.z && b1.length === b2.length) {
          const dominantBrick = dominantSide === -1 ? b1 : b2;
          return { type: 'join' as const, axis: hoverAxis, index: hoverIndex, brick1: b1, brick2: b2, brick1Index: b1Idx, brick2Index: b2Idx, dominantBrick, dominantSide };
        }
      }
    } else {
      const b1Idx = customBricks.findIndex(b => b.z + b.length === hoverIndex && start.x >= b.x && start.x < b.x + b.width);
      const b2Idx = customBricks.findIndex(b => b.z === hoverIndex && start.x >= b.x && start.x < b.x + b.width);
      
      if (b1Idx !== -1 && b2Idx !== -1) {
        const b1 = customBricks[b1Idx];
        const b2 = customBricks[b2Idx];
        if (b1.x === b2.x && b1.width === b2.width) {
          const dominantBrick = dominantSide === -1 ? b1 : b2;
          return { type: 'join' as const, axis: hoverAxis, index: hoverIndex, brick1: b1, brick2: b2, brick1Index: b1Idx, brick2Index: b2Idx, dominantBrick, dominantSide };
        }
      }
    }

    return null;
  };

  const handleEditAction = (
    start: {x: number, z: number, localX: number, localZ: number}, 
    end: {x: number, z: number, localX: number, localZ: number},
    point: THREE.Vector3
  ) => {
    const startBrickIndex = customBricks!.findIndex(b => 
      start.x >= b.x && start.x < b.x + b.width &&
      start.z >= b.z && start.z < b.z + b.length
    );
    const endBrickIndex = customBricks!.findIndex(b => 
      end.x >= b.x && end.x < b.x + b.width &&
      end.z >= b.z && end.z < b.z + b.length
    );

    // If click or drag is entirely within the SAME cell or adjacent, treat it as a precise CUT or JOIN
    if ((startBrickIndex !== -1 && startBrickIndex === endBrickIndex) || (start.x === end.x && start.z === end.z)) {
      const action = getHoverAction(start); // Use START coords for accuracy
      if (!action) return;
      
      if (action.type === 'cut') {
        const { axis: cutAxis, index: cutIndex, brick, brickIndex } = action;
        if (cutAxis === 'x' && cutIndex > brick.x && cutIndex < brick.x + brick.width) {
          const leftWidth = cutIndex - brick.x;
          const rightWidth = brick.width - leftWidth;
          const newBricks = [...customBricks!];
          newBricks.splice(brickIndex!, 1, 
            { ...brick, width: leftWidth },
            { ...brick, x: cutIndex, width: rightWidth }
          );
          setCustomBricks(newBricks);
        } else if (cutAxis === 'z' && cutIndex > brick.z && cutIndex < brick.z + brick.length) {
          const topLength = cutIndex - brick.z;
          const bottomLength = brick.length - topLength;
          const newBricks = [...customBricks!];
          newBricks.splice(brickIndex!, 1, 
            { ...brick, length: topLength },
            { ...brick, z: cutIndex, length: bottomLength }
          );
          setCustomBricks(newBricks);
        }
      } else if (action.type === 'join') {
        const { brick1, brick2, brick1Index, brick2Index, dominantBrick } = action;
        const newBricks = [...customBricks!];
        
        // Remove larger index first to avoid shifting issues
        const i1 = Math.max(brick1Index!, brick2Index!);
        const i2 = Math.min(brick1Index!, brick2Index!);
        newBricks.splice(i1, 1);
        newBricks.splice(i2, 1);

        newBricks.push({
          x: Math.min(brick1.x, brick2.x),
          z: Math.min(brick1.z, brick2.z),
          width: action.axis === 'x' ? brick1.width + brick2.width : brick1.width,
          length: action.axis === 'z' ? brick1.length + brick2.length : brick1.length,
          hexColor: dominantBrick.hexColor // Inherit color from dominant brick
        });
        
        setCustomBricks(newBricks);
      }
    } 
    // If drag spans multiple cells, it's a JOIN (Bounding Box Merge)
    else {
      const minX = Math.min(start.x, end.x);
      const maxX = Math.max(start.x, end.x);
      const minZ = Math.min(start.z, end.z);
      const maxZ = Math.max(start.z, end.z);

      // Find all bricks completely inside the bounding box
      const intersectedIndices: number[] = [];
      let validJoin = true;
      let firstColor = "";

      for (let i = 0; i < customBricks!.length; i++) {
        const b = customBricks![i];
        // Check if brick overlaps the bounding box at all
        const overlapX = b.x < maxX + 1 && b.x + b.width > minX;
        const overlapZ = b.z < maxZ + 1 && b.z + b.length > minZ;

        if (overlapX && overlapZ) {
          // If it overlaps, it MUST be fully contained within the bounding box
          if (b.x < minX || b.x + b.width > maxX + 1 || b.z < minZ || b.z + b.length > maxZ + 1) {
            validJoin = false; // Bounding box cuts through a brick
            break;
          }
          intersectedIndices.push(i);
          if (intersectedIndices.length === 1) firstColor = b.hexColor;
        }
      }

      if (validJoin && intersectedIndices.length > 1) {
        // Remove old bricks and add the merged one
        const newBricks = customBricks!.filter((_, i) => !intersectedIndices.includes(i));
        newBricks.push({
          x: minX,
          z: minZ,
          width: maxX - minX + 1,
          length: maxZ - minZ + 1,
          hexColor: firstColor
        });
        setCustomBricks(newBricks);
      }
    }
  };

  const paintAtPoint = (point: THREE.Vector3) => {
    const coords = getGridCoords(point);
    if (!coords) return;
    const { x: xIndex, z: zIndex } = coords;
    
    if (xIndex >= 0 && xIndex < width && zIndex >= 0 && zIndex < length) {
      if (paintMode === 'brick' && voxelMatrix) {
        // Run optimizer to find the bounds of the brick we clicked
        const optimizer = new BrickOptimizer(voxelMatrix, width, length);
        const optimizedBricks = optimizer.optimize({
          allowNonStandardSizes: allowNonStandardSizes
        });
        
        const clickedBrick = optimizedBricks.find(b => 
          xIndex >= b.x && xIndex < b.x + b.width &&
          zIndex >= b.z && zIndex < b.z + b.length
        );

        if (clickedBrick) {
          const coords = [];
          for (let bx = clickedBrick.x; bx < clickedBrick.x + clickedBrick.width; bx++) {
            for (let bz = clickedBrick.z; bz < clickedBrick.z + clickedBrick.length; bz++) {
              coords.push({ x: bx, z: bz });
            }
          }
          paintStudsBatch(coords);
        } else {
          // Fallback if not found for some reason
          paintStud(xIndex, zIndex);
        }
      } else {
        paintStud(xIndex, zIndex);
      }
    }
  };

  return (
    <div 
      className="flex-1 h-screen bg-zinc-950 relative"
      style={{ filter: deuteranopiaSimulation ? 'url(#deuteranopia)' : 'none' }}
      onPointerLeave={() => setHoverAction(null)}
    >
      <Canvas 
        camera={{ position: [50, 50, 50], fov: 45 }}
        onPointerUp={() => setIsPainting(false)}
        onPointerLeave={() => {
          setIsPainting(false);
          setHoverAction(null);
        }}
      >
        {/* Environment & Lighting */}
        <color attach="background" args={['#09090b']} />
        <ambientLight intensity={0.5} />
        <directionalLight 
          position={[50, 100, 20]} 
          intensity={1.5} 
          castShadow 
          shadow-mapSize={[2048, 2048]} 
        />
        <Environment preset="city" />

        {/* Baseplate Mesh */}
        {showBaseplate && (
          <mesh 
            geometry={baseGeometry} 
            castShadow 
            receiveShadow
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <meshStandardMaterial 
              vertexColors={true}
              roughness={0.4} 
              metalness={0.1} 
            />
          </mesh>
        )}

        {/* 1x1 Mosaic Bricks Mesh */}
        {showBricks && bricksGeometry && (
          <group position={[0, explodedView ? 5.0 : 0, 0]}>
            <mesh 
              geometry={bricksGeometry} 
              castShadow 
              receiveShadow
              onClick={handleClick}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            >
              <meshStandardMaterial 
                vertexColors={true}
                roughness={0.2} // Slightly smoother for tiles/plates
                metalness={0.1} 
              />
            </mesh>
            {/* Simple Cut/Join Line Preview */}
            {hoverAction && (
              <group
                position={[
                  hoverAction.axis === 'x' 
                    ? hoverAction.index * STUD_PITCH - (width * STUD_PITCH - 0.2) / 2
                    : ((hoverAction.type === 'cut' ? hoverAction.brick.x : hoverAction.brick1.x) + (hoverAction.type === 'cut' ? hoverAction.brick.width : hoverAction.brick1.width) / 2) * STUD_PITCH - (width * STUD_PITCH - 0.2) / 2,
                  6.5, // Float clearly above the plate surface to avoid shadows and ensure maximum visibility
                  hoverAction.axis === 'z'
                    ? hoverAction.index * STUD_PITCH - (length * STUD_PITCH - 0.2) / 2
                    : ((hoverAction.type === 'cut' ? hoverAction.brick.z : hoverAction.brick1.z) + (hoverAction.type === 'cut' ? hoverAction.brick.length : hoverAction.brick1.length) / 2) * STUD_PITCH - (length * STUD_PITCH - 0.2) / 2
                ]}
              >
                <group scale={[1, 0.01, 1]}>
                  {/* Solid Black Background Outline */}
                  <mesh position={[0, -1, 0]}>
                    <boxGeometry args={[
                      hoverAction.axis === 'x' ? 0.55 : (hoverAction.type === 'cut' ? hoverAction.brick.width : hoverAction.brick1.width) * STUD_PITCH + 0.15,
                      1, 
                      hoverAction.axis === 'z' ? 0.55 : (hoverAction.type === 'cut' ? hoverAction.brick.length : hoverAction.brick1.length) * STUD_PITCH + 0.15
                    ]} />
                    <meshBasicMaterial color="#000000" toneMapped={false} />
                  </mesh>

                  {/* Main Line */}
                  <mesh>
                    <boxGeometry args={[
                      hoverAction.axis === 'x' ? 0.4 : (hoverAction.type === 'cut' ? hoverAction.brick.width : hoverAction.brick1.width) * STUD_PITCH,
                      1, 
                      hoverAction.axis === 'z' ? 0.4 : (hoverAction.type === 'cut' ? hoverAction.brick.length : hoverAction.brick1.length) * STUD_PITCH
                    ]} />
                    <meshBasicMaterial 
                      color={hoverAction.type === 'cut' ? "#ff3b30" : "#34c759"} 
                      toneMapped={false} 
                    />
                  </mesh>
                </group>
                
                {hoverAction.type === 'join' && hoverAction.dominantSide && (
                  <group
                    position={[
                      hoverAction.axis === 'x' ? hoverAction.dominantSide * 1.1 : 0,
                      0.1, 
                      hoverAction.axis === 'z' ? hoverAction.dominantSide * 1.1 : 0
                    ]}
                    scale={[1, 0.01, 1]}
                  >
                    {/* Solid Black Background Outline */}
                    <mesh
                      position={[0, -1, 0]}
                      rotation={[
                        hoverAction.axis === 'z' ? (hoverAction.dominantSide === 1 ? -Math.PI/2 : Math.PI/2) : 0,
                        0,
                        hoverAction.axis === 'x' ? (hoverAction.dominantSide === 1 ? Math.PI/2 : -Math.PI/2) : 0
                      ]}
                    >
                      <coneGeometry args={[1.0, 1.7, 3]} />
                      <meshBasicMaterial color="#000000" toneMapped={false} />
                    </mesh>

                    {/* Main Arrow */}
                    <mesh
                      rotation={[
                        hoverAction.axis === 'z' ? (hoverAction.dominantSide === 1 ? -Math.PI/2 : Math.PI/2) : 0,
                        0,
                        hoverAction.axis === 'x' ? (hoverAction.dominantSide === 1 ? Math.PI/2 : -Math.PI/2) : 0
                      ]}
                    >
                      <coneGeometry args={[0.8, 1.4, 3]} />
                      <meshBasicMaterial 
                        color="#34c759" 
                        toneMapped={false}
                      />
                    </mesh>
                  </group>
                )}
              </group>
            )}
          </group>
        )}

        {/* Ground grid and shadows for premium aesthetics */}
        <Grid 
          infiniteGrid 
          fadeDistance={200} 
          cellColor="#3f3f46" 
          sectionColor="#52525b" 
          position={[0, -0.01, 0]}
        />
        <ContactShadows 
          resolution={1024} 
          scale={150} 
          blur={2} 
          opacity={0.5} 
          far={50} 
          position={[0, -0.01, 0]}
        />

        {/* Controls */}
        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          enablePan={true}
          enableZoom={true}
          enableRotate={!isPainting && !editDragStart} 
          minPolarAngle={0} 
        />
      </Canvas>
      
      {/* Temporary Stats UI overlay (for performance metrics in the future) */}
      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur text-xs text-white p-2 rounded pointer-events-none">
        <div>Faces: {(baseGeometry.index ? baseGeometry.index.count / 3 : baseGeometry.attributes.position.count / 3) + (bricksGeometry ? (bricksGeometry.index ? bricksGeometry.index.count / 3 : bricksGeometry.attributes.position.count / 3) : 0)}</div>
      </div>
    </div>
  );
}
