"use client"

// Production patient and caregiver composition.
// Patient starts in the calm voice-first home, then moves into conversation.
// Caregiver starts in the evidence-focused care inbox and can open Ask TOMO.

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  Bell,
  CalendarDays,
  Camera,
  Check,
  CircleCheck,
  Clock3,
  CloudSun,
  Database,
  FileSearch,
  Glasses,
  Languages,
  LockKeyhole,
  MessageCircle,
  Mic,
  Phone,
  Search,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  Volume2,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group"
import { Input } from "@/components/ui/input"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import { LiveCameraProvider, LiveCameraView, useLiveCamera } from "@/components/live-camera-provider"

type Role = "patient" | "caregiver"
type PatientView = "home" | "chat"
type CaregiverView = "inbox" | "chat"
type VoiceState = "ready" | "listening"
type TurnStage = "idle" | "understanding" | "searching" | "retrieving" | "answering" | "done"
type AlertState = "open" | "checking" | "safe"
type ApprovalState = "pending" | "approved" | "rejected"

type StoredAlert = {
  id: string
  type: "possible_fall" | "sensitive_memory" | "reminder"
  severity: "info" | "important" | "urgent"
  status: "open" | "checking" | "resolved"
  title: string
  message: string
  evidenceKey: string | null
  createdAt: string
}

type StoredMemory = {
  id: string
  description: string
  occurredAt: string
  evidenceDataUrl: string | null
  boxes: ChatEvidence["boxes"]
}

type StoredApproval = {
  id: string
  statement: string
  state: ApprovalState
}

type SpeechResultEvent = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>
}

type BrowserSpeechRecognition = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: (() => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type SpeechRecognitionWindow = Window & typeof globalThis & {
  SpeechRecognition?: new () => BrowserSpeechRecognition
  webkitSpeechRecognition?: new () => BrowserSpeechRecognition
}

type ChatEvidence = {
  id: string
  description: string
  occurredAt: string
  bestFrameKey: string | null
  evidenceDataUrl: string | null
  boxes: Array<{ label: string; confidence: number; x: number; y: number; width: number; height: number }>
}

type ChatTurn = {
  query: string
  stage: TurnStage
  answer: string | null
  provider: string | null
  evidenceCount: number
  evidence: ChatEvidence[]
  repeated: boolean
  start: (query: string) => void
  reset: () => void
}

const stageIndex: Record<TurnStage, number> = {
  idle: -1,
  understanding: 0,
  searching: 1,
  retrieving: 2,
  answering: 3,
  done: 4,
}

type ChatApiResponse = {
  answer?: string
  provider?: string
  evidence?: ChatEvidence[]
  repeated?: boolean
  requiresApproval?: boolean
  error?: string
}

function householdId() {
  const key = "tomo-household-id"
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const created = `guest_${crypto.randomUUID().replaceAll("-", "")}`
  window.localStorage.setItem(key, created)
  return created
}

function useChatTurn(audience: Role): ChatTurn {
  const [query, setQuery] = React.useState("")
  const [stage, setStage] = React.useState<TurnStage>("idle")
  const [answer, setAnswer] = React.useState<string | null>(null)
  const [provider, setProvider] = React.useState<string | null>(null)
  const [evidenceCount, setEvidenceCount] = React.useState(0)
  const [evidence, setEvidence] = React.useState<ChatEvidence[]>([])
  const [repeated, setRepeated] = React.useState(false)
  const request = React.useRef<AbortController | null>(null)

  React.useEffect(() => () => request.current?.abort(), [])

  function start(nextQuery: string) {
    if (!nextQuery.trim()) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const message = nextQuery.trim()
    setQuery(message)
    setAnswer(null)
    setProvider(null)
    setEvidenceCount(0)
    setEvidence([])
    setRepeated(false)
    setStage("understanding")
    void (async () => {
      try {
        const remember = /^(remember\b|覚えて|記憶して)/i.test(message)
        const rememberedText = message.replace(/^(?:remember(?: that)?|覚えて|記憶して)\s*/i, "")
        const isSchedule = /\b(today|tomorrow|schedule|appointment|meeting|meet|leave by|at \d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b|今日|明日|予定|約束|会う|午前|午後|\d{1,2}時/i.test(rememberedText)
        const isMedication = /medicine|medication|薬|くすり/i.test(rememberedText)
        setStage("searching")
        const response = await fetch(remember ? "/api/memories" : "/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-tomo-household": householdId(),
          },
          body: JSON.stringify(remember
            ? { description: rememberedText, objectLabels: isSchedule ? ["schedule"] : isMedication ? ["medicine"] : [], provenance: audience, importance: isMedication ? "safety" : "important" }
            : { message, locale: /[\u3040-\u30ff\u3400-\u9fff]/.test(message) ? "ja" : "en", audience }),
          signal: controller.signal,
        })
        setStage("retrieving")
        const payload = await response.json() as ChatApiResponse & { memory?: { description?: string } }
        if (!response.ok) throw new Error(payload.error || "TOMO could not complete that request")
        setEvidenceCount(payload.evidence?.length ?? 0)
        setEvidence(payload.evidence ?? [])
        setRepeated(Boolean(payload.repeated))
        setProvider(payload.provider ?? (remember ? "d1" : "deterministic"))
        setStage("answering")
        setAnswer(remember
          ? payload.requiresApproval
            ? `I sent this to your caregiver for approval before it can become trusted memory: ${payload.memory?.description ?? message}`
            : `I saved this as a trusted caregiver memory: ${payload.memory?.description ?? message}`
          : payload.answer ?? "I could not find a grounded answer.")
        setStage("done")
      } catch (error) {
        if (controller.signal.aborted) return
        setProvider("error")
        setAnswer(error instanceof Error ? error.message : "TOMO could not complete that request")
        setStage("done")
      }
    })()
  }

  function reset() {
    request.current?.abort()
    setQuery("")
    setAnswer(null)
    setProvider(null)
    setEvidenceCount(0)
    setEvidence([])
    setRepeated(false)
    setStage("idle")
  }

  return { query, stage, answer, provider, evidenceCount, evidence, repeated, start, reset }
}

function TomoMark({ className }: { className?: string }) {
  // vinext's image optimizer only accepts its configured responsive widths;
  // this fixed 40px local asset should be served directly.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/brand/mark-black-transparent.png" alt="TOMO logo" width={40} height={40} className={cn("size-10 shrink-0 object-contain", className)} />
}

function Brand() {
  return (
    <div className="flex items-center gap-3" aria-label="TOMO home">
      <TomoMark className="size-10" />
      <div>
        <p className="text-lg font-semibold leading-none tracking-[-0.035em]">tomo</p>
        <p className="mt-1 hidden text-xs text-muted-foreground sm:block">A familiar voice, close by.</p>
      </div>
    </div>
  )
}

function RoleControl({ role, onRoleChange }: { role: Role; onRoleChange: (role: Role) => void }) {
  return (
    <Tabs value={role} onValueChange={(value) => onRoleChange(value as Role)} aria-label="Preview role">
      <TabsList>
        <TabsTrigger value="patient" aria-label="Patient view"><MessageCircle /><span className="hidden sm:inline">Patient</span></TabsTrigger>
        <TabsTrigger value="caregiver" className="relative" aria-label="Caregiver view"><UsersRound /><span className="hidden sm:inline">Caregiver</span></TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function LanguageButton() {
  const [language, setLanguage] = React.useState<"EN" | "日本語">("EN")
  React.useEffect(() => {
    queueMicrotask(() => setLanguage(window.localStorage.getItem("tomo-voice-language") === "ja-JP" ? "日本語" : "EN"))
  }, [])
  function toggle() {
    const next = language === "EN" ? "日本語" : "EN"
    setLanguage(next)
    window.localStorage.setItem("tomo-voice-language", next === "日本語" ? "ja-JP" : "en-US")
  }
  return (
    <Button variant="ghost" className="h-10" onClick={toggle} aria-label="Switch voice language">
      <Languages /> {language}
    </Button>
  )
}

function CallYuki({ prominent = false }: { prominent?: boolean }) {
  const [number, setNumber] = React.useState("")
  const [savedNumber, setSavedNumber] = React.useState("")
  React.useEffect(() => {
    queueMicrotask(() => {
      const stored = window.localStorage.getItem("tomo-caregiver-phone") ?? ""
      setNumber(stored)
      setSavedNumber(stored)
    })
  }, [])
  function save() {
    const cleaned = number.trim()
    if (!/^\+?[0-9 ()-]{7,24}$/.test(cleaned)) return
    window.localStorage.setItem("tomo-caregiver-phone", cleaned)
    setSavedNumber(cleaned)
  }
  return (
    <Dialog>
      <DialogTrigger render={<Button variant={prominent ? "default" : "outline"} size="lg" className={cn("min-h-12", prominent && "px-6 text-base")} />}>
        <Phone /> Call Yuki
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Call Yuki</DialogTitle><DialogDescription>{savedNumber ? "Your caregiver contact is ready." : "Add Yuki’s phone number on this device before calling."}</DialogDescription></DialogHeader>
        <Card size="sm"><CardContent className="flex items-center gap-4"><Avatar className="size-12"><AvatarFallback>YK</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="font-medium">Yuki</p><p className="text-sm text-muted-foreground">Caregiver contact</p></div><Badge variant="outline">{savedNumber ? "Configured" : "Not configured"}</Badge></CardContent></Card>
        <Input type="tel" value={number} onChange={(event) => setNumber(event.target.value)} placeholder="Caregiver phone number" aria-label="Yuki's phone number" />
        <DialogFooter><Button variant="outline" onClick={save}>Save number</Button><Button disabled={!savedNumber} onClick={() => { if (savedNumber) window.location.href = `tel:${savedNumber.replace(/[^+0-9]/g, "")}` }}><Phone /> Start call</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CameraStatus({ compact = false }: { compact?: boolean }) {
  const { detections, state } = useLiveCamera()
  const label = state === "live" ? `${detections.length} object${detections.length === 1 ? "" : "s"}` : state === "blocked" ? "Permission needed" : "Starting"
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size={compact ? "sm" : "lg"} className={cn(!compact && "min-h-12")} />}>
        <Camera /> <span className="hidden sm:inline">Camera · </span>{label}
      </DialogTrigger>
      <CameraDialogContent />
    </Dialog>
  )
}

function CameraDialogContent({ expanded = false }: { expanded?: boolean }) {
  return (
    <DialogContent className={cn(expanded && "max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-5xl")}>
      <DialogHeader>
        <DialogTitle>Home camera</DialogTitle>
        <DialogDescription>The camera continuously checks for object movement and possible falls on this device. Closing this view only minimizes it; monitoring continues.</DialogDescription>
      </DialogHeader>
      {expanded ? <div className="grid min-h-0 gap-4 lg:grid-cols-[1.35fr_.65fr]"><LiveCameraPanel /><LocalAnalysisCard /></div> : <LocalAnalysisCard />}
      <DialogFooter><Badge variant="secondary"><ShieldCheck /> Frames stay local unless a significant event is saved</Badge></DialogFooter>
    </DialogContent>
  )
}

function LiveCameraPanel() {
  const { detections, state } = useLiveCamera()
  const stateLabel = state === "live" ? "Live" : state === "blocked" ? "Permission needed" : state === "error" ? "Paused" : "Starting"
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Live camera</CardTitle><CardDescription>{state === "live" ? `${detections.length} current detection${detections.length === 1 ? "" : "s"}` : state === "blocked" ? "Camera permission is required" : "Starting camera and detector"}</CardDescription></div><div className="flex gap-2"><Badge variant="outline">{stateLabel}</Badge><Badge variant="secondary"><ShieldCheck /> Local only</Badge></div></CardHeader>
      <CardContent>
        <LiveCameraView className="min-h-56" />
        <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
          {detections.map((detection) => <Badge key={detection.id} variant="outline">{detection.label} · {Math.round(detection.score * 100)}%</Badge>)}
          {state === "live" && detections.length === 0 && <p className="text-sm text-muted-foreground">No objects above the confidence threshold in this frame.</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function LocalAnalysisCard() {
  const { detections, state } = useLiveCamera()
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Live local analysis</CardTitle><CardDescription>{state === "live" ? `${detections.length} objects in the latest frame` : "Detector is starting"}</CardDescription></div><Badge variant="secondary"><ShieldCheck /> Local only</Badge></CardHeader>
      <CardContent className="space-y-1">
        <StatusRow icon={<Search />} label="Camera awareness" status={state === "live" ? "Active" : state === "blocked" ? "Blocked" : state === "error" ? "Paused" : "Starting"} detail={state === "live" ? `${detections.length} current detection${detections.length === 1 ? "" : "s"}; important changes are remembered` : state === "blocked" ? "Waiting for camera permission" : "Getting the camera ready"} />
        <Separator />
        <StatusRow icon={<Clock3 />} label="Frame privacy" status={state === "live" ? "Active" : "Waiting"} detail="Frames without a confirmed event are not saved" />
      </CardContent>
    </Card>
  )
}

function StatusRow({ icon, label, detail, status }: { icon: React.ReactNode; label: string; detail: string; status: string }) {
  return (
    <div className="flex items-center gap-3 py-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-muted [&_svg]:size-4">{icon}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div><Badge variant="outline">{status}</Badge></div>
  )
}

function VoiceOrb({ state, onActivate, size = "large" }: { state: VoiceState; onActivate: () => void; size?: "small" | "large" }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <Button
        size="icon"
        onClick={onActivate}
        className={cn("rounded-full shadow-md", size === "large" ? "size-32 sm:size-36" : "size-14", state === "listening" && "ring-4 ring-ring/20")}
        aria-label={state === "listening" ? "Finish speaking" : "Start voice conversation"}
      >
        <Mic className={size === "large" ? "size-9" : "size-5"} />
      </Button>
      {size === "large" && <div className="text-center" aria-live="polite"><p className="text-lg font-semibold">{state === "listening" ? "I’m listening" : "Tap to talk"}</p><p className="mt-1 text-sm text-muted-foreground">{state === "listening" ? "Take your time" : "English or Japanese is okay"}</p></div>}
    </div>
  )
}

function TodayCard() {
  const [memory, setMemory] = React.useState<StoredMemory | null>(null)
  React.useEffect(() => {
    const headers = { "x-tomo-household": householdId() }
    void fetch("/api/memories?q=schedule", { headers })
      .then(async (response) => response.ok ? await response.json() as { memories: StoredMemory[] } : { memories: [] })
      .then((payload) => setMemory(payload.memories[0] ?? null))
      .catch(() => setMemory(null))
  }, [])
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><CalendarDays className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-medium">{memory ? "Confirmed plan" : "No confirmed plans yet"}</p><p className="text-sm text-muted-foreground">{memory?.description ?? "A caregiver can add a schedule through Ask TOMO."}</p></div></CardContent>
    </Card>
  )
}

function WeatherCard() {
  const [weather, setWeather] = React.useState<{ temperature: number; guidance: string } | null>(null)
  React.useEffect(() => {
    void fetch("/api/weather").then(async (response) => response.ok ? await response.json() as { weather?: { temperature: number; guidance: string } } : null).then((payload) => {
      if (payload?.weather) setWeather(payload.weather)
    }).catch(() => undefined)
  }, [])
  return (
    <Card size="sm" className="hidden sm:flex"><CardContent className="flex"><CloudSun className="mr-3 size-5" /><div><p className="font-medium">{weather ? `${Math.round(weather.temperature)}° in Tokyo` : "Checking today’s weather"}</p><p className="text-sm text-muted-foreground">{weather?.guidance ?? "Live guidance will appear here."}</p></div></CardContent></Card>
  )
}

function IdleCameraCard() {
  const { detections, state } = useLiveCamera()
  const stateLabel = state === "live" ? "On" : state === "blocked" ? "Permission needed" : state === "error" ? "Paused" : "Starting"
  return (
    <Dialog>
      <div className="relative">
        <Card size="sm">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Home camera</CardTitle><CardDescription>Continuous local monitoring</CardDescription></div><Badge variant="secondary"><ShieldCheck /> {stateLabel}</Badge></CardHeader>
          <CardContent className="space-y-3">
            <LiveCameraView compact className="min-h-28" />
            <p className="text-center text-xs text-muted-foreground">{state === "live" ? `${detections.length} current detection${detections.length === 1 ? "" : "s"}` : "Camera analysis is starting"}</p>
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />Frames without a confirmed event are not saved.</p>
          </CardContent>
        </Card>
        <DialogTrigger render={<Button type="button" variant="ghost" className="absolute inset-0 h-full w-full rounded-4xl bg-transparent p-0 hover:bg-accent/10" aria-label="Expand home camera" />}>
          <span className="sr-only">Expand home camera</span>
        </DialogTrigger>
      </div>
      <CameraDialogContent expanded />
    </Dialog>
  )
}

function PatientHome({ role, onRoleChange, onAsk, onOpenChat }: { role: Role; onRoleChange: (role: Role) => void; onAsk: (query: string) => void; onOpenChat: () => void }) {
  const [voiceState, setVoiceState] = React.useState<VoiceState>("ready")
  const [liveTranscript, setLiveTranscript] = React.useState("")
  const recognitionRef = React.useRef<BrowserSpeechRecognition | null>(null)

  React.useEffect(() => () => recognitionRef.current?.abort(), [])

  function beginVoiceQuestion() {
    if (voiceState === "listening") {
      recognitionRef.current?.stop()
      return
    }

    const speechWindow = window as SpeechRecognitionWindow
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) {
      onOpenChat()
      return
    }

    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.lang = window.localStorage.getItem("tomo-voice-language") ?? (navigator.language.startsWith("ja") ? "ja-JP" : "en-US")
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const results = Array.from(event.results)
      const transcript = results.map((result) => result[0]?.transcript ?? "").join(" ").trim()
      setLiveTranscript(transcript)
      if (results.some((result) => result.isFinal) && transcript) {
        recognitionRef.current = null
        setVoiceState("ready")
        onAsk(transcript)
      }
    }
    recognition.onerror = () => {
      recognitionRef.current = null
      setVoiceState("ready")
    }
    recognition.onend = () => {
      recognitionRef.current = null
      setVoiceState("ready")
    }
    setLiveTranscript("")
    setVoiceState("listening")
    recognition.start()
  }

  return (
    <main className="min-h-dvh bg-muted/30">
      <header><div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"><Brand /><div className="flex items-center gap-2"><LanguageButton /><RoleControl role={role} onRoleChange={onRoleChange} /></div></div></header>
      <section className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-7xl place-items-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(14rem,.7fr)_minmax(24rem,1fr)_minmax(14rem,.7fr)]">
          <div className="order-2 space-y-3 lg:order-1"><p className="text-center text-sm font-medium text-muted-foreground lg:text-left">Today</p><TodayCard /><WeatherCard /></div>
          <div className="order-1 flex flex-col items-center text-center lg:order-2"><Badge variant="outline" className="mb-5 bg-background"><ShieldCheck /> Camera processing locally</Badge><p className="text-sm font-medium text-muted-foreground">Good morning, Keiko</p><h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-[-.055em] sm:text-5xl">What can I help you remember?</h1><div className="my-8"><VoiceOrb state={voiceState} onActivate={beginVoiceQuestion} />{liveTranscript && <p className="mt-5 max-w-lg text-xl" aria-live="polite">“{liveTranscript}”</p>}</div><div className="flex flex-wrap items-center justify-center gap-2"><Button variant="outline" size="lg" className="min-h-12" disabled={!liveTranscript} onClick={() => { if (liveTranscript) onAsk(liveTranscript) }}><Volume2 /> Repeat</Button><Button variant="outline" size="lg" className="min-h-12" onClick={onOpenChat}><MessageCircle /> Type instead</Button><CallYuki prominent /></div></div>
          <div className="order-3 space-y-3"><IdleCameraCard /><div className="flex justify-center"><CameraStatus compact /></div></div>
        </div>
      </section>
    </main>
  )
}

function EvidenceFrame({ evidence }: { evidence: ChatEvidence }) {
  const observed = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(evidence.occurredAt))
  return (
    <Card size="sm" className="w-full">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><CardTitle>Latest supporting frame</CardTitle><CardDescription>Observed {observed}</CardDescription></div><Badge className="shrink-0" variant="secondary"><Camera /> Evidence</Badge></CardHeader>
      <CardContent>
        {evidence.evidenceDataUrl ? (
          <div className="relative aspect-video min-h-52 overflow-hidden rounded-3xl bg-muted">
            {/* Camera evidence is an inline, ephemeral data URL returned by TOMO's own API. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={evidence.evidenceDataUrl} alt={evidence.description} className="size-full object-contain" />
            {evidence.boxes.map((box, index) => (
              <div
                key={`${box.label}-${index}`}
                className="absolute border-2 border-primary bg-primary/5 shadow-[0_0_0_1px_rgba(255,255,255,.8)]"
                style={{ left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.width * 100}%`, height: `${box.height * 100}%` }}
                aria-label={`${box.label} detected with ${Math.round(box.confidence * 100)} percent confidence`}
              >
                <Badge className="absolute left-0 top-0 -translate-y-full whitespace-nowrap">{box.label} · {Math.round(box.confidence * 100)}%</Badge>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex min-h-40 items-center justify-center rounded-3xl bg-muted p-6 text-center"><div><Camera className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 font-medium">No photo was retained</p><p className="mt-1 text-sm text-muted-foreground">The observation is searchable, but no supporting frame was saved.</p></div></div>
        )}
      </CardContent>
    </Card>
  )
}

function TurnActivity({ stage }: { stage: TurnStage }) {
  if (stage === "idle" || stage === "done") return null
  const current = stageIndex[stage]
  const steps = [
    { label: "Understanding your request", detail: "Object and time intent identified", icon: Sparkles },
    { label: "Searching trusted memories", detail: "Checking household records", icon: Database },
    { label: "Retrieving supporting frames", detail: "Comparing recent object evidence", icon: FileSearch },
    { label: "Preparing a grounded answer", detail: "Adding time, confidence, and proof", icon: MessageCircle },
  ]
  return (
    <Card size="sm" aria-live="polite">
      <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Working on it</CardTitle><CardDescription>Operational retrieval status</CardDescription></div><Spinner /></CardHeader>
      <CardContent>
        <Progress value={Math.max(12, (current + 1) * 25)} className="mb-5" />
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon
            const complete = index < current
            const active = index === current
            return (
              <Marker key={step.label} className={cn(!complete && !active && "opacity-45")}>
                <MarkerIcon>{complete ? <CircleCheck /> : active ? <Spinner /> : <Icon />}</MarkerIcon>
                <MarkerContent><span className="block font-medium text-foreground">{step.label}</span><span className="block text-xs">{active ? step.detail : complete ? "Complete" : "Waiting"}</span></MarkerContent>
              </Marker>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

function ChatComposer({ placeholder, onSubmit, patient = false }: { placeholder: string; onSubmit: (query: string) => void; patient?: boolean }) {
  const [draft, setDraft] = React.useState("")
  const [listening, setListening] = React.useState(false)
  const recognitionRef = React.useRef<BrowserSpeechRecognition | null>(null)
  React.useEffect(() => () => recognitionRef.current?.abort(), [])

  function beginVoice() {
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const speechWindow = window as SpeechRecognitionWindow
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition
    if (!Recognition) return
    const recognition = new Recognition()
    recognitionRef.current = recognition
    recognition.lang = window.localStorage.getItem("tomo-voice-language") ?? (navigator.language.startsWith("ja") ? "ja-JP" : "en-US")
    recognition.continuous = false
    recognition.interimResults = true
    recognition.onresult = (event) => {
      const results = Array.from(event.results)
      const transcript = results.map((result) => result[0]?.transcript ?? "").join(" ").trim()
      setDraft(transcript)
      if (results.some((result) => result.isFinal) && transcript) {
        recognitionRef.current = null
        setListening(false)
        onSubmit(transcript)
        setDraft("")
      }
    }
    recognition.onerror = () => { recognitionRef.current = null; setListening(false) }
    recognition.onend = () => { recognitionRef.current = null; setListening(false) }
    setListening(true)
    recognition.start()
  }
  function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    onSubmit(draft)
    setDraft("")
  }
  return (
    <form onSubmit={submit} className="border-t bg-background p-3 sm:p-4">
      <div className="mx-auto flex max-w-4xl items-center gap-2">
        <InputGroup className="h-12 flex-1 rounded-full"><InputGroupInput value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-5 text-base" /><InputGroupAddon align="inline-end"><InputGroupButton type="submit" size="icon-sm" variant="secondary" aria-label="Send message"><ArrowUp /></InputGroupButton></InputGroupAddon></InputGroup>
        <Button type="button" size="icon" className={cn("size-12", patient && "sm:size-14", listening && "ring-4 ring-ring/20")} aria-label={listening ? "Finish speaking" : "Speak instead"} onClick={beginVoice}><Mic /></Button>
      </div>
    </form>
  )
}

function ChatWorkspace({ audience, turn, onBack }: { audience: Role; turn: ChatTurn; onBack: () => void }) {
  const memorySubmitted = /^(remember\b|覚えて|記憶して)/i.test(turn.query)

  React.useEffect(() => {
    if (audience !== "patient" || turn.stage !== "done" || !turn.answer || turn.provider === "error" || !("speechSynthesis" in window)) return
    window.speechSynthesis.cancel()
    const speech = new SpeechSynthesisUtterance(turn.answer)
    speech.lang = /[\u3040-\u30ff\u3400-\u9fff]/.test(turn.answer) ? "ja-JP" : "en-US"
    speech.rate = 0.95
    window.speechSynthesis.speak(speech)
    return () => window.speechSynthesis.cancel()
  }, [audience, turn.answer, turn.provider, turn.stage])

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b bg-background"><div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={onBack} aria-label="Back"><ArrowLeft /></Button><Brand /><Separator orientation="vertical" className="hidden h-7 sm:block" /><div className="hidden sm:block"><p className="text-sm font-medium">Ask TOMO</p><p className="text-xs text-muted-foreground">{audience === "patient" ? "Your conversation" : "Caregiver memory assistant"}</p></div></div><div className="flex items-center gap-2"><CameraStatus compact />{audience === "patient" && <CallYuki />}</div></div></header>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 py-4 sm:px-6">
        {audience === "caregiver" && turn.stage === "idle" && (
          <div className="mb-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => turn.start("What are the most recent safety events?")}><Search /> Find event context</Button><Button variant="outline" onClick={() => turn.start("Where did Keiko leave her glasses?")}><Glasses /> Find an object</Button></div>
        )}
        {audience === "patient" && turn.stage === "idle" && (
          <div className="mb-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => turn.start("Where are my glasses? I want to go outside.")}><Glasses /> Find my glasses</Button><Button variant="outline" onClick={() => turn.start("What do I have to do today?")}><CalendarDays /> What am I doing today?</Button></div>
        )}
        <Card className="min-h-0 flex-1 py-0">
          <MessageScrollerProvider autoScroll scrollPreviousItemPeek={64}>
            <MessageScroller className="min-h-[34rem] flex-1">
              <MessageScrollerViewport>
                <MessageScrollerContent className="mx-auto w-full max-w-4xl p-4 sm:p-8">
                  <MessageScrollerItem messageId="today"><Marker variant="separator"><MarkerContent>Today</MarkerContent></Marker></MessageScrollerItem>
                  {turn.stage === "idle" && (
                    <MessageScrollerItem messageId="welcome">
                      <Message><MessageAvatar><TomoMark className="size-8" /></MessageAvatar><MessageContent><MessageHeader>TOMO</MessageHeader><Bubble variant="ghost" className="w-full"><BubbleContent className="text-lg">{audience === "patient" ? "What would you like to find or remember?" : "Ask about Keiko’s day, retrieve evidence, or add a trusted caregiver memory."}</BubbleContent></Bubble></MessageContent></Message>
                    </MessageScrollerItem>
                  )}
                  {turn.query && (
                    <MessageScrollerItem messageId="user-question" scrollAnchor>
                      <Message align="end"><MessageContent><MessageHeader>{audience === "patient" ? "You" : "Yuki"}</MessageHeader><Bubble variant="secondary" align="end"><BubbleContent className="text-base">{turn.query}</BubbleContent></Bubble></MessageContent></Message>
                    </MessageScrollerItem>
                  )}
                  <MessageScrollerItem messageId="activity"><TurnActivity stage={turn.stage} /></MessageScrollerItem>
                  {turn.stage === "done" && (
                    <MessageScrollerItem messageId="answer" scrollAnchor>
                      <Message><MessageAvatar><TomoMark className="size-8" /></MessageAvatar><MessageContent><MessageHeader>TOMO</MessageHeader><Bubble variant="ghost" className="w-full"><BubbleContent className="w-full space-y-4 text-base">
                        <p>{turn.answer}</p>
                        {memorySubmitted ? <Card size="sm"><CardContent className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-muted"><Database className="size-4" /></span><div><p className="font-medium">{audience === "caregiver" ? "Memory added" : "Sent for approval"}</p><p className="text-sm text-muted-foreground">{audience === "caregiver" ? "Saved as a trusted memory" : "Not searchable until a caregiver approves it"}</p></div><Badge variant="secondary" className="ml-auto">{audience === "caregiver" ? <><Check /> Trusted</> : "Pending"}</Badge></CardContent></Card> : turn.evidence[0] ? <EvidenceFrame evidence={turn.evidence[0]} /> : null}
                      </BubbleContent></Bubble><MessageFooter>{turn.provider ? `${turn.repeated ? "Same latest observation · " : "Latest trusted information · "}${turn.evidenceCount} supporting result${turn.evidenceCount === 1 ? "" : "s"}` : "Grounded response"}</MessageFooter></MessageContent></Message>
                    </MessageScrollerItem>
                  )}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
          <ChatComposer placeholder={audience === "patient" ? "Ask TOMO anything" : "Ask or tell TOMO something"} onSubmit={turn.start} patient={audience === "patient"} />
        </Card>
      </div>
    </div>
  )
}

function CaregiverNav({ current, onChange }: { current: CaregiverView; onChange: (view: CaregiverView) => void }) {
  return (
    <nav className="grid gap-1" aria-label="Caregiver sections">
      <Button variant={current === "inbox" ? "default" : "ghost"} className="h-11 justify-start rounded-2xl" onClick={() => onChange("inbox")}><Bell /> Care inbox</Button>
      <Button variant={current === "chat" ? "default" : "ghost"} className="h-11 justify-start rounded-2xl" onClick={() => onChange("chat")}><MessageCircle /> Ask TOMO</Button>
    </nav>
  )
}

function ApprovalCard({ approval, onResolved }: { approval: StoredApproval | null; onResolved: () => void }) {
  const [busy, setBusy] = React.useState(false)

  async function resolve(state: "approved" | "rejected") {
    if (!approval || busy) return
    setBusy(true)
    try {
      const response = await fetch(`/api/approvals/${approval.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tomo-household": householdId() },
        body: JSON.stringify({ state, resolvedBy: "Yuki" }),
      })
      if (response.ok) onResolved()
    } finally {
      setBusy(false)
    }
  }

  if (!approval) return <Card size="sm"><CardHeader><CardTitle>No pending approvals</CardTitle><CardDescription>Patient-submitted sensitive facts appear here before they enter trusted memory.</CardDescription></CardHeader></Card>
  return (
    <Card size="sm"><CardHeader><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Sensitive memory request</p><CardTitle className="mt-1">Caregiver confirmation required</CardTitle></div><Badge variant="outline">{approval.state}</Badge></div><CardDescription>{approval.statement}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button disabled={busy} onClick={() => void resolve("approved")}><Check /> Approve</Button><Button variant="ghost" disabled={busy} onClick={() => void resolve("rejected")}>Reject</Button></CardContent></Card>
  )
}

function CaregiverInbox({ role, onRoleChange, view, onViewChange }: { role: Role; onRoleChange: (role: Role) => void; view: CaregiverView; onViewChange: (view: CaregiverView) => void }) {
  const [alerts, setAlerts] = React.useState<StoredAlert[]>([])
  const [storedAlert, setStoredAlert] = React.useState<StoredAlert | null>(null)
  const [storedApproval, setStoredApproval] = React.useState<StoredApproval | null>(null)
  const [refreshToken, setRefreshToken] = React.useState(0)
  const alertState: AlertState = storedAlert?.status === "resolved" ? "safe" : storedAlert?.status ?? "open"
  const resolved = alertState === "safe"

  React.useEffect(() => {
    const headers = { "x-tomo-household": householdId() }
    void Promise.all([
      fetch("/api/alerts", { headers }).then(async (response) => response.ok ? await response.json() as { alerts: StoredAlert[] } : { alerts: [] }),
      fetch("/api/approvals", { headers }).then(async (response) => response.ok ? await response.json() as { approvals: StoredApproval[] } : { approvals: [] }),
    ]).then(([alertPayload, approvalPayload]) => {
      const receivedAlerts = alertPayload.alerts
      const possibleFall = receivedAlerts.find((alert) => alert.type === "possible_fall") ?? null
      const pendingApproval = approvalPayload.approvals.find((approval) => approval.state === "pending") ?? null
      setAlerts(receivedAlerts)
      setStoredAlert(possibleFall)
      setStoredApproval(pendingApproval)
    }).catch(() => undefined)
  }, [refreshToken])

  async function updateAlert(status: "checking" | "resolved") {
    if (!storedAlert) return
    const response = await fetch(`/api/alerts/${storedAlert.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-tomo-household": householdId() },
      body: JSON.stringify({ status, actor: "Yuki" }),
    })
    if (response.ok) setStoredAlert((current) => current ? { ...current, status } : current)
  }

  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b"><div className="mx-auto flex min-h-20 max-w-[98rem] items-center justify-between gap-3 px-4 sm:px-6"><Brand /><div className="flex items-center gap-2"><Button variant="outline" onClick={() => onViewChange("chat")}><MessageCircle /> Ask TOMO</Button><RoleControl role={role} onRoleChange={onRoleChange} /><Avatar className="hidden sm:flex"><AvatarFallback>YK</AvatarFallback></Avatar></div></div></header>
      <div className="mx-auto grid max-w-[98rem] lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_20rem_minmax(0,1fr)]">
        <aside className="hidden border-r p-5 lg:block"><CaregiverNav current={view} onChange={onViewChange} /><Card size="sm" className="mt-8"><CardContent><p className="text-sm font-medium">Camera connection</p><p className="mt-1 text-xs text-muted-foreground">Live state appears on the patient device.</p></CardContent></Card></aside>
        <aside className="hidden border-r p-5 xl:block">
          <div className="mb-5 flex items-center justify-between"><h1 className="text-xl font-semibold">Care inbox</h1><Badge variant={alerts.length || storedApproval ? "destructive" : "secondary"}>{alerts.length + (storedApproval ? 1 : 0)} open</Badge></div>
          <div className="grid gap-2">
            {alerts.map((alert) => <Button key={alert.id} type="button" variant={alert.severity === "urgent" ? "destructive" : "outline"} className="h-auto items-stretch rounded-3xl p-4 text-left" onClick={() => { if (alert.type === "possible_fall") setStoredAlert(alert) }}><span className="w-full"><span className="flex items-center justify-between"><Badge variant={alert.severity === "urgent" ? "destructive" : "outline"}>{alert.type.replaceAll("_", " ")}</Badge><span className="text-xs">{new Date(alert.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span></span><span className="mt-3 block font-medium">{alert.title}</span><span className="mt-1 block text-sm">{alert.message}</span></span></Button>)}
            {storedApproval && <Button type="button" variant="outline" className="h-auto items-stretch rounded-3xl p-4 text-left"><span className="w-full"><Badge variant="outline">Approval</Badge><span className="mt-3 block font-medium">Caregiver confirmation needed</span><span className="mt-1 block text-sm text-muted-foreground">{storedApproval.statement}</span></span></Button>}
            {!alerts.length && !storedApproval && <Card size="sm"><CardContent><p className="font-medium">Inbox clear</p><p className="mt-1 text-sm text-muted-foreground">New alerts and approval requests will appear here.</p></CardContent></Card>}
          </div>
        </aside>
        <section className="min-w-0 space-y-5 p-4 sm:p-6">
          {storedAlert ? <>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">Household incident</p><h2 className="text-2xl font-semibold tracking-tight">{storedAlert.title}</h2></div><Badge variant={resolved ? "secondary" : "destructive"}>{resolved ? "Resolved" : "Action recommended"}</Badge></div>
            <div className="grid gap-5 2xl:grid-cols-[1.15fr_.85fr]">
              <Card><CardHeader><CardTitle>Safety evidence</CardTitle><CardDescription>{storedAlert.evidenceKey ? "Evidence reference attached to this alert." : "No photo was retained for this event."}</CardDescription></CardHeader><CardContent><div className="flex min-h-64 items-center justify-center rounded-3xl bg-muted text-center"><div><Camera className="mx-auto size-7 text-muted-foreground" /><p className="mt-3 font-medium">{storedAlert.evidenceKey ? "Evidence stored securely" : "No supporting frame"}</p><p className="mt-1 text-sm text-muted-foreground">{storedAlert.evidenceKey ? "Secure object retrieval will be available when evidence storage is enabled." : "Only the detector event was saved."}</p></div></div></CardContent></Card>
              <div className="space-y-5"><Card className={cn(!resolved && "border-destructive/30")}><CardHeader><div className="flex items-start justify-between gap-3"><span className={cn("flex size-11 items-center justify-center rounded-2xl", resolved ? "bg-secondary" : "bg-destructive/10 text-destructive")}>{resolved ? <CircleCheck /> : <AlertTriangle />}</span><Badge variant={resolved ? "secondary" : "destructive"}>{resolved ? "Safe" : "Urgent"}</Badge></div><CardTitle className="text-2xl">{resolved ? "Marked safe" : alertState === "checking" ? "Caregiver is checking now" : storedAlert.title}</CardTitle><CardDescription>{storedAlert.message}</CardDescription></CardHeader><CardContent className="flex flex-wrap gap-2"><Button className="min-h-12 flex-1" disabled={resolved} onClick={() => void updateAlert("checking")}><UserRound /> I’m checking</Button><Button className="min-h-12 flex-1" variant="secondary" disabled={resolved} onClick={() => void updateAlert("resolved")}><CircleCheck /> Resolve</Button></CardContent></Card><Card><CardHeader><CardTitle>Event record</CardTitle></CardHeader><CardContent><Marker><MarkerIcon><Activity /></MarkerIcon><MarkerContent><span className="block font-medium text-foreground">Alert created by local detector</span><span className="text-xs">{new Date(storedAlert.createdAt).toLocaleString()}</span></MarkerContent></Marker></CardContent></Card></div>
            </div>
          </> : <Card><CardHeader><CardTitle>No possible-fall alerts</CardTitle><CardDescription>The caregiver dashboard is showing live household data. A confirmed local fall event will appear here immediately.</CardDescription></CardHeader><CardContent><div className="flex min-h-56 items-center justify-center rounded-3xl bg-muted text-center"><div><CircleCheck className="mx-auto size-8" /><p className="mt-3 font-medium">Nothing needs attention</p><p className="mt-1 text-sm text-muted-foreground">Only stored household events appear in this view.</p></div></div></CardContent></Card>}
          <ApprovalCard approval={storedApproval} onResolved={() => setRefreshToken((value) => value + 1)} />
        </section>
      </div>
    </main>
  )
}

function TomoExperience() {
  const [role, setRole] = React.useState<Role>("patient")
  const [patientView, setPatientView] = React.useState<PatientView>("home")
  const [caregiverView, setCaregiverView] = React.useState<CaregiverView>("inbox")
  const patientTurn = useChatTurn("patient")
  const caregiverTurn = useChatTurn("caregiver")

  function changeRole(nextRole: Role) {
    setRole(nextRole)
    if (nextRole === "patient") setPatientView("home")
    if (nextRole === "caregiver") setCaregiverView("inbox")
  }

  function askPatient(query: string) {
    setPatientView("chat")
    patientTurn.start(query)
  }

  if (role === "patient") {
    if (patientView === "chat") return <ChatWorkspace audience="patient" turn={patientTurn} onBack={() => { patientTurn.reset(); setPatientView("home") }} />
    return <PatientHome role={role} onRoleChange={changeRole} onAsk={askPatient} onOpenChat={() => { patientTurn.reset(); setPatientView("chat") }} />
  }

  if (caregiverView === "chat") return <ChatWorkspace audience="caregiver" turn={caregiverTurn} onBack={() => { caregiverTurn.reset(); setCaregiverView("inbox") }} />
  return <CaregiverInbox role={role} onRoleChange={changeRole} view={caregiverView} onViewChange={setCaregiverView} />
}

export function TomoExperienceApp() {
  return <LiveCameraProvider><TomoExperience /></LiveCameraProvider>
}
