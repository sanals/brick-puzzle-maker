'use client';

import React from 'react';
import { Layers, Cuboid, Expand, LocateFixed, Undo2, Redo2 } from 'lucide-react';
import { usePuzzleStore } from '@/store/usePuzzleStore';

export function ViewportTopBar() {
  const {
    width, length,
    explodedView, setExplodedView,
    showBaseplate, setShowBaseplate,
    showBricks, setShowBricks,
    triggerCameraReset,
    undo, redo, historyIndex, history
  } = usePuzzleStore();

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#12141c] border-b border-zinc-800/50 w-full shrink-0">
      <div className="flex items-center gap-4">
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
      </div>

      <div className="text-xs text-zinc-500 font-medium">
        {width}x{length} grid - {width * 8} x {length * 8} mm
      </div>
    </div>
  );
}
