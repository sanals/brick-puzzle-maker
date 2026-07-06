'use client';
import { SidebarControls } from '@/components/SidebarControls';
import { CanvasView } from '@/components/CanvasView';
import { PixelMapView } from '@/components/PixelMapView';
import { ViewportTopBar } from '@/components/ViewportTopBar';
import { ViewportBottomBar } from '@/components/ViewportBottomBar';
import { usePuzzleStore } from '@/store/usePuzzleStore';

export default function Home() {
  const { width, length, snapFit, materialProfile, viewMode } = usePuzzleStore();

  return (
    <main className="flex h-screen w-full bg-zinc-950 overflow-hidden">
      <SidebarControls />
      <div className="flex-1 flex flex-col relative bg-[#09090b] min-w-0 min-h-0">
        <ViewportTopBar />
        <div className="flex-1 relative min-h-0 min-w-0">
          {viewMode === '3d' ? (
            <CanvasView 
              width={width} 
              length={length} 
              materialProfile={materialProfile} 
              snapFit={snapFit} 
            />
          ) : (
            <PixelMapView />
          )}
        </div>
        <ViewportBottomBar />
      </div>
    </main>
  );
}
