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
  demo?: boolean
}

type CameraState = "starting" | "loading-model" | "live" | "blocked" | "unsupported" | "error"
type Runtime = "WebGPU" | "WebAssembly" | null
type OrtModule = typeof import("onnxruntime-web")

type LiveCameraContextValue = {
  detections: ObjectDetection[]
  demoFallActive: boolean
  realFallActive: boolean
  fallConfidence: number
  demoGlassesEnabled: boolean
  inferenceMs: number
  state: CameraState
  runtime: Runtime
  error: string | null
  stream: MediaStream | null
  setDemoGlassesEnabled: (enabled: boolean) => void
  simulateFall: () => void
  retry: () => Promise<void>
}

const LiveCameraContext = React.createContext<LiveCameraContextValue | null>(null)

const MODEL_SIZE = 320
const MOTION_WIDTH = 96
const MOTION_HEIGHT = 54
const TARGET_INFERENCE_INTERVAL_MS = 220
const MODEL_PATH = "/yolo26n.onnx"
const FALL_MODEL_PATH = "/memoria-fall.onnx"
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
  labels: readonly string[] = COCO_LABELS,
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
      label: labels[classId] ?? `object ${classId}`,
      score,
      box: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 },
    })
  }

  return detections
}

function findMotionRegion(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  previousLuma: Uint8Array | null,
) {
  const context = canvas.getContext("2d", { willReadFrequently: true })
  if (!context) return { currentLuma: previousLuma, box: null }

  context.drawImage(video, 0, 0, MOTION_WIDTH, MOTION_HEIGHT)
  const pixels = context.getImageData(0, 0, MOTION_WIDTH, MOTION_HEIGHT).data
  const currentLuma = new Uint8Array(MOTION_WIDTH * MOTION_HEIGHT)
  let minX = MOTION_WIDTH
  let minY = MOTION_HEIGHT
  let maxX = -1
  let maxY = -1
  let changed = 0

  for (let index = 0; index < currentLuma.length; index += 1) {
    const rgba = index * 4
    const luma = Math.round(pixels[rgba] * 0.299 + pixels[rgba + 1] * 0.587 + pixels[rgba + 2] * 0.114)
    currentLuma[index] = luma
    if (!previousLuma || Math.abs(luma - previousLuma[index]) < 28) continue
    const x = index % MOTION_WIDTH
    const y = Math.floor(index / MOTION_WIDTH)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    changed += 1
  }

  const changedRatio = changed / currentLuma.length
  const width = maxX - minX + 1
  const height = maxY - minY + 1
  const regionRatio = width > 0 && height > 0 ? (width * height) / currentLuma.length : 0
  const isHeldObjectMotion = previousLuma && changed >= 12 && changedRatio < 0.22 && regionRatio < 0.42 && width >= 3 && height >= 3

  if (!isHeldObjectMotion) return { currentLuma, box: null }

  const paddingX = Math.max(2, Math.round(width * 0.18))
  const paddingY = Math.max(2, Math.round(height * 0.18))
  const left = Math.max(0, minX - paddingX)
  const top = Math.max(0, minY - paddingY)
  const right = Math.min(MOTION_WIDTH, maxX + 1 + paddingX)
  const bottom = Math.min(MOTION_HEIGHT, maxY + 1 + paddingY)

  return {
    currentLuma,
    box: {
      x: (left / MOTION_WIDTH) * video.videoWidth,
      y: (top / MOTION_HEIGHT) * video.videoHeight,
      width: ((right - left) / MOTION_WIDTH) * video.videoWidth,
      height: ((bottom - top) / MOTION_HEIGHT) * video.videoHeight,
    },
  }
}

export function LiveCameraProvider({ children }: { children: React.ReactNode }) {
  const [stream, setStream] = React.useState<MediaStream | null>(null)
  const [detections, setDetections] = React.useState<ObjectDetection[]>([])
  const [demoFallActive, setDemoFallActive] = React.useState(false)
  const [realFallActive, setRealFallActive] = React.useState(false)
  const [fallConfidence, setFallConfidence] = React.useState(0)
  const [demoGlassesEnabled, setDemoGlassesEnabled] = React.useState(true)
  const [state, setState] = React.useState<CameraState>("starting")
  const [runtime, setRuntime] = React.useState<Runtime>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [inferenceMs, setInferenceMs] = React.useState(0)
  const sessionRef = React.useRef<InferenceSession | null>(null)
  const fallSessionRef = React.useRef<InferenceSession | null>(null)
  const ortRef = React.useRef<OrtModule | null>(null)
  const runtimeRef = React.useRef<Exclude<Runtime, null> | null>(null)
  const sourceVideoRef = React.useRef<HTMLVideoElement | null>(null)
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const loopTimerRef = React.useRef<number | null>(null)
  const runningRef = React.useRef(false)
  const streamRef = React.useRef<MediaStream | null>(null)
  const demoFallTimerRef = React.useRef<number | null>(null)
  const demoGlassesRef = React.useRef(true)

  React.useEffect(() => {
    demoGlassesRef.current = demoGlassesEnabled
  }, [demoGlassesEnabled])

  const simulateFall = React.useCallback(() => {
    if (demoFallTimerRef.current !== null) window.clearTimeout(demoFallTimerRef.current)
    setDemoFallActive(true)
    demoFallTimerRef.current = window.setTimeout(() => {
      setDemoFallActive(false)
      demoFallTimerRef.current = null
    }, 12_000)
    const householdId = window.localStorage.getItem("tomo-household-id")
    if (householdId) {
      void fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tomo-household": householdId },
        body: JSON.stringify({
          type: "possible_fall",
          severity: "urgent",
          title: "Possible fall — demo",
          message: "A synthetic possible-fall event was created from the camera demo control.",
        }),
      }).catch(() => undefined)
    }
  }, [])

  const stopLoop = React.useCallback(() => {
    runningRef.current = false
    if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current)
    loopTimerRef.current = null
  }, [])

  const startInference = React.useCallback((video: HTMLVideoElement, session: InferenceSession, fallSession: InferenceSession | null, ort: OrtModule) => {
    stopLoop()
    runningRef.current = true
    const canvas = document.createElement("canvas")
    canvas.width = MODEL_SIZE
    canvas.height = MODEL_SIZE
    canvasRef.current = canvas
    const motionCanvas = document.createElement("canvas")
    motionCanvas.width = MOTION_WIDTH
    motionCanvas.height = MOTION_HEIGHT
    let previousLuma: Uint8Array | null = null
    let heldObjectBox: ObjectDetection["box"] | null = null
    let heldObjectExpiresAt = 0
    let lastFallInferenceAt = 0
    let fallVotes: Array<{ fallen: boolean; confidence: number }> = []
    let alertSent = false

    const detect = async () => {
      if (!runningRef.current) return
      const startedAt = performance.now()

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        try {
          const frame = prepareFrame(video, canvas, ort)
          const results = await session.run({ images: frame.tensor })
          const output = results[session.outputNames[0]]
          const liveDetections = parseYoloOutput(output.data as Float32Array, frame)
          if (demoGlassesRef.current) {
            const candidate = liveDetections
              .filter((detection) => detection.label !== "person")
              .sort((left, right) => right.score - left.score)[0]
            const motion = findMotionRegion(video, motionCanvas, previousLuma)
            previousLuma = motion.currentLuma
            if (motion.box) {
              heldObjectBox = motion.box
              heldObjectExpiresAt = performance.now() + 4_000
            }

            if (candidate) {
              setDetections(liveDetections.map((detection) => detection.id === candidate.id
                ? { ...detection, id: "demo-glasses", label: "Glasses", score: Math.max(0.91, detection.score), demo: true }
                : detection))
            } else if (heldObjectBox && performance.now() < heldObjectExpiresAt) {
              setDetections([
                ...liveDetections,
                { id: "demo-glasses-motion", label: "Glasses", score: 0.91, box: heldObjectBox, demo: true },
              ])
            } else {
              setDetections(liveDetections)
            }
          } else {
            previousLuma = null
            heldObjectBox = null
            setDetections(liveDetections)
          }

          if (fallSession && performance.now() - lastFallInferenceAt >= 700) {
            lastFallInferenceAt = performance.now()
            const fallResults = await fallSession.run({ images: frame.tensor })
            const fallOutput = fallResults[fallSession.outputNames[0]]
            const postureDetections = parseYoloOutput(fallOutput.data as Float32Array, frame, ["fallen", "not fallen"])
            const fallen = postureDetections.filter((detection) => detection.label === "fallen").sort((left, right) => right.score - left.score)[0]
            fallVotes = [...fallVotes, { fallen: Boolean(fallen), confidence: fallen?.score ?? 0 }].slice(-5)
            const positiveVotes = fallVotes.filter((vote) => vote.fallen)
            const confirmed = fallVotes.length >= 4 && positiveVotes.length >= 3
            const confidence = positiveVotes.length
              ? positiveVotes.reduce((total, vote) => total + vote.confidence, 0) / positiveVotes.length
              : 0
            setFallConfidence(confidence)
            setRealFallActive(confirmed)

            if (confirmed && !alertSent) {
              alertSent = true
              const householdId = window.localStorage.getItem("tomo-household-id")
              if (householdId) {
                void fetch("/api/alerts", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-tomo-household": householdId },
                  body: JSON.stringify({
                    type: "possible_fall",
                    severity: "urgent",
                    title: "Possible fall — please check",
                    message: `The local temporal fall model detected a sustained fall-like posture (${Math.round(confidence * 100)}% raw confidence).`,
                  }),
                }).catch(() => undefined)
              }
            }
            if (!confirmed && positiveVotes.length === 0) alertSent = false
          }
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

    let cameraStream: MediaStream

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24, max: 30 },
        },
      })
      streamRef.current = cameraStream
      setStream(cameraStream)

      const sourceVideo = document.createElement("video")
      sourceVideo.muted = true
      sourceVideo.playsInline = true
      sourceVideo.autoplay = true
      sourceVideo.srcObject = cameraStream
      sourceVideoRef.current = sourceVideo
      await sourceVideo.play()
    } catch (cameraError) {
      console.error("Camera startup failed", cameraError)
      const message = readableCameraError(cameraError)
      setState(cameraError instanceof DOMException && cameraError.name === "NotAllowedError" ? "blocked" : "error")
      setError(message)
      return
    }

    setState("loading-model")

    try {
      const detector = sessionRef.current && ortRef.current
        ? { ort: ortRef.current, session: sessionRef.current, runtime: runtimeRef.current ?? "WebAssembly" as const }
        : await createYoloSession()

      sessionRef.current = detector.session
      ortRef.current = detector.ort
      runtimeRef.current = detector.runtime
      setRuntime(detector.runtime)

      let fallSession = fallSessionRef.current
      if (!fallSession) {
        try {
          fallSession = await detector.ort.InferenceSession.create(FALL_MODEL_PATH, {
            executionProviders: [detector.runtime === "WebGPU" ? "webgpu" : "wasm"],
            graphOptimizationLevel: "all",
          })
          fallSessionRef.current = fallSession
        } catch (fallModelError) {
          console.error("Fall model startup failed; continuing with object detection", fallModelError)
        }
      }

      if (!sourceVideoRef.current) throw new Error("Camera video was interrupted before analysis could start.")
      startInference(sourceVideoRef.current, detector.session, fallSession, detector.ort)
    } catch (detectorError) {
      console.error("YOLO startup failed", detectorError)
      setState("error")
      setError("The camera is live, but local object detection could not start. Check the connection and retry analysis.")
    }
  }, [startInference, stopLoop])

  React.useEffect(() => {
    const startupTimer = window.setTimeout(() => void start(), 0)
    return () => {
      window.clearTimeout(startupTimer)
      if (demoFallTimerRef.current !== null) window.clearTimeout(demoFallTimerRef.current)
      stopLoop()
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      sourceVideoRef.current = null
      canvasRef.current = null
      void sessionRef.current?.release()
      void fallSessionRef.current?.release()
      sessionRef.current = null
      fallSessionRef.current = null
      ortRef.current = null
      runtimeRef.current = null
    }
  }, [start, stopLoop])

  const value = React.useMemo<LiveCameraContextValue>(() => ({ detections, demoFallActive, realFallActive, fallConfidence, demoGlassesEnabled, inferenceMs, state, runtime, error, stream, setDemoGlassesEnabled, simulateFall, retry: start }), [demoFallActive, demoGlassesEnabled, detections, error, fallConfidence, inferenceMs, realFallActive, runtime, simulateFall, start, state, stream])
  return <LiveCameraContext.Provider value={value}>{children}</LiveCameraContext.Provider>
}

export function useLiveCamera() {
  const context = React.useContext(LiveCameraContext)
  if (!context) throw new Error("useLiveCamera must be used inside LiveCameraProvider")
  return context
}

export function LiveCameraView({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { demoFallActive, realFallActive, fallConfidence, demoGlassesEnabled, detections, error, inferenceMs, retry, runtime, state, stream } = useLiveCamera()
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
            {detection.label} · {Math.round(detection.score * 100)}%{detection.demo ? " · Demo" : ""}
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

      {hasVideo && state === "error" && (
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-2">
          <Badge variant="destructive" className="max-w-[70%] truncate">{error ?? "Local analysis paused"}</Badge>
          <Button size="sm" variant="secondary" onClick={() => void retry()}><RefreshCw /> Retry</Button>
        </div>
      )}

      {hasVideo && state !== "error" && detections.length === 0 && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">Scanning for objects…</Badge>
        </div>
      )}

      {hasVideo && demoGlassesEnabled && (
        <div className="absolute bottom-3 left-3">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">Demo glasses mapping on</Badge>
        </div>
      )}

      {hasVideo && (realFallActive || demoFallActive) && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center" role="alert">
          <Badge variant="destructive" className="px-3 py-1.5">{realFallActive ? `Possible fall · ${Math.round(fallConfidence * 100)}% · Local model` : "Possible fall · Demo"}</Badge>
        </div>
      )}
    </div>
  )
}
