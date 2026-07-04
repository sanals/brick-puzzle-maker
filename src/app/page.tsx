'use client';

import { SidebarControls } from '@/components/SidebarControls';
import { CanvasView } from '@/components/CanvasView';
import { usePuzzleStore } from '@/store/usePuzzleStore';

export default function Home() {
  const { width, length, snapFit, materialProfile } = usePuzzleStore();

  return (
    <main className="flex h-screen w-full bg-zinc-950 overflow-hidden">
      <SidebarControls />
      <CanvasView 
        width={width} 
        length={length} 
        materialProfile={materialProfile} 
        snapFit={snapFit} 
      />
    </main>
  );
}
