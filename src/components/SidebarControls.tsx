'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { RotateCcw, Undo2, Redo2 } from 'lucide-react';
import { usePuzzleStore, MaterialProfile } from '@/store/usePuzzleStore';
import { ProcessingMode, ProcessRequest, ProcessResponse, WorkerOutbound } from '@/lib/types';
import { exportChunkedBaseplates } from '@/lib/export/chunk-exporter';
import { exportMosaicBatches } from '@/lib/export/mosaic-exporter';
import { build3MF } from '@/lib/export/generic-3mf-exporter';
import { BaseplateGenerator } from '@/lib/geometry/baseplate-generator';
import { calculateTolerances } from '@/lib/math/tolerances';
import { BrickOptimizer } from '@/lib/geometry/brick-optimizer';

export function SidebarControls() {
  const { 
    width, setWidth,
    length, setLength,
    snapFit, setSnapFit,
    infillPercentage, setInfillPercentage, 
    shellCount, setShellCount, 
    materialProfile, setMaterialProfile,
    voxelMatrix, setVoxelMatrix,
    activePaintColor, setActivePaintColor,
    deuteranopiaSimulation, setDeuteranopiaSimulation,
    explodedView, setExplodedView,
    optimizePieces, setOptimizePieces,
    allowNonStandardSizes, setAllowNonStandardSizes,
    showBaseplate, setShowBaseplate,
    showBricks, setShowBricks,
    undo, redo, history, historyIndex,
    paintMode, setPaintMode,
    customBricks, setCustomBricks,
    setupStep, setSetupStep, resetToSetup
  } = usePuzzleStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('nearest-lego');
  const [imageFitMode, setImageFitMode] = useState<'stretch' | 'fit'>('stretch');
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);

  // Handle Keyboard Shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // Compute BOM
  const pieceCountList = useMemo(() => {
    if (!voxelMatrix || processingMode === 'heightmap') return null;
    
    if (!optimizePieces) {
      // Sort by count descending
      return [...voxelMatrix.palette].map(c => ({
        label: c.label,
        hex: c.hex,
        count: c.count
      })).sort((a, b) => b.count - a.count);
    } else {
      // Run the optimizer to get accurate piece counts
      const optimizer = new BrickOptimizer(voxelMatrix, width, length);
      const optimizedBricks = optimizer.optimize({
        allowNonStandardSizes: allowNonStandardSizes
      });
      
      const counts = new Map<string, { label: string, hex: string, count: number }>();
      
      for (const brick of optimizedBricks) {
        // Find palette label
        const pal = voxelMatrix.palette.find(p => p.hex === brick.hexColor);
        const labelName = pal ? pal.label : 'Unknown';
        const key = `${brick.width}x${brick.length}-${brick.hexColor}`;
        
        if (!counts.has(key)) {
          counts.set(key, {
            label: `${brick.width}x${brick.length} ${labelName}`,
            hex: brick.hexColor,
            count: 0
          });
        }
        counts.get(key)!.count++;
      }
      
      return Array.from(counts.values()).sort((a, b) => b.count - a.count);
    }
  }, [voxelMatrix, processingMode, optimizePieces, allowNonStandardSizes, width, length]);

  const handleExport = async () => {
    try {
      setIsProcessing(true);
      const tolerances = calculateTolerances(materialProfile, snapFit);
      
      let blob;
      
      const isHeightmap = voxelMatrix?.cells[0]?.[0]?.height !== undefined;

      if (!isHeightmap && voxelMatrix) {
        // Mosaic Mode: Export ZIP with separated color files
        blob = await exportMosaicBatches(width, length, tolerances.snapFit, voxelMatrix);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mosaic-batched-${width}x${length}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Heightmap Mode
        if (width > 16 || length > 16) {
          blob = await exportChunkedBaseplates(width, length, tolerances.snapFit, voxelMatrix, 16);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `topography-chunks-${width}x${length}.zip`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // Single baseplate
          const gen = new BaseplateGenerator(width, length, tolerances.snapFit, 1/3, voxelMatrix);
          const geo = gen.generateGeometry();
          blob = await build3MF(geo);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `topography-${width}x${length}.3mf`;
          a.click();
          URL.revokeObjectURL(url);
        }
      }
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to export. Check console.");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      setUploadedImageSrc(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Trigger image processing whenever source or dimensions change
  useEffect(() => {
    if (!uploadedImageSrc || setupStep !== 1) return;

    setIsProcessing(true);
    const img = new Image();
    img.onload = () => {
      // Create an offscreen canvas to extract ImageData
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = length;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      // Fill background with white
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, length);

      if (imageFitMode === 'fit') {
        const scale = Math.min(width / img.width, length / img.height);
        const x = (width - img.width * scale) / 2;
        const y = (length - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);
      } else {
        ctx.drawImage(img, 0, 0, width, length);
      }
      
      const imageData = ctx.getImageData(0, 0, width, length);

      // Spin up the Web Worker
      const worker = new Worker(new URL('@/lib/image/image.worker.ts', import.meta.url));
      
      worker.onmessage = (msg: MessageEvent<WorkerOutbound>) => {
        setIsProcessing(false);
        const data = msg.data;
        if (data.type === 'result') {
          setVoxelMatrix(data.matrix);
          // Default select the first color to paint with
          if (data.matrix.palette.length > 0) {
            setActivePaintColor(data.matrix.palette[0]);
          }
        } else {
          console.error('Worker error:', data.message);
        }
        worker.terminate();
      };

      const request: ProcessRequest = {
        type: 'process',
        mode: processingMode,
        imageData,
        width,
        height: length,
        colorCount: 8, // For dynamic-kmeans
        maxHeight: 20  // For heightmap
      };
      
      worker.postMessage(request);
    };
    img.src = uploadedImageSrc;
  }, [width, length, processingMode, imageFitMode, uploadedImageSrc, setupStep, setVoxelMatrix, setActivePaintColor]);

  return (
    <div className="w-80 bg-zinc-900 text-zinc-100 flex flex-col h-screen border-r border-zinc-800">
      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
        <h2 className="text-xl font-bold text-white tracking-tight">Brick Generator</h2>
      
      {setupStep === 1 && (
        <>
          {/* Dimensions */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Dimensions</h3>
              <button 
                onClick={() => { setWidth(16); setLength(16); }}
                className="p-1 text-zinc-500 hover:text-white transition-colors"
                title="Reset Dimensions"
              >
                <RotateCcw size={14} />
              </button>
            </div>
            
            <div className="space-y-2">
              <label className="flex justify-between text-sm">
                <span>Width (studs)</span>
                <span className="text-blue-400 font-mono">{width}</span>
              </label>
              <input
                type="range"
                min={1}
                max={96}
                value={width}
                onChange={(e) => setWidth(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="flex justify-between text-sm">
                <span>Length (studs)</span>
                <span className="text-blue-400 font-mono">{length}</span>
              </label>
              <input
                type="range"
                min={1}
                max={96}
                value={length}
                onChange={(e) => setLength(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* Image & Paint Setup */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Generate Puzzle</h3>
            </div>
            
            <div className="space-y-2">
              <label className="flex justify-between text-sm text-zinc-300">
                <span>Process Mode</span>
              </label>
              <select
                value={processingMode}
                onChange={(e) => setProcessingMode(e.target.value as ProcessingMode)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="nearest-lego">Nearest LEGO Color</option>
                <option value="dynamic-kmeans">Dynamic K-Means</option>
                <option value="heightmap">Topographic Heightmap</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex justify-between text-sm text-zinc-300">
                <span>Image Fit Mode</span>
              </label>
              <select
                value={imageFitMode}
                onChange={(e) => setImageFitMode(e.target.value as 'stretch' | 'fit')}
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="stretch">Stretch to fill board</option>
                <option value="fit">Fit keeping aspect ratio</option>
              </select>
            </div>

            <div className="space-y-2 pt-2">
              <input 
                type="file" 
                accept="image/*" 
                ref={fileInputRef} 
                className="hidden" 
                onChange={handleImageUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="w-full bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 text-white rounded p-3 text-sm font-medium transition-colors"
              >
                {isProcessing ? 'Processing Image...' : (uploadedImageSrc ? 'Upload Different Image' : 'Upload Image')}
              </button>
            </div>
          </div>
        </>
      )}

      {setupStep === 2 && (
        <>
          <div className="flex items-center justify-between bg-blue-900/20 border border-blue-900 rounded p-3 mb-2">
            <div>
              <div className="text-xs text-blue-400 font-semibold uppercase">Edit Mode Active</div>
              <div className="text-xs text-zinc-400 mt-0.5">{width}x{length} baseplate</div>
            </div>
            <button 
              onClick={() => {
                if (confirm("Going back to Setup will reset all your colors and manual edits. Are you sure you want to discard your puzzle?")) {
                  resetToSetup();
                }
              }}
              className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded transition-colors"
            >
              Reset
            </button>
          </div>

          <hr className="border-zinc-800" />

          {/* Palette and Editing Tools */}
          {voxelMatrix && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-zinc-400">Palette</span>
                  <div className="flex gap-2">
                    <button 
                      onClick={undo}
                      disabled={historyIndex <= 0}
                      className="p-1 text-zinc-500 hover:text-white disabled:text-zinc-700 disabled:hover:text-zinc-700 transition-colors"
                      title="Undo (Ctrl+Z)"
                    >
                      <Undo2 size={16} />
                    </button>
                    <button 
                      onClick={redo}
                      disabled={historyIndex >= history.length - 1}
                      className="p-1 text-zinc-500 hover:text-white disabled:text-zinc-700 disabled:hover:text-zinc-700 transition-colors"
                      title="Redo (Ctrl+Y)"
                    >
                      <Redo2 size={16} />
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {voxelMatrix.palette.map((color) => (
                    <button
                      key={color.index}
                      onClick={() => setActivePaintColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-transform ${
                        activePaintColor?.index === color.index ? 'border-white scale-110' : 'border-transparent'
                      }`}
                      style={{ backgroundColor: color.hex }}
                      title={color.label}
                    />
                  ))}
                </div>
                <p className="text-xs text-zinc-500 mt-2">
                  Tip: Select a color and drag on the baseplate to paint.
                </p>
              </div>
              
              <div className="space-y-2">
                <span className="text-sm font-medium text-zinc-400">Paint & Edit Mode</span>
                <div className="flex bg-zinc-800 rounded p-1">
                  <button
                    onClick={() => {
                      if (customBricks) {
                        if (!confirm("Switching to Paint Mode will discard your custom cuts and joins. Continue?")) return;
                      }
                      setCustomBricks(null);
                      setPaintMode('stud');
                    }}
                    className={`flex-1 text-xs py-1.5 rounded transition-colors ${paintMode === 'stud' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                  >
                    Single Stud
                  </button>
                  <button
                    onClick={() => {
                      if (customBricks) {
                        if (!confirm("Switching to Paint Mode will discard your custom cuts and joins. Continue?")) return;
                      }
                      setCustomBricks(null);
                      setPaintMode('brick');
                    }}
                    className={`flex-1 text-xs py-1.5 rounded transition-colors ${paintMode === 'brick' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                    title={!optimizePieces ? 'Enable Greedy Meshing first' : ''}
                    disabled={!optimizePieces}
                  >
                    Whole Brick
                  </button>
                  <button
                    onClick={() => {
                      if (paintMode !== 'edit' && voxelMatrix) {
                        // Freeze the layout
                        const optimizer = new BrickOptimizer(voxelMatrix, width, length);
                        const optimizedBricks = optimizer.optimize({
                          allowNonStandardSizes: allowNonStandardSizes
                        });
                        setCustomBricks(optimizedBricks);
                      }
                      setPaintMode('edit');
                    }}
                    className={`flex-1 text-xs py-1.5 rounded transition-colors ${paintMode === 'edit' ? 'bg-blue-600 text-white font-semibold' : 'text-zinc-400 hover:text-zinc-200'}`}
                    title={!optimizePieces ? 'Enable Greedy Meshing first' : 'Click/Drag to Cut/Join pieces'}
                    disabled={!optimizePieces}
                  >
                    Edit Pieces
                  </button>
                </div>
                {paintMode === 'edit' && (
                  <p className="text-xs text-orange-400 font-medium">
                    Click a piece to cut it. Drag across pieces to join them into a rectangle.
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Bill of Materials (BOM) */}
          {pieceCountList && pieceCountList.length > 0 && (
            <div className="space-y-2 mt-6">
              <span className="text-sm font-medium text-zinc-400">Piece Count (BOM)</span>
              <div className="max-h-48 overflow-y-auto pr-2 space-y-1 text-xs">
                {pieceCountList.map(c => (
                  <div key={`${c.label}-${c.hex}`} className="flex items-center justify-between bg-zinc-800 p-1.5 rounded">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full border border-zinc-600" style={{ backgroundColor: c.hex }} />
                      <span className="truncate w-32" title={c.label}>{c.label}</span>
                    </div>
                    <span className="font-mono text-zinc-400">{c.count}x</span>
                  </div>
                ))}
              </div>
              <div className="text-right text-xs text-zinc-500 mt-1 font-mono">
                Total: {pieceCountList.reduce((acc, c) => acc + c.count, 0)} pieces
              </div>
            </div>
          )}

          {/* Accessibility & View Modes */}
          <div className="space-y-2 mt-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">View Modes</h3>
            
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input 
                type="checkbox" 
                checked={explodedView} 
                onChange={(e) => setExplodedView(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-600"
              />
              Exploded View
            </label>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input 
                type="checkbox" 
                checked={deuteranopiaSimulation} 
                onChange={(e) => setDeuteranopiaSimulation(e.target.checked)}
                className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-600"
              />
              Simulate Colorblindness
            </label>

            <div className="pt-2">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Visibility</h3>
              
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input 
                  type="checkbox" 
                  checked={showBaseplate} 
                  onChange={(e) => setShowBaseplate(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-600"
                />
                Show Baseplate
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-300 mt-2">
                <input 
                  type="checkbox" 
                  checked={showBricks} 
                  onChange={(e) => setShowBricks(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-600"
                />
                Show Mosaic Bricks
              </label>
            </div>

            <div className="pt-2">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-2">Mosaic Optimization</h3>
              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input 
                  type="checkbox" 
                  checked={optimizePieces} 
                  onChange={(e) => setOptimizePieces(e.target.checked)}
                  className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-600"
                />
                Greedy Meshing (Reduce piece count)
              </label>
              {optimizePieces && (
                <label className="flex items-center gap-2 text-sm text-zinc-300 mt-2 ml-6">
                  <input 
                    type="checkbox" 
                    checked={allowNonStandardSizes} 
                    onChange={(e) => setAllowNonStandardSizes(e.target.checked)}
                    className="rounded bg-zinc-800 border-zinc-700 text-blue-600 focus:ring-blue-600"
                  />
                  Allow non-standard sizes (e.g. 3x7)
                </label>
              )}
            </div>
          </div>

          <hr className="border-zinc-800 mt-6 mb-4" />

          {/* Printer Tolerances (Moved to Step 2) */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Printer Tolerances</h3>
            
            <div className="space-y-2">
              <label className="flex justify-between text-sm">
                <span>Material Profile</span>
              </label>
              <select
                value={materialProfile}
                onChange={(e) => setMaterialProfile(e.target.value as MaterialProfile)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded p-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="PLA Rigid">PLA Rigid</option>
                <option value="PETG">PETG</option>
                <option value="TPU Flexible">TPU Flexible</option>
                <option value="Translucent">Translucent</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="flex justify-between text-sm items-center">
                <span>SnapFit Calibration</span>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 font-mono">{snapFit.toFixed(2)}mm</span>
                  <button 
                    onClick={() => setSnapFit(0.0)}
                    className="text-zinc-500 hover:text-white transition-colors"
                    title="Reset SnapFit"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </label>
              <input
                type="range"
                min={-0.2}
                max={0.2}
                step={0.01}
                value={snapFit}
                onChange={(e) => setSnapFit(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>

          <hr className="border-zinc-800 mt-6 mb-4" />

          {/* Export Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Export Settings</h3>
            
            <div className="space-y-2">
              <label className="flex justify-between text-sm items-center">
                <span>Infill Percentage</span>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 font-mono">{infillPercentage}%</span>
                </div>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={infillPercentage}
                onChange={(e) => setInfillPercentage(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-2">
              <label className="flex justify-between text-sm items-center">
                <span>Shell Count</span>
                <div className="flex items-center gap-2">
                  <span className="text-blue-400 font-mono">{shellCount}</span>
                  <button 
                    onClick={() => setShellCount(2)}
                    className="text-zinc-500 hover:text-white transition-colors"
                    title="Reset Shells"
                  >
                    <RotateCcw size={12} />
                  </button>
                </div>
              </label>
              <input
                type="range"
                min={1}
                max={10}
                value={shellCount}
                onChange={(e) => setShellCount(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
            </div>
          </div>
        </>
      )}
      </div>

      {/* Fixed Actions Button at the bottom */}
      <div className="p-4 bg-zinc-950 border-t border-zinc-800">
        {setupStep === 1 ? (
          <button 
            onClick={() => {
              if (!voxelMatrix) {
                // Generate a blank canvas
                const blankMatrix = {
                  width, height: length, depth: 1,
                  palette: [{ hex: "#ffffff", label: "White", index: 0, count: width * length }],
                  cells: Array(width).fill(0).map(() => Array(length).fill({
                    hexColor: "#ffffff", label: "White", colorIndex: 0
                  }))
                };
                setVoxelMatrix(blankMatrix);
                setActivePaintColor(blankMatrix.palette[0]);
              }
              setSetupStep(2);
            }}
            disabled={isProcessing}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white rounded p-3 text-sm font-bold tracking-wide transition-colors"
          >
            {voxelMatrix ? 'Next: Edit Puzzle' : 'Create Blank Canvas'}
          </button>
        ) : (
          <button 
            onClick={handleExport}
            disabled={isProcessing}
            className="w-full bg-green-600 hover:bg-green-500 disabled:bg-zinc-700 text-white rounded p-3 text-sm font-bold tracking-wide transition-colors"
          >
            {isProcessing ? 'Exporting...' : 'Export 3MF'}
          </button>
        )}
      </div>
    </div>
  );
}
