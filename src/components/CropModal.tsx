"use client"

import { useState, useRef, useEffect } from "react"
import ReactCrop, { centerCrop, makeAspectCrop, convertToPixelCrop, type Crop, type PixelCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"
import { CROP_RATIOS, type CropRatio } from "@/lib/types"

interface CropModalProps {
  file: File | null
  onCancel: () => void
  onComplete: (dataUrl: string, ratio: CropRatio) => void
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number) {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 90,
      },
      aspect,
      mediaWidth,
      mediaHeight,
    ),
    mediaWidth,
    mediaHeight,
  )
}

export function CropModal({ file, onCancel, onComplete }: CropModalProps) {
  const [imgSrc, setImgSrc] = useState("")
  const imgRef = useRef<HTMLImageElement>(null)
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const [scale, setScale] = useState(1)
  const [selectedRatio, setSelectedRatio] = useState<CropRatio>(CROP_RATIOS[0])

  useEffect(() => {
    if (file) {
      const reader = new FileReader()
      reader.addEventListener("load", () => setImgSrc(reader.result?.toString() || ""))
      reader.readAsDataURL(file)
    }
  }, [file])

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height } = e.currentTarget
    const initialCrop = centerAspectCrop(width, height, selectedRatio.w / selectedRatio.h)
    setCrop(initialCrop)
    setCompletedCrop(convertToPixelCrop(initialCrop, width, height))
  }

  function handleRatioChange(ratio: CropRatio) {
    setSelectedRatio(ratio)
    if (imgRef.current) {
      const { width, height } = imgRef.current
      const newCrop = centerAspectCrop(width, height, ratio.w / ratio.h)
      setCrop(newCrop)
      setCompletedCrop(convertToPixelCrop(newCrop, width, height))
    }
  }

  async function handleComplete() {
    if (!completedCrop || !imgRef.current) return

    const image = imgRef.current
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height
    
    // Create a high-quality crop
    canvas.width = completedCrop.width * scaleX
    canvas.height = completedCrop.height * scaleY

    ctx.imageSmoothingQuality = "high"

    const cropX = completedCrop.x * scaleX
    const cropY = completedCrop.y * scaleY
    const cropWidth = completedCrop.width * scaleX
    const cropHeight = completedCrop.height * scaleY

    // Apply scale (zoom) from center
    const centerX = image.naturalWidth / 2
    const centerY = image.naturalHeight / 2
    
    ctx.save()
    // Translate to center of crop
    ctx.translate(canvas.width / 2, canvas.height / 2)
    // Scale
    ctx.scale(scale, scale)
    // Translate back to draw image correctly relative to crop window
    ctx.translate(-canvas.width / 2, -canvas.height / 2)
    
    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      canvas.width,
      canvas.height
    )
    
    ctx.restore()

    const base64Image = canvas.toDataURL("image/jpeg")
    onComplete(base64Image, selectedRatio)
  }

  if (!file) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-zinc-900 text-zinc-200 w-full max-w-4xl rounded-xl border border-zinc-700 shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-zinc-800 flex justify-between items-center shrink-0">
          <h2 className="text-xl font-semibold text-zinc-100">Crop Image</h2>
          <button onClick={onCancel} className="text-zinc-400 hover:text-white px-3 py-1 rounded transition-colors hover:bg-zinc-800">
            Cancel
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 flex flex-col items-center bg-zinc-950/50 min-h-0">
          <ReactCrop
            crop={crop}
            onChange={(_, percentCrop) => setCrop(percentCrop)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={selectedRatio.w / selectedRatio.h}
            className="max-h-[50vh]"
          >
            <img
              ref={imgRef}
              alt="Crop me"
              src={imgSrc || undefined}
              style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
              onLoad={onImageLoad}
              className="max-w-full max-h-[50vh] object-contain"
            />
          </ReactCrop>
        </div>

        <div className="p-6 border-t border-zinc-800 space-y-6 shrink-0 bg-zinc-900">
          <div className="space-y-3">
            <label className="text-zinc-400 text-sm font-medium">Aspect Ratio</label>
            <div className="flex flex-wrap gap-2">
              {CROP_RATIOS.map((ratio) => (
                <button
                  key={ratio.id}
                  onClick={() => handleRatioChange(ratio)}
                  className={`px-3 py-1 text-sm rounded border transition-colors ${
                    selectedRatio.id === ratio.id 
                      ? "bg-blue-600 border-blue-600 text-white" 
                      : "border-zinc-700 hover:bg-zinc-800"
                  }`}
                >
                  {ratio.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex justify-between">
              <label className="text-zinc-400 text-sm font-medium">Zoom inside crop</label>
              <span className="text-sm text-zinc-500">{scale.toFixed(1)}x</span>
            </div>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
              className="w-full accent-blue-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button onClick={handleComplete} className="bg-blue-600 hover:bg-blue-500 text-white px-8 py-2 rounded font-medium transition-colors">
              Confirm & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
