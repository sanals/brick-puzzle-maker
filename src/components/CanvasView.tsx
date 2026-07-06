'use client';

import React, { useMemo, useRef, useState, useEffect, useDeferredValue } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { BaseplateGenerator } from '@/lib/geometry/baseplate-generator';
import { BrickOptimizer, OptimizedBrick } from '@/lib/geometry/brick-optimizer';
import { KlemmbrickGenerator } from '@/lib/geometry/klemmbrick-generator';
import { calculateTolerances, STUD_PITCH } from '@/lib/math/tolerances';
import { usePuzzleStore, MaterialProfile } from '@/store/usePuzzleStore';
import * as THREE from 'three';
import { X, Info } from 'lucide-react';

const geometryCache = new Map<string, THREE.BufferGeometry>();

function getCachedGeometry(w: number, l: number, materialProfile: MaterialProfile, snapFit: number, highResMode: boolean) {
  const tolerances = calculateTolerances(materialProfile, snapFit);
  const key = `${w}x${l}-${materialProfile}-${snapFit}-${highResMode}`;
  if (!geometryCache.has(key)) {
    const gen = new KlemmbrickGenerator(w, l, tolerances.snapFit, 1/3, false, !highResMode);
    const geometry = gen.generateGeometry();
    geometryCache.set(key, geometry);
  }
  return geometryCache.get(key)!;
}

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
    holePlacement,
    cameraResetTrigger,
    activeEditChunk,
    setActiveEditChunk,
    skipSplitPrompt,
    setSkipSplitPrompt,
    setFacesCount,
    highResMode,
    dismissedPreviewBanner,
    setDismissedPreviewBanner
  } = usePuzzleStore();
  const controlsRef = useRef<any>(null);

  // Reset camera when triggered
  useEffect(() => {
    if (cameraResetTrigger > 0 && controlsRef.current) {
      if (activeEditChunk) {
        const targetX = ((activeEditChunk.startX + activeEditChunk.width / 2) - width / 2) * 8.0;
        const targetZ = ((activeEditChunk.startZ + activeEditChunk.length / 2) - length / 2) * 8.0;
        
        controlsRef.current.target.set(targetX, 0, targetZ);
        controlsRef.current.object.position.set(targetX, 50, targetZ + 50);
        controlsRef.current.update();
      } else {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.object.position.set(0, 50, 50);
        controlsRef.current.update();
      }
    }
  }, [cameraResetTrigger, activeEditChunk, width, length]);

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
      chunks.push({ 
        geometry: gen.generateGeometry(), 
        position: [0, 0, 0] as [number, number, number],
        gridX: 0,
        gridZ: 0,
        gridW: totalWidth,
        gridL: totalLength
      });
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
          
          const chunkGridStartX = x * baseChunkSize;
          const chunkGridStartZ = z * baseChunkSize;


          
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
          
          chunks.push({ geometry: geom, position: [cx, 0, cz] as [number, number, number], gridX: chunkGridStartX, gridZ: chunkGridStartZ, gridW: chunkW, gridL: chunkL });
        }
      }
    }
    
    return chunks;
  }, [width, length, materialProfile, snapFit, voxelMatrix?.cells[0]?.[0]?.height, baseChunkSize, borderWidth, connectorHoleDiameter, connectorHoleDepth, holePlacement]);

  const deferredVoxelMatrix = useDeferredValue(voxelMatrix);

  const allOptimizedBricks = useMemo(() => {
    const isHeightmap = deferredVoxelMatrix?.cells[0]?.[0]?.height !== undefined;

    // Generate separate bricks if it's a mosaic
    if (deferredVoxelMatrix && !isHeightmap) {
      let optimizedBricks = customBricks;
      if (!optimizedBricks) {
        const optimizer = new BrickOptimizer(deferredVoxelMatrix, width, length);
        optimizedBricks = optimizer.optimize({
          allowNonStandardSizes: allowNonStandardSizes
        });
      }
      
      // If optimization is turned off, manually convert all to 1x1 bricks
      if (!optimizePieces) {
        optimizedBricks = [];
        for (let x = 0; x < width; x++) {
          for (let z = 0; z < length; z++) {
            const cell = deferredVoxelMatrix.cells[x]?.[z];
            if (cell?.hexColor) {
              optimizedBricks.push({ x, z, width: 1, length: 1, hexColor: cell.hexColor });
            }
          }
        }
      }
      return optimizedBricks;
    }
    return null;
  }, [width, length, deferredVoxelMatrix, customBricks, optimizePieces, allowNonStandardSizes]);

  const instancedBricks = useMemo(() => {
    if (!allOptimizedBricks) return null;
    const tolerances = calculateTolerances(materialProfile, snapFit);
    let instancedGroups = null;

    let optimizedBricks = allOptimizedBricks;
    if (activeEditChunk) {
      optimizedBricks = optimizedBricks.filter(brick => {
        return brick.x < activeEditChunk.startX + activeEditChunk.width && 
               brick.x + brick.width > activeEditChunk.startX &&
               brick.z < activeEditChunk.startZ + activeEditChunk.length && 
               brick.z + brick.length > activeEditChunk.startZ;
      });
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
         
         const geometry = getCachedGeometry(w, l, materialProfile, snapFit, highResMode);
         
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

    return instancedGroups;
  }, [width, length, materialProfile, snapFit, allOptimizedBricks, activeEditChunk, borderWidth, highResMode]);

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

  const maxPlatesX = baseChunkSize === 16 ? 4 : 3; // Max 64 for 16, 72 for 24
  const maxPlatesZ = baseChunkSize === 16 ? 4 : 3;

  const totalPlatesX = Math.ceil(width / baseChunkSize);
  const totalPlatesZ = Math.ceil(length / baseChunkSize);

  const numChunksX = Math.ceil(totalPlatesX / maxPlatesX);
  const numChunksZ = Math.ceil(totalPlatesZ / maxPlatesZ);

  const platesPerChunkX = Math.ceil(totalPlatesX / numChunksX);
  const platesPerChunkZ = Math.ceil(totalPlatesZ / numChunksZ);

  const editChunkW = platesPerChunkX * baseChunkSize;
  const editChunkL = platesPerChunkZ * baseChunkSize;

  const isLargePuzzle = numChunksX > 1 || numChunksZ > 1;

  useEffect(() => {
    const faces1 = baseplateChunks ? baseplateChunks.reduce((acc, chunk) => {
      const faces = chunk.geometry.index ? chunk.geometry.index.count / 3 : chunk.geometry.attributes.position.count / 3;
      return acc + faces;
    }, 0) : 0;
    
    const faces2 = instancedBricks ? instancedBricks.reduce((acc, group) => {
      const faces = group.geometry.index ? group.geometry.index.count / 3 : group.geometry.attributes.position.count / 3;
      return acc + (faces * group.count);
    }, 0) : 0;

    setFacesCount(faces1 + faces2);
  }, [baseplateChunks, instancedBricks, setFacesCount]);

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
        {showBaseplate && baseplateChunks.filter(chunk => {
          if (!activeEditChunk) return true;
          if (
            chunk.gridX >= activeEditChunk.startX + activeEditChunk.width ||
            chunk.gridX + chunk.gridW <= activeEditChunk.startX ||
            chunk.gridZ >= activeEditChunk.startZ + activeEditChunk.length ||
            chunk.gridZ + chunk.gridL <= activeEditChunk.startZ
          ) {
            return false;
          }
          return true;
        }).map((chunk, index) => (
          <mesh 
            key={index} 
            geometry={chunk.geometry} 
            position={chunk.position}
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
          <group position={[0, explodedView ? 5.0 : 0, 0]}>
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
        <ContactShadows 
          resolution={1024} 
          scale={150} 
          blur={2} 
          opacity={0.5} 
          far={50} 
          position={[0, -0.01, 0]}
        />
        {/* Helper Grid */}
        <gridHelper 
          args={[
            activeEditChunk 
              ? (Math.max(activeEditChunk.width, activeEditChunk.length) + 4) * 8.0 
              : (Math.max(width, length) + 4) * 8.0, // Grid size in mm (+4 for padding)
            activeEditChunk 
              ? Math.max(activeEditChunk.width, activeEditChunk.length) + 4
              : Math.max(width, length) + 4,         // Divisions (one per stud + padding)
            0x444444, 0x222222
          ]} 
          position={
            activeEditChunk 
              ? [
                  ((activeEditChunk.startX + activeEditChunk.width / 2) - width / 2) * 8.0, 
                  -1, 
                  ((activeEditChunk.startZ + activeEditChunk.length / 2) - length / 2) * 8.0
                ]
              : [0, -1, 0]
          } 
        />

        {/* Global Raycast Plane - Solves massive CSG Raycasting lag */}
        <mesh 
          rotation={[-Math.PI / 2, 0, 0]} 
          position={[0, explodedView ? 17.8 : 12.8, 0]}
          onClick={handleClick}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
        >
          <planeGeometry args={[5000, 5000]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} />
        </mesh>

        {/* Controls */}
        <OrbitControls 
          ref={controlsRef} 
          makeDefault 
          enablePan={true}
          enableZoom={true}
          enableRotate={true} 
          enableDamping={false}
          minPolarAngle={0} 
        />
      </Canvas>
      
      {/* Large Puzzle Split Prompt */}
      {!skipSplitPrompt && !activeEditChunk && isLargePuzzle && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20">
          <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl shadow-2xl max-w-md text-center space-y-4">
            <h3 className="text-lg font-bold text-white">Large Puzzle Detected</h3>
            <p className="text-zinc-400 text-sm">
              This puzzle is quite large ({width}x{length}). To improve performance and make editing easier, we recommend splitting the workspace into manageable chunks.
            </p>
            <div className="flex gap-3 justify-center pt-2">
              <button 
                onClick={() => setSkipSplitPrompt(true)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded text-sm transition-colors"
              >
                Keep Full View
              </button>
              <button 
                onClick={() => {
                  setActiveEditChunk({ startX: 0, startZ: 0, width: editChunkW, length: editChunkL });
                  setSkipSplitPrompt(true);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors shadow-lg"
              >
                Split Workspace
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Right Floating UI */}
      <div className="absolute top-4 right-4 flex flex-col items-end gap-3 z-10 pointer-events-none">
        
        {/* Fast Preview Banner */}
        {!highResMode && !dismissedPreviewBanner && (
          <div className="flex items-center gap-2 bg-[#12141c]/90 border border-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg text-xs font-medium shadow-xl backdrop-blur-md pointer-events-auto">
            <Info size={16} className="shrink-0" />
            <span>Fast Preview Active. Disable to see print-ready rendering.</span>
            <button 
              onClick={() => setDismissedPreviewBanner(true)}
              className="p-1 hover:bg-emerald-500/20 rounded-md transition-colors ml-2"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Minimap Overlay */}
        {activeEditChunk && (
          <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700 p-2 rounded-lg shadow-2xl flex flex-col gap-1 pointer-events-auto">
            <div className="text-xs font-bold text-zinc-400 mb-1 px-1 flex justify-between items-center">
              Chunk Navigator
              <button 
                onClick={() => setActiveEditChunk(null)}
              className="text-zinc-500 hover:text-white p-0.5 rounded hover:bg-zinc-800 transition-colors ml-4"
              title="Close Navigator"
            >
              <X size={14} />
            </button>
          </div>
          <div 
            className="grid gap-0.5" 
            style={{ gridTemplateColumns: `repeat(${numChunksX}, minmax(0, 1fr))` }}
          >
            {Array.from({ length: numChunksZ }).map((_, z) => (
              Array.from({ length: numChunksX }).map((_, x) => {
                const isActive = activeEditChunk.startX === x * editChunkW && activeEditChunk.startZ === z * editChunkL;
                return (
                  <button
                    key={`${x}-${z}`}
                    onClick={() => setActiveEditChunk({
                      startX: x * editChunkW,
                      startZ: z * editChunkL,
                      width: editChunkW,
                      length: editChunkL
                    })}
                    className={`w-8 h-8 rounded-sm border ${
                      isActive 
                        ? 'bg-blue-500/50 border-blue-400' 
                        : 'bg-zinc-800 border-zinc-700 hover:bg-zinc-700'
                    } transition-colors`}
                    title={`Chunk ${x+1},${z+1}`}
                  />
                );
              })
            ))}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
