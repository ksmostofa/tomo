"use client"

export type PersonalObjectResult = {
  label: "glasses" | "keys"
  score: number
  box: { xmin: number; ymin: number; xmax: number; ymax: number }
}

type PipelineResult = Array<{
  label?: string
  score?: number
  box?: { xmin?: number; ymin?: number; xmax?: number; ymax?: number }
}>

type Detector = (
  image: string,
  labels: string[],
  options: { top_k: number; threshold: number },
) => Promise<PipelineResult>

let detectorPromise: Promise<Detector> | null = null

async function loadDetector() {
  if (!detectorPromise) {
    detectorPromise = import("@huggingface/transformers").then(async ({ env, pipeline }) => {
      env.allowLocalModels = false
      env.useBrowserCache = true
      if ("gpu" in navigator) {
        try {
          const accelerated = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", { device: "webgpu", dtype: "fp32" })
          return accelerated as unknown as Detector
        } catch (error) {
          console.warn("Accelerated personal-object detection is unavailable; using the compatible local runtime", error)
        }
      }
      const compatible = await pipeline("zero-shot-object-detection", "Xenova/owlvit-base-patch32", { device: "wasm", dtype: "q8" })
      return compatible as unknown as Detector
    }).catch((error) => {
      detectorPromise = null
      throw error
    })
  }
  return detectorPromise
}

export async function detectPersonalObjects(imageDataUrl: string): Promise<PersonalObjectResult[]> {
  const detector = await loadDetector()
  const raw = await detector(
    imageDataUrl,
    ["eyeglasses", "reading glasses", "sunglasses", "house keys", "key ring"],
    { top_k: 5, threshold: 0.08 },
  )

  return raw.flatMap((result) => {
    if (!result.box || typeof result.score !== "number" || !result.label) return []
    const { xmin, ymin, xmax, ymax } = result.box
    if (![xmin, ymin, xmax, ymax].every((value) => typeof value === "number")) return []
    const normalizedLabel = /key/i.test(result.label) ? "keys" : "glasses"
    return [{
      label: normalizedLabel,
      score: result.score,
      box: { xmin: xmin!, ymin: ymin!, xmax: xmax!, ymax: ymax! },
    }]
  })
}
