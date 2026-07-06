'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import { RotateCcw, Undo2, Redo2, Eye, EyeOff, LayoutGrid, Palette, ImageUp, RefreshCw } from 'lucide-react';
import { usePuzzleStore } from '@/store/usePuzzleStore';
import { MaterialProfile } from '@/store/usePuzzleStore';
import { exportChunkedBaseplates } from '@/lib/export/chunk-exporter';
import { calculateTolerances } from '@/lib/math/tolerances';
import { BaseplateGenerator } from '@/lib/geometry/baseplate-generator';
import { build3MF } from '@/lib/export/generic-3mf-exporter';
import { exportMosaicBatches } from '@/lib/export/mosaic-exporter';
import { ProcessingMode, ProcessRequest, ProcessResponse, WorkerOutbound } from '@/lib/types';
import { CropModal } from './CropModal';
import { CROP_RATIOS, CropRatio, BasePlateSize, ScaleMultiplier } from '@/lib/types';
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
    connectorHoleDiameter, setConnectorHoleDiameter,
    connectorHoleDepth, setConnectorHoleDepth,
    holePlacement, setHolePlacement,
    showBaseplate, setShowBaseplate,
    showBricks, setShowBricks,
    baseChunkSize, setBaseChunkSize,
    borderWidth, setBorderWidth,
    undo, redo, history, historyIndex,
    paintMode, setPaintMode,
    customBricks, setCustomBricks,
    cropRatio, setCropRatio,
    basePlateSize, setBasePlateSize,
    scaleMultiplier, setScaleMultiplier,
    resetModifications
  } = usePuzzleStore();
  
  const [activeTab, setActiveTab] = useState<'baseplate' | 'bricks'>('baseplate');
  
  const [processingMode, setProcessingMode] = useState<ProcessingMode>('nearest-lego');
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxRatioDim = Math.max(cropRatio.w, cropRatio.h);
  const maxMultiplier = Math.max(1, Math.floor(6 / maxRatioDim));

  // Ensure multiplier is within bounds
  useEffect(() => {
    if (scaleMultiplier > maxMultiplier) {
      setScaleMultiplier(maxMultiplier as ScaleMultiplier);
    }
  }, [scaleMultiplier, maxMultiplier, setScaleMultiplier]);

  // Update dimensions when parameters change
  useEffect(() => {
    const w = scaleMultiplier * basePlateSize * cropRatio.w;
    const l = scaleMultiplier * basePlateSize * cropRatio.h;
    if (width !== w) setWidth(w);
    if (length !== l) setLength(l);
    if (baseChunkSize !== basePlateSize) setBaseChunkSize(basePlateSize);
  }, [cropRatio, basePlateSize, scaleMultiplier, width, length, baseChunkSize, setWidth, setLength, setBaseChunkSize]);

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
        let optimizedBricks = customBricks;
        if (!optimizedBricks) {
          const { BrickOptimizer } = await import('@/lib/geometry/brick-optimizer');
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
        
        blob = await exportMosaicBatches(width, length, tolerances.snapFit, voxelMatrix, optimizedBricks, baseChunkSize, borderWidth, connectorHoleDiameter, connectorHoleDepth, holePlacement);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `mosaic-batched-${width}x${length}.zip`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        // Heightmap Mode
        if (width > 16 || length > 16) {
          blob = await exportChunkedBaseplates(width, length, tolerances.snapFit, voxelMatrix, 16, connectorHoleDiameter, connectorHoleDepth, holePlacement);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `topography-chunks-${width}x${length}.zip`;
          a.click();
          URL.revokeObjectURL(url);
        } else {
          // Single baseplate
          const gen = new BaseplateGenerator(
            width, length, tolerances.snapFit, 1.0, voxelMatrix,
            false, false, false, false,
            connectorHoleDiameter, connectorHoleDepth, false, holePlacement
          );
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

  const handleSelectedFile = (file: File) => {
    if (!file.type.match(/image\/(png|jpeg|jpg)/)) return;
    setFileName(file.name);
    setCropFile(file);
  };

  const handleCropComplete = (dataUrl: string, ratio: CropRatio) => {
    setCropRatio(ratio);
    setUploadedImageSrc(dataUrl);
    setCropFile(null);
  };

  const handleCropCancel = () => {
    setCropFile(null);
    setFileName(null);
  };

  // Trigger image processing whenever source or dimensions change
  useEffect(() => {
    if (!uploadedImageSrc) return;

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

      if (processingMode === 'heightmap') {
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
          setVoxelMatrix(data.matrix, true);
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
  }, [width, length, processingMode, uploadedImageSrc, setVoxelMatrix, setActivePaintColor]);

  return (
    <div className="w-80 bg-zinc-900 text-zinc-100 flex flex-col h-screen border-r border-zinc-800">
      <div className="flex border-b border-zinc-800 bg-zinc-950">
        <button
          onClick={() => setActiveTab('baseplate')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'baseplate' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          Baseplate Layout
        </button>
        <button
          onClick={() => setActiveTab('bricks')}
          className={`flex-1 py-3 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'bricks' ? 'border-blue-500 text-blue-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
        >
          Lego Bricks
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
      
      {cropFile && (
        <CropModal
          file={cropFile}
          onCancel={handleCropCancel}
          onComplete={handleCropComplete}
        />
      )}

      {activeTab === 'baseplate' && (
        <>
          {/* Design Layout */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Design Setup</h3>
            </div>
            
            <div className="flex flex-col gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleSelectedFile(file);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handleSelectedFile(file);
                }}
                className={`group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-xl border-2 border-dashed p-6 text-center transition-colors ${
                  dragging ? "border-blue-500 bg-blue-500/10" : "border-zinc-700 bg-zinc-800/40 hover:border-blue-500/60 hover:bg-zinc-800/70"
                }`}
              >
                {uploadedImageSrc ? (
                  <img
                    src={uploadedImageSrc}
                    alt={fileName ? `Preview of ${fileName}` : "Uploaded preview"}
                    className="absolute inset-0 size-full object-contain opacity-90 p-2"
                  />
                ) : (
                  <>
                    <span className="flex size-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                      <ImageUp className="size-6" />
                    </span>
                    <span className="text-sm font-medium">Drop a photo here</span>
                    <span className="text-xs text-zinc-500">PNG or JPEG</span>
                  </>
                )}
              </button>

              {fileName && (
                <div className="flex items-center justify-between gap-2 rounded-lg bg-zinc-800/60 px-3 py-2 mt-1">
                  <span className="truncate text-xs text-zinc-400" title={fileName}>
                    {fileName}
                  </span>
                  <button
                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                    onClick={() => {
                      setUploadedImageSrc(null);
                      setFileName(null);
                    }}
                  >
                    <RefreshCw size={12} /> Replace
                  </button>
                </div>
              )}
            </div>
            
            <div className="space-y-3 pt-3">
              <label className="flex items-center gap-2 text-sm font-medium">
                Physical Base Plate
              </label>
              <div className="flex bg-zinc-800 p-1 rounded-md border border-zinc-700">
                <button
                  onClick={() => setBasePlateSize(16)}
                  className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${basePlateSize === 16 ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                >
                  16x16
                </button>
                <button
                  onClick={() => setBasePlateSize(24)}
                  className={`flex-1 text-xs py-1.5 rounded-sm transition-colors ${basePlateSize === 24 ? 'bg-blue-600 text-white' : 'text-zinc-400 hover:bg-zinc-700 hover:text-white'}`}
                >
                  24x24
                </button>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <label className="flex items-center gap-2 text-sm font-medium text-zinc-400">
                Resolution (Blocks)
              </label>
              <div className="grid grid-cols-3 gap-1.5 w-full">
                {Array.from({ length: maxMultiplier }).map((_, i) => {
                  const m = (i + 1) as ScaleMultiplier;
                  const w = m * basePlateSize * cropRatio.w;
                  const h = m * basePlateSize * cropRatio.h;
                  const isSelected = m === scaleMultiplier;
                  return (
                    <button
                      key={m}
                      onClick={() => setScaleMultiplier(m)}
                      disabled={maxMultiplier === 1}
                      className={`h-9 px-2 text-xs font-medium border rounded transition-colors ${
                        isSelected 
                          ? 'bg-blue-600 border-blue-600 text-white' 
                          : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed'
                      }`}
                    >
                      {w} × {h}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* Baseplate Settings */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Baseplate Technic Settings</h3>
            
            <div className="space-y-2">
              <label className="flex justify-between text-sm items-center">
                <span>Technic Hole Placement</span>
              </label>
              <select
                value={holePlacement}
                onChange={(e) => setHolePlacement(e.target.value as 'corners' | 'dense')}
                className="w-full bg-zinc-900 border border-zinc-700 text-white rounded p-2 text-sm focus:outline-none focus:border-blue-500"
              >
                <option value="corners">Corner Anchors (2 per edge)</option>
                <option value="dense">Dense Grid (Every 4 studs)</option>
              </select>
              <p className="text-[10px] text-zinc-500 leading-tight">
                Corner Anchors place one hole 5 studs from each corner. Dense Grid places holes exactly between studs at 4-stud intervals.
              </p>
            </div>
            
            <div className="space-y-2">
              <label className="flex justify-between text-sm items-center">
                <span>Technic Hole Diameter</span>
                <span className="text-blue-400 font-mono">{connectorHoleDiameter.toFixed(1)}mm</span>
              </label>
              <input
                type="range"
                min={4.5}
                max={6.0}
                step={0.1}
                value={connectorHoleDiameter}
                onChange={(e) => setConnectorHoleDiameter(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <p className="text-[10px] text-zinc-500 leading-tight">Increase if standard pins fit too tightly. 5.1mm is default for FDM.</p>
            </div>
            
            <div className="space-y-2">
              <label className="flex justify-between text-sm items-center">
                <span>Technic Hole Depth</span>
                <span className="text-blue-400 font-mono">{connectorHoleDepth.toFixed(1)}mm</span>
              </label>
              <input
                type="range"
                min={4.0}
                max={12.0}
                step={0.5}
                value={connectorHoleDepth}
                onChange={(e) => setConnectorHoleDepth(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <p className="text-[10px] text-zinc-500 leading-tight">Depth of the hole into the baseplate block. 8.5mm fits a standard pin half.</p>
            </div>
          </div>

          <hr className="border-zinc-800" />

          {/* Setup / Process */}
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
              <label className="flex justify-between text-sm">
                <span>Border Frame Width</span>
                <span className="text-blue-400 font-mono">{borderWidth}</span>
              </label>
              <input
                type="range"
                min={0}
                max={8}
                step={1}
                value={borderWidth}
                onChange={(e) => setBorderWidth(Number(e.target.value))}
                className="w-full accent-blue-500"
              />
              <p className="text-[10px] text-zinc-500">Adds an empty frame around your mosaic design.</p>
            </div>
            
            {isProcessing && (
              <div className="text-center text-xs text-blue-400 mt-2 animate-pulse">
                Processing Image...
              </div>
            )}
          </div>
        </>
      )}

      {activeTab === 'bricks' && (
        <>
          <div className="flex items-center justify-between bg-zinc-800/50 rounded p-3 mb-2">
            <div>
              <div className="text-xs text-zinc-300 font-semibold">Baseplate: {width}x{length}</div>
            </div>
            <button 
              onClick={() => {
                if (confirm("This will discard all your manual painting, cuts, and joins, reverting to the original image generation. Are you sure?")) {
                  resetModifications();
                }
              }}
              className="text-xs bg-red-900/30 text-red-400 hover:bg-red-900/50 hover:text-red-300 px-3 py-1.5 rounded transition-colors"
            >
              Reset Edits
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
            <h3 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Accessibility & Optimization</h3>

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
              <p className="text-[10px] text-zinc-500 leading-tight">Controls the internal density of exported bricks. Lower infill saves material and prints faster, but might make large parts less rigid. 15% is standard.</p>
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
              <p className="text-[10px] text-zinc-500 leading-tight">Controls the number of outer wall perimeters. Higher shell count increases strength and prevents light bleeding through light colors, but uses more material. 2 is standard.</p>
            </div>
          </div>
        </>
      )}
      </div>

      {/* Fixed Actions Button at the bottom */}
      <div className="p-4 bg-zinc-950 border-t border-zinc-800">
        {!voxelMatrix ? (
          <button 
            onClick={() => {
              // Generate a blank canvas
              const blankMatrix = {
                width, height: length, depth: 1,
                palette: [{ hex: "#ffffff", label: "White", index: 0, count: width * length, rgb: [255, 255, 255] as [number, number, number], coverage: 1 }],
                cells: Array(width).fill(0).map(() => Array(length).fill({
                  hexColor: "#ffffff", label: "White", colorIndex: 0
                }))
              };
              setVoxelMatrix(blankMatrix);
              setActivePaintColor(blankMatrix.palette[0]);
              setActiveTab('bricks');
            }}
            disabled={isProcessing}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-700 text-white rounded p-3 text-sm font-bold tracking-wide transition-colors"
          >
            Create Blank Canvas
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
