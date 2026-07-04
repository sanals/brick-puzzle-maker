// Phase 2: Dedicated Web Worker. Runs downscale + quantization off the UI thread.
/// <reference lib="webworker" />

import { buildMatrix, exactResample, buildLegoMatrix, buildHeightmapMatrix } from "./image-processing"
import type { ProcessRequest, WorkerOutbound } from "../types"

const ctx = self as unknown as DedicatedWorkerGlobalScope

ctx.addEventListener("message", (event: MessageEvent<ProcessRequest>) => {
  const data = event.data
  if (!data || data.type !== "process") return

  try {
    const down = exactResample(data.imageData, data.width, data.height)
    
    let matrix;
    if (data.mode === 'dynamic-kmeans') {
      matrix = buildMatrix(down, data.colorCount || 4)
    } else if (data.mode === 'nearest-lego') {
      matrix = buildLegoMatrix(down)
    } else if (data.mode === 'heightmap') {
      matrix = buildHeightmapMatrix(down, data.maxHeight || 20)
    } else {
      throw new Error(`Unknown mode: ${data.mode}`);
    }

    const message: WorkerOutbound = { type: "result", matrix }
    ctx.postMessage(message)
  } catch (err) {
    const message: WorkerOutbound = {
      type: "error",
      message: err instanceof Error ? err.message : "Unknown processing error",
    }
    ctx.postMessage(message)
  }
})

export {}
