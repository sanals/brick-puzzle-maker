'use client';

import { SidebarControls } from '@/components/SidebarControls';
import { CanvasView } from '@/components/CanvasView';
import { ViewportTopBar } from '@/components/ViewportTopBar';
import { ViewportBottomBar } from '@/components/ViewportBottomBar';
import { usePuzzleStore } from '@/store/usePuzzleStore';

export default function Home() {
  const { width, length, snapFit, materialProfile } = usePuzzleStore();

  return (
    <main className="flex h-screen w-full bg-zinc-950 overflow-hidden">
      <SidebarControls />
      <div className="flex-1 flex flex-col relative bg-[#09090b]">
        <ViewportTopBar />
        <div className="flex-1 relative">
          <CanvasView 
            width={width} 
            length={length} 
            materialProfile={materialProfile} 
            snapFit={snapFit} 
          />
        </div>
        <ViewportBottomBar />
      </div>
    </main>
  );
}
