import React, { useEffect, useRef, useState } from 'react';
import { usePuzzleStore } from '@/store/usePuzzleStore';
import { Download, Maximize, ZoomIn } from 'lucide-react';

export function PixelMapView() {
  const { width, length, voxelMatrix } = usePuzzleStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fitToView, setFitToView] = useState(true);

  useEffect(() => {
    if (!canvasRef.current || !voxelMatrix) return;
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Fixed square size
    const SQUARE_SIZE = 24;
    const canvasWidth = width * SQUARE_SIZE;
    const canvasHeight = length * SQUARE_SIZE;
    
    // Resize canvas for sharp rendering
    canvasRef.current.width = canvasWidth;
    canvasRef.current.height = canvasHeight;

    // Draw grid
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    for (let x = 0; x < width; x++) {
      for (let z = 0; z < length; z++) {
        const cell = voxelMatrix.cells[x]?.[z];
        const color = cell?.hexColor || '#1f1f22'; // default background if empty
        
        // Base plate
        ctx.fillStyle = color;
        ctx.fillRect(x * SQUARE_SIZE, z * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
        
        // Grid lines
        ctx.strokeStyle = '#00000030';
        ctx.lineWidth = 1;
        ctx.strokeRect(x * SQUARE_SIZE, z * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);

        if (cell?.hexColor) {
          // Draw Lego Stud
          const cx = x * SQUARE_SIZE + SQUARE_SIZE / 2;
          const cy = z * SQUARE_SIZE + SQUARE_SIZE / 2;
          const radius = SQUARE_SIZE * 0.32;

          // Stud shadow / edge
          ctx.beginPath();
          ctx.arc(cx, cy + 1.5, radius, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.3)';
          ctx.fill();

          // Stud top
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();

          // Stud highlight
          ctx.beginPath();
          ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.3)';
          ctx.fill();
        }
      }
    }
  }, [width, length, voxelMatrix]);

  const downloadMap = () => {
    if (!canvasRef.current) return;
    const dataUrl = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `brick-map-${width}x${length}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="absolute inset-0 flex flex-col bg-[#09090b] text-zinc-200 overflow-hidden">
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button
          onClick={() => setFitToView(!fitToView)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-300 transition-colors shadow-lg"
        >
          {fitToView ? <ZoomIn size={14} /> : <Maximize size={14} />}
          {fitToView ? 'View Full Size' : 'Fit to Screen'}
        </button>
      </div>

      <div className={`w-full h-full p-8 bg-black/40 ${!fitToView ? 'overflow-auto' : 'overflow-hidden flex items-center justify-center'}`}>
        <div className={!fitToView ? 'inline-block' : 'w-full h-full flex items-center justify-center'}>
          <canvas 
            ref={canvasRef} 
            className="shadow-2xl rounded"
            style={fitToView ? { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' } : {}}
          />
        </div>
      </div>
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={downloadMap}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-lg"
        >
          <Download size={14} />
          Download Map
        </button>
      </div>
    </div>
  );
}
