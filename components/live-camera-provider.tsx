"use client"

import * as React from "react"
import type { InferenceSession } from "onnxruntime-web"
import { Camera, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { detectPersonalObjects } from "@/lib/client/personal-object-detector"
import { cn } from "@/lib/utils"

export type ObjectDetection = {
  id: string
  label: string
  score: number
  box: { x: number; y: number; width: number; height: number }
}

type CameraState = "starting" | "loading-model" | "live" | "blocked" | "unsupported" | "error"
type Runtime = "WebGPU" | "WebAssembly" | null
type PersonalDetectorState = "idle" | "loading" | "ready" | "error"
type OrtModule = typeof import("onnxruntime-web")

type LiveCameraContextValue = {
  detections: ObjectDetection[]
  realFallActive: boolean
  fallConfidence: number
  personalDetectorState: PersonalDetectorState
  inferenceMs: number
  state: CameraState
  runtime: Runtime
  error: string | null
  stream: MediaStream | null
  retry: () => Promise<void>
}

const LiveCameraContext = React.createContext<LiveCameraContextValue | null>(null)

const MODEL_SIZE = 320
const MOTION_WIDTH = 96
const MOTION_HEIGHT = 54
const TARGET_INFERENCE_INTERVAL_MS = 220
const MODEL_PATH = "/yolo26n.onnx?v=1"
const FALL_MODEL_PATH = "/memoria-fall.onnx?v=1"
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/"
const PERSONAL_INFERENCE_INTERVAL_MS = 2_500

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
    return "Camera analysis could not start. Check the connection once, then try again."
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
  ort.env.wasm.proxy = false
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
  if (!context) return { currentLuma: previousLuma, box: null, meaningfulMotion: false }

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

  const meaningfulMotion = Boolean(previousLuma && changedRatio >= 0.025)
  if (!isHeldObjectMotion) return { currentLuma, box: null, meaningfulMotion }

  const paddingX = Math.max(2, Math.round(width * 0.18))
  const paddingY = Math.max(2, Math.round(height * 0.18))
  const left = Math.max(0, minX - paddingX)
  const top = Math.max(0, minY - paddingY)
  const right = Math.min(MOTION_WIDTH, maxX + 1 + paddingX)
  const bottom = Math.min(MOTION_HEIGHT, maxY + 1 + paddingY)

  return {
    currentLuma,
    meaningfulMotion,
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
  const [realFallActive, setRealFallActive] = React.useState(false)
  const [fallConfidence, setFallConfidence] = React.useState(0)
  const [personalDetectorState, setPersonalDetectorState] = React.useState<PersonalDetectorState>("idle")
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
  const fallLoadTimerRef = React.useRef<number | null>(null)
  const fallSessionPromiseRef = React.useRef<Promise<InferenceSession> | null>(null)
  const runningRef = React.useRef(false)
  const streamRef = React.useRef<MediaStream | null>(null)
  const stopLoop = React.useCallback(() => {
    runningRef.current = false
    if (loopTimerRef.current !== null) window.clearTimeout(loopTimerRef.current)
    if (fallLoadTimerRef.current !== null) window.clearTimeout(fallLoadTimerRef.current)
    loopTimerRef.current = null
    fallLoadTimerRef.current = null
  }, [])

  const startInference = React.useCallback((video: HTMLVideoElement, session: InferenceSession, ort: OrtModule) => {
    stopLoop()
    runningRef.current = true
    const canvas = document.createElement("canvas")
    canvas.width = MODEL_SIZE
    canvas.height = MODEL_SIZE
    canvasRef.current = canvas
    const motionCanvas = document.createElement("canvas")
    motionCanvas.width = MOTION_WIDTH
    motionCanvas.height = MOTION_HEIGHT
    const cameraReadyAt = performance.now()
    let previousLuma: Uint8Array | null = null
    let lastFallInferenceAt = 0
    let lastMeaningfulMotionAt = 0
    let lastAlertAt = 0
    let fallVotes: Array<{ fallen: boolean; confidence: number }> = []
    let geometryFallVotes: boolean[] = []
    let previousPerson: { aspect: number; centerY: number; at: number } | null = null
    let rapidPostureChangeUntil = 0
    let alertSent = false
    let personalInferenceRunning = false
    let lastPersonalInferenceAt = 0
    let personalBurstRemaining = 0
    let personalDetections: ObjectDetection[] = []
    let personalDetectionsExpireAt = 0
    let personalHistory: Array<Set<string>> = []
    const lastStored = new Map<string, { x: number; y: number; at: number }>()
    let clipChunks: Blob[] = []
    let previousClip: Blob | null = null
    let clipRecorder: MediaRecorder | null = null
    let clipMimeType = "video/webm"
    if (typeof MediaRecorder !== "undefined" && video.srcObject instanceof MediaStream) {
      try {
        clipMimeType = ["video/webm;codecs=vp8", "video/webm"]
          .find((type) => MediaRecorder.isTypeSupported(type)) ?? ""
        const startClipSegment = () => {
          if (!runningRef.current || !(video.srcObject instanceof MediaStream) || !video.srcObject.active) return
          clipChunks = []
          const recorder = new MediaRecorder(video.srcObject, clipMimeType ? { mimeType: clipMimeType, videoBitsPerSecond: 600_000 } : undefined)
          clipRecorder = recorder
          recorder.addEventListener("dataavailable", (event) => {
            if (event.data.size) clipChunks.push(event.data)
          })
          recorder.addEventListener("stop", () => {
            if (clipChunks.length) previousClip = new Blob([...clipChunks], { type: clipMimeType || "video/webm" })
            if (runningRef.current && video.srcObject instanceof MediaStream && video.srcObject.active) startClipSegment()
          }, { once: true })
          recorder.start(1_000)
          window.setTimeout(() => {
            if (recorder.state !== "inactive") recorder.stop()
          }, 5_000)
        }
        startClipSegment()
        video.srcObject.getVideoTracks()[0]?.addEventListener("ended", () => {
          if (clipRecorder?.state !== "inactive") clipRecorder?.stop()
          clipChunks = []
          previousClip = null
        }, { once: true })
      } catch (recorderError) {
        console.warn("Local event buffer is unavailable", recorderError)
      }
    }

    const detect = async () => {
      if (!runningRef.current) return
      const startedAt = performance.now()

      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
        try {
          const frame = prepareFrame(video, canvas, ort)
          const results = await session.run({ images: frame.tensor })
          const output = results[session.outputNames[0]]
          const liveDetections = parseYoloOutput(output.data as Float32Array, frame)
          const motion = findMotionRegion(video, motionCanvas, previousLuma)
          previousLuma = motion.currentLuma
          const now = performance.now()
          if (motion.meaningfulMotion) lastMeaningfulMotionAt = now

          const visiblePerson = liveDetections
            .filter((detection) => detection.label === "person" && detection.score >= 0.5)
            .sort((left, right) => right.box.width * right.box.height - left.box.width * left.box.height)[0]
          let lowPosture = false
          let rapidPostureChange = false
          if (visiblePerson) {
            const aspect = visiblePerson.box.width / Math.max(visiblePerson.box.height, 1)
            const centerY = (visiblePerson.box.y + visiblePerson.box.height / 2) / video.videoHeight
            const bottom = (visiblePerson.box.y + visiblePerson.box.height) / video.videoHeight
            rapidPostureChange = Boolean(previousPerson
              && now - previousPerson.at <= 2_000
              && ((previousPerson.aspect < 0.8 && aspect >= 1)
                || centerY - previousPerson.centerY >= 0.12))
            if (rapidPostureChange) rapidPostureChangeUntil = now + 6_000
            lowPosture = aspect >= 1 && bottom >= 0.7
            previousPerson = { aspect, centerY, at: now }
          } else if (previousPerson && now - previousPerson.at > 2_000) {
            previousPerson = null
          }

          if (motion.box) personalBurstRemaining = Math.max(personalBurstRemaining, 2)
          if (now - cameraReadyAt >= 3_000 && (motion.box || personalBurstRemaining > 0) && !personalInferenceRunning && now - lastPersonalInferenceAt >= PERSONAL_INFERENCE_INTERVAL_MS) {
            personalInferenceRunning = true
            if (!motion.box) personalBurstRemaining -= 1
            lastPersonalInferenceAt = now
            setPersonalDetectorState((current) => current === "ready" ? current : "loading")
            const snapshot = document.createElement("canvas")
            const snapshotWidth = Math.min(480, video.videoWidth)
            const snapshotHeight = Math.round(snapshotWidth * (video.videoHeight / video.videoWidth))
            snapshot.width = snapshotWidth
            snapshot.height = snapshotHeight
            snapshot.getContext("2d")?.drawImage(video, 0, 0, snapshotWidth, snapshotHeight)
            const evidenceDataUrl = snapshot.toDataURL("image/jpeg", 0.55)
            const sceneDetections = [...liveDetections]

            void detectPersonalObjects(evidenceDataUrl).then((results) => {
              setPersonalDetectorState("ready")
              personalHistory = [...personalHistory, new Set(results.map((result) => result.label))].slice(-3)
              const confirmedLabels = new Set(results
                .map((result) => result.label)
                .filter((label) => personalHistory.filter((sample) => sample.has(label)).length >= 2))
              personalDetections = results
                .filter((result) => confirmedLabels.has(result.label))
                .map((result, index) => ({
                  id: `personal-${result.label}-${index}`,
                  label: result.label === "keys" ? "Keys" : "Glasses",
                  score: result.score,
                  box: {
                    x: (result.box.xmin / snapshotWidth) * video.videoWidth,
                    y: (result.box.ymin / snapshotHeight) * video.videoHeight,
                    width: ((result.box.xmax - result.box.xmin) / snapshotWidth) * video.videoWidth,
                    height: ((result.box.ymax - result.box.ymin) / snapshotHeight) * video.videoHeight,
                  },
                }))
              personalDetectionsExpireAt = performance.now() + 4_000
              setDetections([...sceneDetections, ...personalDetections])

              for (const detection of personalDetections) {
                const normalizedX = (detection.box.x + detection.box.width / 2) / video.videoWidth
                const normalizedY = (detection.box.y + detection.box.height / 2) / video.videoHeight
                const previous = lastStored.get(detection.label)
                const moved = !previous || Math.hypot(normalizedX - previous.x, normalizedY - previous.y) >= 0.12
                const expired = !previous || Date.now() - previous.at >= 5 * 60_000
                if (!moved && !expired) continue
                lastStored.set(detection.label, { x: normalizedX, y: normalizedY, at: Date.now() })
                const nearby = sceneDetections
                  .filter((scene) => ["dining table", "chair", "couch", "bed", "bench"].includes(scene.label))
                  .sort((left, right) => {
                    const leftDistance = Math.hypot(left.box.x + left.box.width / 2 - detection.box.x, left.box.y + left.box.height / 2 - detection.box.y)
                    const rightDistance = Math.hypot(right.box.x + right.box.width / 2 - detection.box.x, right.box.y + right.box.height / 2 - detection.box.y)
                    return leftDistance - rightDistance
                  })[0]
                const horizontal = normalizedX < 0.34 ? "left" : normalizedX > 0.66 ? "right" : "center"
                const location = nearby ? `near the ${nearby.label}` : `in the ${horizontal} of the camera view`
                const householdId = window.localStorage.getItem("tomo-household-id")
                if (!householdId) continue
                void fetch("/api/memories", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "x-tomo-household": householdId },
                  body: JSON.stringify({
                    description: `${detection.label} were last seen ${location}.`,
                    objectLabels: [detection.label.toLowerCase(), nearby?.label].filter(Boolean),
                    occurredAt: new Date().toISOString(),
                    evidenceDataUrl: evidenceDataUrl.length <= 120_000 ? evidenceDataUrl : undefined,
                    boxes: [{
                      label: detection.label,
                      confidence: detection.score,
                      x: detection.box.x / video.videoWidth,
                      y: detection.box.y / video.videoHeight,
                      width: detection.box.width / video.videoWidth,
                      height: detection.box.height / video.videoHeight,
                    }],
                    importance: "important",
                    provenance: "camera",
                  }),
                }).catch(() => undefined)
              }
            }).catch((personalError) => {
              console.warn("Personal-object detector unavailable", personalError)
              setPersonalDetectorState("error")
            }).finally(() => {
              personalInferenceRunning = false
            })
          }

          if (performance.now() >= personalDetectionsExpireAt) personalDetections = []
          setDetections([...liveDetections, ...personalDetections])

          const fallSession = fallSessionRef.current
          if (fallSession && performance.now() - lastFallInferenceAt >= 700) {
            lastFallInferenceAt = performance.now()
            const fallResults = await fallSession.run({ images: frame.tensor })
            const fallOutput = fallResults[fallSession.outputNames[0]]
            const postureDetections = parseYoloOutput(fallOutput.data as Float32Array, frame, ["fallen", "not fallen"])
            const fallenScore = Math.max(0, ...postureDetections.filter((detection) => detection.label === "fallen").map((detection) => detection.score))
            const uprightScore = Math.max(0, ...postureDetections.filter((detection) => detection.label === "not fallen").map((detection) => detection.score))
            const modelFallen = Boolean(visiblePerson && fallenScore >= 0.72 && fallenScore > uprightScore + 0.08)
            fallVotes = [...fallVotes, { fallen: modelFallen, confidence: fallenScore }].slice(-5)
            geometryFallVotes = [...geometryFallVotes, Boolean(visiblePerson && lowPosture && now <= rapidPostureChangeUntil)].slice(-5)
            const positiveVotes = fallVotes.filter((vote) => vote.fallen)
            const modelConfirmed = fallVotes.length >= 5
              && positiveVotes.length >= 4
              && positiveVotes.every((vote) => vote.confidence >= 0.72)
            const geometryConfirmed = geometryFallVotes.length >= 5
              && geometryFallVotes.filter(Boolean).length >= 4
            const confirmed = Boolean(visiblePerson
              && performance.now() - lastMeaningfulMotionAt <= 8_000
              && (modelConfirmed || geometryConfirmed))
            const confidence = positiveVotes.length
              ? positiveVotes.reduce((total, vote) => total + vote.confidence, 0) / positiveVotes.length
              : 0
            setFallConfidence(confirmed ? confidence : 0)
            setRealFallActive(confirmed)

            if (confirmed && !alertSent && Date.now() - lastAlertAt >= 10 * 60_000) {
              alertSent = true
              lastAlertAt = Date.now()
              const householdId = window.localStorage.getItem("tomo-household-id")
              if (householdId) {
                const proofCanvas = document.createElement("canvas")
                proofCanvas.width = Math.min(480, video.videoWidth)
                proofCanvas.height = Math.round(proofCanvas.width * video.videoHeight / video.videoWidth)
                const proofContext = proofCanvas.getContext("2d")
                proofContext?.drawImage(video, 0, 0, proofCanvas.width, proofCanvas.height)
                const fallBoxes = visiblePerson ? [{
                  label: "Person",
                  confidence: Math.max(fallenScore, visiblePerson.score),
                  x: visiblePerson.box.x / video.videoWidth,
                  y: visiblePerson.box.y / video.videoHeight,
                  width: visiblePerson.box.width / video.videoWidth,
                  height: visiblePerson.box.height / video.videoHeight,
                }] : []
                if (proofContext && fallBoxes[0]) {
                  const box = fallBoxes[0]
                  proofContext.strokeStyle = "#dc2626"
                  proofContext.lineWidth = Math.max(3, proofCanvas.width / 150)
                  proofContext.strokeRect(box.x * proofCanvas.width, box.y * proofCanvas.height, box.width * proofCanvas.width, box.height * proofCanvas.height)
                  proofContext.fillStyle = "#dc2626"
                  proofContext.font = `600 ${Math.max(14, proofCanvas.width / 28)}px sans-serif`
                  proofContext.fillText("Possible fall", box.x * proofCanvas.width, Math.max(20, box.y * proofCanvas.height - 6))
                }
                const evidenceDataUrl = proofCanvas.toDataURL("image/jpeg", 0.45)
                const currentClip = clipChunks.length > 1 ? new Blob([...clipChunks], { type: clipMimeType || "video/webm" }) : null
                const bufferedClip = currentClip ?? previousClip
                void (async () => {
                  const alertResponse = await fetch("/api/alerts", {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-tomo-household": householdId },
                    body: JSON.stringify({
                      type: "possible_fall",
                      severity: "urgent",
                      title: "Possible fall — please check",
                      message: "TOMO detected a sustained fall-like posture and could not confirm that the person is okay.",
                      evidenceDataUrl: evidenceDataUrl.length <= 120_000 ? evidenceDataUrl : undefined,
                      fallBoxes,
                      boxes: fallBoxes,
                    }),
                  })
                  if (!alertResponse.ok || !bufferedClip) return
                  const { alert } = await alertResponse.json() as { alert?: { id?: string } }
                  if (!alert?.id) return
                  const clipResponse = await fetch("/api/evidence", {
                    method: "POST",
                    headers: {
                      "Content-Type": bufferedClip.type || "video/webm",
                      "x-tomo-household": householdId,
                      "x-tomo-evidence-kind": "clip",
                    },
                    body: bufferedClip,
                  })
                  if (!clipResponse.ok) return
                  const { key: videoKey } = await clipResponse.json() as { key?: string }
                  if (!videoKey) return
                  await fetch(`/api/alerts/${alert.id}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "x-tomo-household": householdId },
                    body: JSON.stringify({ videoKey, actor: "camera" }),
                  })
                })().catch((evidenceError) => console.warn("Fall evidence could not be stored", evidenceError))
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

    const hasCachedDetector = Boolean(sessionRef.current && ortRef.current)
    const detectorPromise = hasCachedDetector
      ? Promise.resolve({
          ort: ortRef.current as OrtModule,
          session: sessionRef.current as InferenceSession,
          runtime: runtimeRef.current ?? "WebAssembly" as const,
        })
      : createYoloSession()

    let cameraStream: MediaStream

    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "user" },
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 20, max: 24 },
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
      if (!hasCachedDetector) {
        void detectorPromise.then(({ session }) => session.release()).catch(() => undefined)
      }
      return
    }

    setState("loading-model")

    try {
      const detector = await detectorPromise

      sessionRef.current = detector.session
      ortRef.current = detector.ort
      runtimeRef.current = detector.runtime
      setRuntime(detector.runtime)

      if (!sourceVideoRef.current) throw new Error("Camera video was interrupted before analysis could start.")
      startInference(sourceVideoRef.current, detector.session, detector.ort)

      if (!fallSessionRef.current && !fallSessionPromiseRef.current) {
        fallLoadTimerRef.current = window.setTimeout(() => {
          fallLoadTimerRef.current = null
          const loadFallModel = () => {
            if (!runningRef.current) return
            const fallSessionPromise = detector.ort.InferenceSession.create(FALL_MODEL_PATH, {
              executionProviders: [detector.runtime === "WebGPU" ? "webgpu" : "wasm"],
              graphOptimizationLevel: "all",
            })
            fallSessionPromiseRef.current = fallSessionPromise
            void fallSessionPromise.then((fallSession) => {
              if (runningRef.current) fallSessionRef.current = fallSession
              else void fallSession.release()
            }).catch((fallModelError) => {
              console.error("Fall model startup failed; continuing with object detection", fallModelError)
            }).finally(() => {
              if (fallSessionPromiseRef.current === fallSessionPromise) fallSessionPromiseRef.current = null
            })
          }
          if ("requestIdleCallback" in window) window.requestIdleCallback(loadFallModel, { timeout: 8_000 })
          else loadFallModel()
        }, 6_000)
      }
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

  const value = React.useMemo<LiveCameraContextValue>(() => ({ detections, realFallActive, fallConfidence, personalDetectorState, inferenceMs, state, runtime, error, stream, retry: start }), [detections, error, fallConfidence, inferenceMs, personalDetectorState, realFallActive, runtime, start, state, stream])
  return <LiveCameraContext.Provider value={value}>{children}</LiveCameraContext.Provider>
}

export function useLiveCamera() {
  const context = React.useContext(LiveCameraContext)
  if (!context) throw new Error("useLiveCamera must be used inside LiveCameraProvider")
  return context
}

export function LiveCameraView({ className }: { className?: string; compact?: boolean }) {
  const { realFallActive, detections, error, retry, state, stream } = useLiveCamera()
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
          <p className="mt-3 font-medium">{isLoading ? "Starting the camera" : "Camera is unavailable"}</p>
          {error && <p className="mt-1 max-w-sm text-xs text-muted-foreground">{error}</p>}
          {!isLoading && <Button size="sm" variant="outline" className="mt-4" onClick={() => void retry()}><RefreshCw /> Try again</Button>}
        </div>
      )}

      {hasVideo && (
        <div className="absolute inset-x-3 top-3 flex flex-wrap items-start justify-between gap-2">
          <Badge variant="secondary" className="bg-background/90 backdrop-blur"><ShieldCheck /> Local only</Badge>
          <Badge variant="secondary" className="bg-background/90 backdrop-blur">{state === "live" ? `${detections.length} found` : "Getting ready"}</Badge>
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

      {hasVideo && realFallActive && (
        <div className="absolute inset-x-3 bottom-3 flex justify-center" role="alert">
          <Badge variant="destructive" className="px-3 py-1.5">Possible fall · Please check</Badge>
        </div>
      )}
    </div>
  )
}
