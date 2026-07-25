"use client"

import * as React from "react"
import type { InferenceSession } from "onnxruntime-web"
import { Camera, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export type ObjectDetection = {
  id: string
  label: string
  score: number
  box: { x: number; y: number; width: number; height: number }
}

type CameraState = "starting" | "loading-model" | "live" | "blocked" | "unsupported" | "error"
type Runtime = "WebGPU" | "WebAssembly" | null
type OrtModule = typeof import("onnxruntime-web")

type LiveCameraContextValue = {
  detections: ObjectDetection[]
  inferenceMs: number
  state: CameraState
  runtime: Runtime
  error: string | null
  stream: MediaStream | null
  retry: () => Promise<void>
}

const LiveCameraContext = React.createContext<LiveCameraContextValue | null>(null)

const MODEL_SIZE = 640
const TARGET_INFERENCE_INTERVAL_MS = 220
const MODEL_PATH = "/yolo26n.onnx"
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/"

const COCO_LABELS = [
  "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train", "truck", "boat", "traffic light",
  "fire hydrant", "stop sign", "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep", "cow",
  "elephant", "bear", "zebra", "giraffe", "backpack", "umbrella", "handbag", "tie", "suitcase", "frisbee",
  "skis", "snowboard", "sports ball", "kite", "baseball bat", "baseball glove", "skateboard", "surfboard", "tennis racket", "bottle",
  "wine glass", "cup", "fork", "knife", "spoon", "bowl", "banana", "apple", "sandwich", "orange",
  "broccoli", "carrot", "hot dog", "pizza", "donut", "cake", "chair", "couch", "potted plant", "bed",
  "dining table", "toilet", "tv", "laptop", "mouse", "remote", "keyboard", "cell phone", "microwave", "oven",
  "toaster", "sink", "refrigerator", "book", "clock", "vase", "scissors", "teddy bear", "hair drier", "toothbrush",
] as const

function readableCameraError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "Camera access is blocked. Allow camera access in the browser, then try again."
    if (error.name === "NotFoundError") return "No camera was found on this device."
    if (error.name === "NotReadableError") return "The camera is already in use by another application."
  }
  if (error instanceof Error && /onnx|wasm|webgpu|model|session/i.test(error.message)) {
    return "The local YOLO model could not start. Check the connection once so TOMO can load its detector."
  }
  return "TOMO could not start the camera. Check the device camera and try again."
}

async function createYoloSession(): Promise<{ ort: OrtModule; session: InferenceSession; runtime: Exclude<Runtime, null> }> {
  if ("gpu" in navigator) {
    try {
      const ort = await import("onnxruntime-web/webgpu")
      ort.env.wasm.wasmPaths = ORT_WASM_PATH
      ort.env.webgpu.powerPreference = "low-power"
      const session = await ort.InferenceSession.create(MODEL_PATH, {
        executionProviders: ["webgpu"],
        graphOptimizationLevel: "all",
      })
      return { ort, session, runtime: "WebGPU" }
    } catch (webGpuError) {
      console.warn("WebGPU YOLO startup failed; using WebAssembly", webGpuError)
    }
  }

  const ort = await import("onnxruntime-web/wasm")
  ort.env.wasm.wasmPaths = ORT_WASM_PATH
  ort.env.wasm.numThreads = 1
  ort.env.wasm.proxy = true
  const session = await ort.InferenceSession.create(MODEL_PATH, {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
  })
  return { ort, session, runtime: "WebAssembly" }
}

function prepareFrame(video: HTMLVideoElement, canvas: HTMLCanvasElement, ort: OrtModule) {
  const sourceWidth = video.videoWidth
  const sourceHeight = video.videoHeight
  const scale = Math.min(MODEL_SIZE / sourceWidth, MODEL_SIZE / sourceHeight)
  const drawWidth = Math.round(sourceWidth * scale)
  const drawHeight = Math.round(sourceHeight * scale)
  const offsetX = Math.floor((MODEL_SIZE - drawWidth) / 2)
  const offsetY = Math.floor((MODEL_SIZE - drawHeight) / 2)
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) throw new Error("Canvas is unavailable")

  context.fillStyle = "rgb(114,114,114)"
  context.fillRect(0, 0, MODEL_SIZE, MODEL_SIZE)
  context.drawImage(video, offsetX, offsetY, drawWidth, drawHeight)
  const pixels = context.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE).data
  const planeSize = MODEL_SIZE * MODEL_SIZE
  const input = new Float32Array(planeSize * 3)

  for (let pixel = 0; pixel < planeSize; pixel += 1) {
    const rgba = pixel * 4
    input[pixel] = pixels[rgba] / 255
    input[planeSize + pixel] = pixels[rgba + 1] / 255
    input[planeSize * 2 + pixel] = pixels[rgba + 2] / 255
  }

  return {
    tensor: new ort.Tensor("float32", input, [1, 3, MODEL_SIZE, MODEL_SIZE]),
    sourceWidth,
    sourceHeight,
    scale,
    offsetX,
    offsetY,
  }
}

function parseYoloOutput(
  values: Float32Array,
  frame: ReturnType<typeof prepareFrame>,
): ObjectDetection[] {
  const detections: ObjectDetection[] = []
  const rows = Math.floor(values.length / 6)

  for (let index = 0; index < rows; index += 1) {
    const start = index * 6
    const score = values[start + 4]
    if (!Number.isFinite(score) || score < 0.4) continue

    const classId = Math.round(values[start + 5])
    const x1 = Math.max(0, Math.min(frame.sourceWidth, (values[start] - frame.offsetX) / frame.scale))
    const y1 = Math.max(0, Math.min(frame.sourceHeight, (values[start + 1] - frame.offsetY) / frame.scale))
    const x2 = Math.max(0, Math.min(frame.sourceWidth, (values[start + 2] - frame.offsetX) / frame.scale))
    const y2 = Math.max(0, Math.min(frame.sourceHeight, (values[start + 3] - frame.offsetY) / frame.scale))
    if (x2 <= x1 || y2 <= y1) continue

    detections.push({
      id: `${classId}-${index}`,
      label: COCO_LABELS[classId] ?? `object ${classId}`,
      score,
      box: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    })
  }

  return detections
}

export function LiveCameraProvider({ children }: { children: React.ReactNode }) {
  const [stream, setStream] = React.useState<MediaStream | null>(null)
  const [detections, setDetections] = React.useState<ObjectDetection[]>([])
  const [state, setState] = React.useState<CameraState>("starting")
  const [runtime, setRuntime] = React.useState<Runtime>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [inferenceMs, setInferenceMs] = React.useState(0)
  const sessionRef = React.useRef<InferenceSession | null>(null)
  const ortRef = React.useRef<OrtModule | null>(null)
  const runtimeRef = React.useRef<Exclude<Runtime, null> | null>(null)
  const sourceVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const loopTimerRef = React.useRef<number | null>(null)
  const runningRef = React.useRef(false)
  const streamRef = React.useRef<MediaStream | null>(null)

  const stopLoop = React.useCallback(() => {
    runningRef.current = false
    if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current)
    loopTimerRef.current = null
  }, [])

  const startInference = React.useCallback((video: HTMLVideoElement, session: InferenceSession, ort: OrtModule) => {
    stopLoop()
    runningRef.current = true
    const canvas = document.createElement("canvas")
    canvas.width = MODEL_SIZE
    canvas.height = MODEL_SIZE
    canvasRef.current = canvas

    const detect = async () => {
      if (!runningRef.current) return
      const startedAt = performance.now()

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        try {
          const frame = prepareFrame(video, canvas, ort)
          const results = await session.run({ images: frame.tensor })
          const output = results[session.outputNames[0]]
          setDetections(parseYoloOutput(output.data as Float32Array, frame))
          setInferenceMs(Math.round(performance.now() - startedAt))
          setState("live")
          setError(null)
        } catch (inferenceError) {
          console.error("YOLO object detection failed", inferenceError)
          setState("error")
          setError("Live analysis paused unexpectedly. Try restarting the camera.")
        }
      }

      const spent = performance.now() - startedAt
      loopTimerRef.current = window.setTimeout(() => void detect(), Math.max(16, TARGET_INFERENCE_INTERVAL_MS - spent))
    }

    void detect()
  }, [stopLoop])

  const start = React.useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setState("unsupported")
      setError("This browser does not support live camera access.")
      return
    }

    stopLoop()
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    setStream(null)
    setDetections([])
    setInferenceMs(0)
    setError(null)
    setState("starting")

    try {
      const cameraPromise = navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      })
      const detectorPromise = sessionRef.current && ortRef.current
        ? Promise.resolve({ ort: ortRef.current, session: sessionRef.current, runtime: runtimeRef.current ?? "WebAssembly" as const })
        : createYoloSession()

      setState("loading-model")
      const [cameraStream, detector] = await Promise.all([cameraPromise, detectorPromise])
      sessionRef.current = detector.session
      ortRef.current = detector.ort
      runtimeRef.current = detector.runtime
      setRuntime(detector.runtime)
      streamRef.current = cameraStream
      setStream(cameraStream)

      const sourceVideo = document.createElement("video")
      sourceVideo.muted = true
      sourceVideo.playsInline = true
      sourceVideo.autoplay = true
      sourceVideo.srcObject = cameraStream
      sourceVideoRef.current = sourceVideo
      await sourceVideo.play()
      startInference(sourceVideo, detector.session, detector.ort)
    } catch (cameraError) {
      console.error("Camera or YOLO startup failed", cameraError)
      const message = readableCameraError(cameraError)
      setState(cameraError instanceof DOMException && cameraError.name === "NotAllowedError" ? "blocked" : "error")
      setError(message)
    }
  }, [startInference, stopLoop])

  React.useEffect(() => {
    const startupTimer = window.setTimeout(() => void start(), 0)
    return () => {
      window.clearTimeout(startupTimer)
      stopLoop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      sourceVideoRef.current = null
      canvasRef.current = null
      void sessionRef.current?.release()
      sessionRef.current = null
      ortRef.current = null
      runtimeRef.current = null
    }
  }, [start, stopLoop])

  const value = React.useMemo<LiveCameraContextValue>(() => ({ detections, inferenceMs, state, runtime, error, stream, retry: start }), [detections, error, inferenceMs, runtime, start, state, stream])
  return <LiveCameraContext.Provider value={value}>{children}</LiveCameraContext.Provider>
}

export function useLiveCamera() {
  const context = React.useContext(LiveCameraContext)
  if (!context) throw new Error("useLiveCamera must be used inside LiveCameraProvider")
  return context
}

export function LiveCameraView({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { detections, error, inferenceMs, retry, runtime, state, stream } = useLiveCamera()
  const videoRef = React.useRef<HTMLVideoElement | null>(null)
  const [videoSize, setVideoSize] = React.useState({ width: 1280, height: 720 })

  React.useEffect(() => {
    const video = videoRef.current
    if (!video || !stream) return
    video.srcObject = stream
    const updateSize = () => setVideoSize({ width: video.videoWidth || 1280, height: video.videoHeight || 720 })
    video.addEventListener("loadedmetadata", updateSize)
    void video.play().catch(() => undefined)
    return () => video.removeEventListener("loadedmetadata", updateSize)
  }, [stream])

  const isLoading = state === "starting" || state === "loading-model"
  const hasVideo = Boolean(stream)

  return (
    <div className={cn("relative isolate aspect-video min-h-40 overflow-hidden rounded-3xl bg-black", className)}>
      <video ref={videoRef} autoPlay muted playsInline aria-label="Live home camera" className={cn("absolute inset-0 size-full object-contain", !hasVideo && "hidden")} />

      {hasVideo && detections.map((detection) => (
        <div
          key={detection.id}
          className="absolute border-2 border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(255,255,255,.35)]"
          style={{
            left: `${(detection.box.x / videoSize.width) * 100}%`,
            top: `${(detection.box.y / videoSize.height) * 100}%`,
            width: `${(detection.box.width / videoSize.width) * 100}%`,
            height: `${(detection.box.height / videoSize.height) * 100}%`,
          }}
        >
          <span className="absolute left-0 top-0 max-w-40 -translate-y-full truncate rounded-t-md bg-primary px-2 py-1 text-[11px] font-medium leading-none text-primary-foreground">
            {detection.label} · {Math.round(detection.score * 100)}%
          </span>
        </div>
      ))}

      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted p-6 text-center text-foreground">
          <span className="flex size-12 items-center justify-center rounded-2xl border bg-background">
            {isLoading ? <LoaderCircle className="size-5 animate-spin" /> : <Camera className="size-5" />}
          </span>
          <p className="mt-3 font-medium">{isLoading ? "Starting private YOLO analysis" : "Camera is unavailable"}</p>
          {error && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>}
          {!isLoading && <Button size="sm" variant="outline" className="mt-4" onClick={() => void retry()}><RefreshCw /> Try again</Button>}
        </div>
      )}

      {hasVideo && (
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur"><ShieldCheck /> Local only</Badge>
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">YOLO26n · {compact ? `${detections.length} found` : `${runtime ?? "loading"} · ${inferenceMs || "—"} ms`}</Badge>
        </div>
      )}

      {hasVideo && detections.length === 0 && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">Scanning for objects…</Badge>
        </div>
      )}
    </div>
  )
}
