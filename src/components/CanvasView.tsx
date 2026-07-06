'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Environment, ContactShadows } from '@react-three/drei';
import { BaseplateGenerator } from '@/lib/geometry/baseplate-generator';
import { BrickGenerator } from '@/lib/geometry/brick-generator';
import { BrickOptimizer, OptimizedBrick } from '@/lib/geometry/brick-optimizer';
import { KlemmbrickGenerator } from '@/lib/geometry/klemmbrick-generator';
import { calculateTolerances, STUD_PITCH } from '@/lib/math/tolerances';
import { usePuzzleStore, MaterialProfile } from '@/store/usePuzzleStore';
import * as THREE from 'three';

// Helper component to safely render InstancedMesh without NaN warnings on first frame
function BrickGroup({ group }: { group: any }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  React.useEffect(() => {
    if (meshRef.current) {
      meshRef.current.instanceMatrix.needsUpdate = true;
      if (meshRef.current.instanceColor) {
        meshRef.current.instanceColor.needsUpdate = true;
      }
      meshRef.current.computeBoundingSphere();
    }
  }, [group]);

  return (
    <instancedMesh 
      ref={meshRef}
      args={[group.geometry, undefined, group.count]}
      castShadow 
      receiveShadow
    >
      <meshStandardMaterial 
        vertexColors={false}
        roughness={0.2}
        metalness={0.1} 
      />
      <instancedBufferAttribute attach="instanceMatrix" args={[group.matrices, 16]} />
      <instancedBufferAttribute attach="instanceColor" args={[group.colors, 3]} />
    </instancedMesh>
  );
}

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
    showBricks,
    baseChunkSize,
    borderWidth,
    connectorHoleDiameter,
    connectorHoleDepth,
    holePlacement
  } = usePuzzleStore();
  const controlsRef = useRef<any>(null);
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

  // Memoize the geometry generation for baseplates
  const baseplateChunks = useMemo(() => {
    const tolerances = calculateTolerances(materialProfile, snapFit);
    const isHeightmap = voxelMatrix?.cells[0]?.[0]?.height !== undefined;
    
    const totalWidth = width + 2 * borderWidth;
    const totalLength = length + 2 * borderWidth;
    
    // If it's a heightmap AND there's no splitting/border, we can pass the matrix.
    // Otherwise, we just generate flat baseplates for mosaics.
    const passMatrix = isHeightmap && baseChunkSize === 0 && borderWidth === 0;

    const chunks = [];
    
    if (baseChunkSize === 0) {
      const gen = new BaseplateGenerator(
        totalWidth, totalLength, tolerances.snapFit, 1, passMatrix ? voxelMatrix : null,
        true, true, true, true,
        connectorHoleDiameter, connectorHoleDepth, false, holePlacement
      );
      chunks.push({ geometry: gen.generateGeometry(), position: [0, 0, 0] as [number, number, number] });
    } else {
      const numX = Math.ceil(totalWidth / baseChunkSize);
      const numZ = Math.ceil(totalLength / baseChunkSize);
      
      const wallPlay = 0.2;
      const overallTotalWidth = totalWidth * STUD_PITCH - wallPlay;
      const overallTotalLength = totalLength * STUD_PITCH - wallPlay;
      const startX = -overallTotalWidth / 2;
      const startZ = -overallTotalLength / 2;

      for (let x = 0; x < numX; x++) {
        for (let z = 0; z < numZ; z++) {
          const chunkW = (x === numX - 1 && totalWidth % baseChunkSize !== 0) ? totalWidth % baseChunkSize : baseChunkSize;
          const chunkL = (z === numZ - 1 && totalLength % baseChunkSize !== 0) ? totalLength % baseChunkSize : baseChunkSize;
          
          const gen = new BaseplateGenerator(
            chunkW, chunkL, tolerances.snapFit, 1, null, 
            true, true, true, true,
            connectorHoleDiameter, connectorHoleDepth, false, holePlacement
          );
          const geom = gen.generateGeometry();
          
          const chunkOverallW = chunkW * STUD_PITCH - wallPlay;
          const chunkOverallL = chunkL * STUD_PITCH - wallPlay;
          
          const chunkStartX = startX + (x * baseChunkSize * STUD_PITCH);
          const chunkStartZ = startZ + (z * baseChunkSize * STUD_PITCH);
          
          const cx = chunkStartX + chunkOverallW / 2;
          const cz = chunkStartZ + chunkOverallL / 2;
          
          chunks.push({ geometry: geom, position: [cx, 0, cz] as [number, number, number] });
        }
      }
    }
    
    return chunks;
  }, [width, length, materialProfile, snapFit, voxelMatrix?.cells[0]?.[0]?.height, baseChunkSize, borderWidth, connectorHoleDiameter, connectorHoleDepth, holePlacement]);

  const instancedBricks = useMemo(() => {
    const tolerances = calculateTolerances(materialProfile, snapFit);
    const isHeightmap = voxelMatrix?.cells[0]?.[0]?.height !== undefined;
    let instancedGroups = null;

    // Generate separate bricks if it's a mosaic
    if (voxelMatrix && !isHeightmap) {
      let optimizedBricks = customBricks;
      if (!optimizedBricks) {
        const optimizer = new BrickOptimizer(voxelMatrix, width, length);
        optimizedBricks = optimizer.optimize({
          allowNonStandardSizes: allowNonStandardSizes
        });
      }
      
      // If optimization is turned off, manually convert all to 1x1 bricks
      if (!optimizePieces) {
        optimizedBricks = [];
        for (let x = 0; x < width; x++) {
          for (let z = 0; z < length; z++) {
            const cell = voxelMatrix.cells[x]?.[z];
            if (cell?.hexColor) {
              optimizedBricks.push({ x, z, width: 1, length: 1, hexColor: cell.hexColor });
            }
          }
        }
      }

      // Group by WxL
      const groups = new Map<string, OptimizedBrick[]>();
      for (const brick of optimizedBricks) {
         const key = `${brick.width}x${brick.length}`;
         if (!groups.has(key)) groups.set(key, []);
         groups.get(key)!.push(brick);
      }

      const wallPlay = 0.2;
      const totalWidth = width + 2 * borderWidth;
      const totalLength = length + 2 * borderWidth;
      
      const overallTotalWidth = totalWidth * STUD_PITCH - wallPlay;
      const overallTotalLength = totalLength * STUD_PITCH - wallPlay;
      
      // Start position is the top-left of the entire bordered baseplate, PLUS the border width offset
      const startX = -overallTotalWidth / 2 + (STUD_PITCH / 2) - (wallPlay / 2) + (borderWidth * STUD_PITCH);
      const startZ = -overallTotalLength / 2 + (STUD_PITCH / 2) - (wallPlay / 2) + (borderWidth * STUD_PITCH);

      instancedGroups = [];
      const dummy = new THREE.Object3D();
      const color = new THREE.Color();

      for (const [key, bricks] of groups.entries()) {
         const [w, l] = key.split('x').map(Number);
         const gen = new KlemmbrickGenerator(w, l, tolerances.snapFit, 1/3);
         const geometry = gen.generateGeometry();
         
         if (geometry.attributes.position) {
           const posArray = geometry.attributes.position.array as Float32Array;
           for (let i = 0; i < posArray.length; i++) {
             if (isNaN(posArray[i])) {
               console.error(`NaN found in KlemmbrickGenerator geometry for ${w}x${l} at index ${i}`);
               break;
             }
           }
         }

         const matrixArray = new Float32Array(bricks.length * 16);
         const colorArray = new Float32Array(bricks.length * 3);
         
         bricks.forEach((brick, i) => {
            const centerX = startX + brick.x * STUD_PITCH + ((brick.width - 1) * STUD_PITCH) / 2;
            const centerZ = startZ + brick.z * STUD_PITCH + ((brick.length - 1) * STUD_PITCH) / 2;
            
            if (isNaN(centerX) || isNaN(centerZ)) {
              console.error(`NaN found in brick coordinates: x=${brick.x}, z=${brick.z}, width=${brick.width}, length=${brick.length}`);
            }

            dummy.position.set(centerX, 9.6, centerZ);
            dummy.updateMatrix();
            dummy.matrix.toArray(matrixArray, i * 16);
            
            color.set(brick.hexColor);
            color.toArray(colorArray, i * 3);
         });
         
         instancedGroups.push({
            key,
            geometry,
            count: bricks.length,
            matrices: matrixArray,
            colors: colorArray
         });
      }
    }

    return instancedGroups;
  }, [width, length, materialProfile, snapFit, voxelMatrix, customBricks, optimizePieces, allowNonStandardSizes, borderWidth]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    // Let OrbitControls handle mouse down for rotation/panning.
    // Do not stop propagation here.
  };

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.button !== 0) return; // Only process left click
    
    // R3F onClick only fires if the user clicks and releases WITHOUT dragging.
    // So this won't fire at the end of a camera rotation drag!
    
    if (paintMode === 'edit') {
      if (hoverAction) {
        e.stopPropagation();
        executeHoverAction(hoverAction);
      }
    } else if (activePaintColor) {
      e.stopPropagation();
      commitHistory(); // Save state before stroke
      paintAtPoint(e.point);
    }
  };

  const handlePointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (paintMode === 'edit') {
      const coords = getGridCoords(e.point);
      if (coords) {
        const action = getHoverAction(coords);
        setHoverAction(action);
      } else {
        setHoverAction(null);
      }
    } else {
      setHoverAction(null);
    }
  };

  const handlePointerUp = (e?: ThreeEvent<PointerEvent>) => {
    // Nothing needed
  };

  const getGridCoords = (point: THREE.Vector3) => {
    const wallPlay = 0.2;
    const totalWidth = width + 2 * borderWidth;
    const totalLength = length + 2 * borderWidth;
    
    const overallTotalWidth = totalWidth * STUD_PITCH - wallPlay;
    const overallTotalLength = totalLength * STUD_PITCH - wallPlay;
    
    const localX = point.x + overallTotalWidth / 2;
    const localZ = point.z + overallTotalLength / 2;
    
    const globalXIndex = Math.floor(localX / STUD_PITCH);
    const globalZIndex = Math.floor(localZ / STUD_PITCH);
    
    const xIndex = globalXIndex - borderWidth;
    const zIndex = globalZIndex - borderWidth;
    
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

  const executeHoverAction = (action: any) => {
    if (!customBricks) return;
    
    if (action.type === 'cut') {
      const { axis: cutAxis, index: cutIndex, brick, brickIndex } = action;
      if (cutAxis === 'x' && cutIndex > brick.x && cutIndex < brick.x + brick.width) {
        const leftWidth = cutIndex - brick.x;
        const rightWidth = brick.width - leftWidth;
        const newBricks = [...customBricks];
        newBricks.splice(brickIndex, 1, 
          { ...brick, width: leftWidth },
          { ...brick, x: cutIndex, width: rightWidth }
        );
        setCustomBricks(newBricks);
      } else if (cutAxis === 'z' && cutIndex > brick.z && cutIndex < brick.z + brick.length) {
        const topLength = cutIndex - brick.z;
        const bottomLength = brick.length - topLength;
        const newBricks = [...customBricks];
        newBricks.splice(brickIndex, 1, 
          { ...brick, length: topLength },
          { ...brick, z: cutIndex, length: bottomLength }
        );
        setCustomBricks(newBricks);
      }
    } else if (action.type === 'join') {
      const { brick1, brick2, brick1Index, brick2Index, dominantBrick } = action;
      const newBricks = [...customBricks];
      
      // Remove larger index first to avoid shifting issues
      const i1 = Math.max(brick1Index, brick2Index);
      const i2 = Math.min(brick1Index, brick2Index);
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
        onPointerLeave={() => {
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
        {showBaseplate && baseplateChunks.map((chunk, index) => (
          <mesh 
            key={index} 
            geometry={chunk.geometry} 
            position={chunk.position}
            onClick={handleClick}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
          >
            <meshStandardMaterial 
              color="#3b82f6" 
              vertexColors={true}
              roughness={0.8}
              metalness={0.2}
            />
          </mesh>
        ))}

        {/* Instanced Mosaic Bricks Mesh */}
        {showBricks && instancedBricks && (
          <group position={[0, explodedView ? 5.0 : 0, 0]} onClick={handleClick} onPointerDown={handlePointerDown} onPointerMove={handlePointerMove} onPointerUp={handlePointerUp}>
            {instancedBricks.map((group) => (
              <BrickGroup key={group.key} group={group} />
            ))}
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
          enableRotate={true} 
          minPolarAngle={0} 
        />
      </Canvas>
      
      {/* Temporary Stats UI overlay (for performance metrics in the future) */}
      <div className="absolute top-4 right-4 bg-black/50 backdrop-blur text-xs text-white p-2 rounded pointer-events-none">
        <div>Faces: {
          (baseplateChunks ? baseplateChunks.reduce((acc, chunk) => {
            const faces = chunk.geometry.index ? chunk.geometry.index.count / 3 : chunk.geometry.attributes.position.count / 3;
            return acc + faces;
          }, 0) : 0) + 
          (instancedBricks ? instancedBricks.reduce((acc, group) => {
            const faces = group.geometry.index ? group.geometry.index.count / 3 : group.geometry.attributes.position.count / 3;
            return acc + (faces * group.count);
          }, 0) : 0)
        }</div>
      </div>
    </div>
  );
}
