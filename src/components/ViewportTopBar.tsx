'use client';

import React from 'react';
import { Layers, Cuboid, Expand, LocateFixed, Undo2, Redo2, Box, Grid3X3, SplitSquareHorizontal } from 'lucide-react';
import { usePuzzleStore } from '@/store/usePuzzleStore';

export function ViewportTopBar() {
  const {
    width, length,
    explodedView, setExplodedView,
    showBaseplate, setShowBaseplate,
    showBricks, setShowBricks,
    triggerCameraReset,
    undo, redo, historyIndex, history,
    viewMode, setViewMode,
    facesCount
  } = usePuzzleStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;
  const { baseChunkSize, activeEditChunk, setActiveEditChunk, setSkipSplitPrompt } = usePuzzleStore();

  const maxPlatesX = baseChunkSize === 16 ? 4 : 3;
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

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#12141c] border-b border-zinc-800/50 w-full shrink-0">
      <div className="flex items-center gap-4">
        
        {/* Mode Toggle */}
        <div className="flex bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
          <button
            onClick={() => setViewMode('3d')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors rounded ${
              viewMode === '3d' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Box size={14} />
            3D Preview
          </button>
          <button
            onClick={() => setViewMode('map')}
            className={`flex items-center gap-1.5 px-3 py-1 text-xs font-medium transition-colors rounded ${
              viewMode === 'map' ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Grid3X3 size={14} />
            Brick Map
          </button>
        </div>

        <div className="w-px h-4 bg-zinc-700 mx-1"></div>

        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={!canUndo}
            className={`p-1.5 rounded transition-colors ${canUndo ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-zinc-600 cursor-not-allowed'}`}
            title="Undo"
          >
            <Undo2 size={16} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className={`p-1.5 rounded transition-colors ${canRedo ? 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800' : 'text-zinc-600 cursor-not-allowed'}`}
            title="Redo"
          >
            <Redo2 size={16} />
          </button>
        </div>

        {viewMode === '3d' && (
          <>
            <div className="w-px h-4 bg-zinc-700 mx-1"></div>

            {/* View Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={triggerCameraReset}
                className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                title="Reset Camera View"
              >
                <LocateFixed size={14} />
                Reset View
              </button>

              <button
                onClick={() => setExplodedView(!explodedView)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  explodedView ? 'bg-blue-600/20 text-blue-400' : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800'
                }`}
                title="Toggle Exploded View"
              >
                <Expand size={14} />
                Exploded View
              </button>

              {isLargePuzzle && !activeEditChunk && (
                <button
                  onClick={() => {
                    setActiveEditChunk({ startX: 0, startZ: 0, width: editChunkW, length: editChunkL });
                    setSkipSplitPrompt(true);
                  }}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
                  title="Split Workspace"
                >
                  <SplitSquareHorizontal size={14} />
                  Split View
                </button>
              )}
            </div>

            <div className="w-px h-4 bg-zinc-700 mx-1"></div>

            {/* Visibility Toggles */}
            <div className="flex bg-zinc-900 p-0.5 rounded-md border border-zinc-800">
              <button
                onClick={() => setShowBaseplate(!showBaseplate)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs transition-colors rounded ${
                  showBaseplate ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Toggle Baseplate Visibility"
              >
                <Layers size={14} />
                Baseplate
              </button>
              <button
                onClick={() => setShowBricks(!showBricks)}
                className={`flex items-center gap-1.5 px-3 py-1 text-xs transition-colors rounded ${
                  showBricks ? 'bg-zinc-700 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Toggle Bricks Visibility"
              >
                <Cuboid size={14} />
                Bricks
              </button>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center gap-4">
        {viewMode === '3d' && (
          <div className="text-xs text-zinc-400 bg-zinc-900 px-2 py-1 rounded border border-zinc-800">
            Faces: {facesCount.toLocaleString()}
          </div>
        )}
        <div className="text-xs text-zinc-500 font-medium">
          {width}x{length} grid - {width * 8} x {length * 8} mm
        </div>
      </div>
    </div>
  );
}
