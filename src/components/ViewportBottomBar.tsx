'use client';

import React from 'react';
import { usePuzzleStore } from '@/store/usePuzzleStore';
import { Info } from 'lucide-react';

export function ViewportBottomBar() {
  const { width, length, baseChunkSize } = usePuzzleStore();

  const isSplit = baseChunkSize > 0;
  
  let pieceCount = 1;
  if (isSplit) {
    const numX = Math.ceil(width / baseChunkSize);
    const numZ = Math.ceil(length / baseChunkSize);
    pieceCount = numX * numZ;
  }

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-[#12141c] border-t border-zinc-800/50 w-full shrink-0 text-xs">
      <div className="flex items-center gap-1.5 text-zinc-300 font-medium">
        <Info size={14} className="text-zinc-500" />
        {isSplit ? 'Splits into multiple pieces' : 'Fits bed in one piece'}
      </div>
      <div className="w-px h-3 bg-zinc-700"></div>
      <div className="text-zinc-500">
        {isSplit 
          ? `Puzzle will be generated as ${pieceCount} interlocking baseplate pieces.` 
          : `Puzzle fits on a single ${width}x${length} base.`}
      </div>
    </div>
  );
}
