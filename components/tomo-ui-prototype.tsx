"use client"

// UI PROTOTYPE — approved composition:
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
  ChevronRight,
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

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
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

type DemoTurn = {
  query: string
  stage: TurnStage
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

function useDemoTurn(): DemoTurn {
  const [query, setQuery] = React.useState("")
  const [stage, setStage] = React.useState<TurnStage>("idle")
  const timers = React.useRef<number[]>([])

  React.useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  function start(nextQuery: string) {
    if (!nextQuery.trim()) return
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setQuery(nextQuery.trim())
    setStage("understanding")
    timers.current.push(window.setTimeout(() => setStage("searching"), 650))
    timers.current.push(window.setTimeout(() => setStage("retrieving"), 1350))
    timers.current.push(window.setTimeout(() => setStage("answering"), 2100))
    timers.current.push(window.setTimeout(() => setStage("done"), 2950))
  }

  function reset() {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setQuery("")
    setStage("idle")
  }

  return { query, stage, start, reset }
}

function TomoMark({ className, square = false }: { className?: string; square?: boolean }) {
  return (
    <Avatar className={cn(className, square && "rounded-2xl")}>
      <AvatarImage src="/tomo-logo.png" alt="TOMO logo" className={cn(square && "rounded-2xl")} />
      <AvatarFallback className={cn(square && "rounded-2xl")}>TO</AvatarFallback>
    </Avatar>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3" aria-label="TOMO home">
      <TomoMark className="size-10" square />
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
        <TabsTrigger value="caregiver" className="relative" aria-label="Caregiver view"><UsersRound /><span className="hidden sm:inline">Caregiver</span><Badge variant="destructive" className="ml-1 px-1.5">1</Badge></TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function LanguageButton() {
  const [language, setLanguage] = React.useState<"EN" | "日本語">("EN")
  return (
    <Button variant="ghost" className="h-10" onClick={() => setLanguage((value) => value === "EN" ? "日本語" : "EN")} aria-label="Switch language">
      <Languages /> {language}
    </Button>
  )
}

function CallYuki({ prominent = false }: { prominent?: boolean }) {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant={prominent ? "default" : "outline"} size="lg" className={cn("min-h-12", prominent && "px-6 text-base")} />}>
        <Phone /> Call Yuki
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Call Yuki?</DialogTitle><DialogDescription>Your daughter is your primary family contact.</DialogDescription></DialogHeader>
        <Card size="sm"><CardContent className="flex items-center gap-4"><Avatar className="size-12"><AvatarFallback>YK</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="font-medium">Yuki Kato</p><p className="text-sm text-muted-foreground">Daughter · Usually answers quickly</p></div><Badge variant="secondary">Available</Badge></CardContent></Card>
        <DialogFooter><Button onClick={() => { window.location.href = "tel:+810000000000" }}><Phone /> Start call</Button></DialogFooter>
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
      <DialogFooter><Button variant="outline"><ShieldCheck /> Privacy settings</Button></DialogFooter>
    </DialogContent>
  )
}

function LiveCameraPanel() {
  const { detections, inferenceMs, runtime, state } = useLiveCamera()
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Live camera</CardTitle><CardDescription>{state === "live" ? `${detections.length} current detection${detections.length === 1 ? "" : "s"}` : "Starting camera and detector"}</CardDescription></div><div className="flex gap-2"><Badge variant="outline">{state === "live" ? "Live" : "Starting"}</Badge><Badge variant="secondary"><ShieldCheck /> Local only</Badge></div></CardHeader>
      <CardContent>
        <LiveCameraView className="min-h-56" />
        <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
          {detections.map((detection) => <Badge key={detection.id} variant="outline">{detection.label} · {Math.round(detection.score * 100)}%</Badge>)}
          {state === "live" && detections.length === 0 && <p className="text-sm text-muted-foreground">No objects above the confidence threshold in this frame.</p>}
          {runtime && <p className="ml-auto text-xs text-muted-foreground">{runtime} · {inferenceMs || "—"} ms</p>}
        </div>
      </CardContent>
    </Card>
  )
}

function LocalAnalysisCard() {
  const { detections, inferenceMs, runtime, state } = useLiveCamera()
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div><CardTitle>Live local analysis</CardTitle><CardDescription>{state === "live" ? `${detections.length} objects in the latest frame` : "Detector is starting"}</CardDescription></div><Badge variant="secondary"><ShieldCheck /> Local only</Badge></CardHeader>
      <CardContent className="space-y-1">
        <StatusRow icon={<Search />} label="YOLO26n object recognition" detail={state === "live" ? `${runtime} · ${inferenceMs || "—"} ms · ${detections.length} detected` : "Loading model and camera"} />
        <Separator />
        <StatusRow icon={<Activity />} label="Fall detection" detail="Active · temporal posture checks" />
        <Separator />
        <StatusRow icon={<Clock3 />} label="Temporary video buffer" detail="Recent seconds in device memory only" />
      </CardContent>
    </Card>
  )
}

function StatusRow({ icon, label, detail }: { icon: React.ReactNode; label: string; detail: string }) {
  return (
    <div className="flex items-center gap-3 py-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-muted [&_svg]:size-4">{icon}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{detail}</p></div><Badge variant="outline">On</Badge></div>
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
  return (
    <Card size="sm">
      <CardContent className="flex items-center gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground"><CalendarDays className="size-5" /></span><div className="min-w-0 flex-1"><p className="font-medium">Community centre with Tanaka-san</p><p className="text-sm text-muted-foreground">Today at 2:00 PM · Leave by 1:35</p></div><ChevronRight className="size-4 text-muted-foreground" /></CardContent>
    </Card>
  )
}

function IdleCameraCard() {
  const { detections, state } = useLiveCamera()
  return (
    <Dialog>
      <div className="relative">
        <Card size="sm">
          <CardHeader className="flex-row items-center justify-between"><div><CardTitle>Home camera</CardTitle><CardDescription>Continuous local monitoring</CardDescription></div><Badge variant="secondary"><ShieldCheck /> {state === "live" ? "On" : "Starting"}</Badge></CardHeader>
          <CardContent className="space-y-3">
            <LiveCameraView compact className="min-h-28" />
            <p className="text-center text-xs text-muted-foreground">{state === "live" ? `${detections.length} current detection${detections.length === 1 ? "" : "s"}` : "YOLO is starting locally"}</p>
            <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground"><LockKeyhole className="mt-0.5 size-3.5 shrink-0" />No-motion video is automatically discarded on this device.</p>
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
  const voiceTimer = React.useRef<number | null>(null)

  React.useEffect(() => () => { if (voiceTimer.current) window.clearTimeout(voiceTimer.current) }, [])

  function beginVoiceQuestion() {
    if (voiceState === "listening") {
      if (voiceTimer.current) window.clearTimeout(voiceTimer.current)
      setVoiceState("ready")
      onAsk("Where are my glasses? I think I have somewhere to go.")
      return
    }
    setVoiceState("listening")
    voiceTimer.current = window.setTimeout(() => {
      setVoiceState("ready")
      onAsk("Where are my glasses? I think I have somewhere to go.")
    }, 1200)
  }

  return (
    <main className="min-h-dvh bg-muted/30">
      <header><div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"><Brand /><div className="flex items-center gap-2"><LanguageButton /><RoleControl role={role} onRoleChange={onRoleChange} /></div></div></header>
      <section className="mx-auto grid min-h-[calc(100dvh-5rem)] max-w-7xl place-items-center px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid w-full items-center gap-8 lg:grid-cols-[minmax(14rem,.7fr)_minmax(24rem,1fr)_minmax(14rem,.7fr)]">
          <div className="order-2 space-y-3 lg:order-1"><p className="text-center text-sm font-medium text-muted-foreground lg:text-left">Today</p><TodayCard /><Card size="sm" className="hidden sm:flex"><CardContent className="flex"><CloudSun className="mr-3 size-5" /><div><p className="font-medium">27° and sunny</p><p className="text-sm text-muted-foreground">Take water when you go out.</p></div></CardContent></Card></div>
          <div className="order-1 flex flex-col items-center text-center lg:order-2"><Badge variant="outline" className="mb-5 bg-background"><ShieldCheck /> Camera processing locally</Badge><p className="text-sm font-medium text-muted-foreground">Good morning, Keiko</p><h1 className="mt-2 max-w-xl text-4xl font-semibold tracking-[-.055em] sm:text-5xl">What can I help you remember?</h1><div className="my-8"><VoiceOrb state={voiceState} onActivate={beginVoiceQuestion} /></div><div className="flex flex-wrap items-center justify-center gap-2"><Button variant="outline" size="lg" className="min-h-12"><Volume2 /> Repeat</Button><Button variant="outline" size="lg" className="min-h-12" onClick={onOpenChat}><MessageCircle /> Type instead</Button><CallYuki prominent /></div></div>
          <div className="order-3 space-y-3"><IdleCameraCard /><div className="flex justify-center"><CameraStatus compact /></div></div>
        </div>
      </section>
    </main>
  )
}

function EvidenceFrame({ kind = "object" }: { kind?: "object" | "fall" }) {
  const isFall = kind === "fall"
  return (
    <Card size="sm" className={cn("w-full", isFall && "border-destructive/30")}>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3"><div className="min-w-0 flex-1"><CardTitle>{isFall ? "Living-room photo proof" : "Retrieved photo proof"}</CardTitle><CardDescription>{isFall ? "10:41:08 · Shared for safety review" : "Entrance · 10:36 · Six minutes ago"}</CardDescription></div><Badge className="shrink-0" variant={isFall ? "destructive" : "secondary"}><Camera /> Evidence</Badge></CardHeader>
      <CardContent>
        <div className="flex aspect-video min-h-52 items-center justify-center rounded-3xl bg-muted/50 p-6">
          <Card size="sm" className={cn("min-w-48 border-2 bg-background", isFall ? "border-destructive" : "border-primary")}>
            <CardContent className="flex flex-col items-center text-center">
              {isFall ? <UserRound className="size-8" /> : <Glasses className="size-8" />}
              <Badge className="mt-3" variant={isFall ? "destructive" : "default"}>{isFall ? "Person low · 82%" : "Glasses · 91%"}</Badge>
              <p className="mt-2 text-xs text-muted-foreground">{isFall ? "12 seconds without movement" : "On the entrance table"}</p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  )
}

function TurnActivity({ stage }: { stage: TurnStage }) {
  if (stage === "idle" || stage === "done") return null
  const current = stageIndex[stage]
  const steps = [
    { label: "Understanding your request", detail: "Object and time intent identified", icon: Sparkles },
    { label: "Searching semantic memory", detail: "Checking trusted household records", icon: Database },
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
        <Button type="button" size="icon" className={cn("size-12", patient && "sm:size-14")} aria-label="Speak instead"><Mic /></Button>
      </div>
    </form>
  )
}

function ChatWorkspace({ audience, turn, onBack }: { audience: Role; turn: DemoTurn; onBack: () => void }) {
  const caregiverSaved = audience === "caregiver" && turn.query.toLowerCase().includes("remember")
  const caregiverFallQuery = audience === "caregiver" && /fall|incident|happened|before/.test(turn.query.toLowerCase())

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <header className="border-b bg-background"><div className="mx-auto flex min-h-20 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"><div className="flex items-center gap-3"><Button variant="ghost" size="icon" onClick={onBack} aria-label="Back"><ArrowLeft /></Button><Brand /><Separator orientation="vertical" className="hidden h-7 sm:block" /><div className="hidden sm:block"><p className="text-sm font-medium">Ask TOMO</p><p className="text-xs text-muted-foreground">{audience === "patient" ? "Your conversation" : "Caregiver memory assistant"}</p></div></div><div className="flex items-center gap-2"><CameraStatus compact />{audience === "patient" && <CallYuki />}</div></div></header>
      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col px-3 py-4 sm:px-6">
        {audience === "caregiver" && turn.stage === "idle" && (
          <div className="mb-4 flex flex-wrap gap-2"><Button variant="outline" onClick={() => turn.start("What happened immediately before the fall?")}><Search /> Find event context</Button><Button variant="outline" onClick={() => turn.start("Remember that Keiko’s blue folder is in the hallway drawer.")}><Database /> Add trusted memory</Button><Button variant="outline" onClick={() => turn.start("Where did Keiko leave her glasses?")}><Glasses /> Find an object</Button></div>
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
                        {caregiverSaved ? <><p>I saved this as a trusted caregiver memory: Keiko’s blue folder is in the hallway drawer.</p><Card size="sm"><CardContent className="flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-2xl bg-muted"><Database className="size-4" /></span><div><p className="font-medium">Memory added</p><p className="text-sm text-muted-foreground">Caregiver-provided · Semantically searchable</p></div><Badge variant="secondary" className="ml-auto"><Check /> Trusted</Badge></CardContent></Card></> : caregiverFallQuery ? <><p>Immediately before the alert, Keiko moved quickly beside the living-room chair and then remained low for 12 seconds.</p><EvidenceFrame kind="fall" /></> : <><p>Your glasses are on the entrance table. You left them there six minutes ago. You’re meeting Tanaka-san at 2:00 PM.</p><EvidenceFrame /></>}
                      </BubbleContent></Bubble><MessageFooter>{caregiverSaved ? "Saved with caregiver provenance" : "Grounded in the latest trusted memory and supporting frame"}</MessageFooter></MessageContent></Message>
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
      <Button variant={current === "inbox" ? "default" : "ghost"} className="h-11 justify-start rounded-2xl" onClick={() => onChange("inbox")}><Bell /> Care inbox <Badge variant="destructive" className="ml-auto">1</Badge></Button>
      <Button variant={current === "chat" ? "default" : "ghost"} className="h-11 justify-start rounded-2xl" onClick={() => onChange("chat")}><MessageCircle /> Ask TOMO</Button>
      <Button variant="ghost" className="h-11 justify-start rounded-2xl"><Search /> Memories</Button>
      <Button variant="ghost" className="h-11 justify-start rounded-2xl"><CalendarDays /> Schedule</Button>
      <Button variant="ghost" className="h-11 justify-start rounded-2xl"><ShieldCheck /> Settings</Button>
    </nav>
  )
}

function ApprovalCard({ state, onStateChange }: { state: ApprovalState; onStateChange: (state: ApprovalState) => void }) {
  return (
    <Card size="sm"><CardHeader><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Sensitive memory request</p><CardTitle className="mt-1">Medicine reminder at 8:00 PM</CardTitle></div><Badge variant={state === "pending" ? "outline" : state === "approved" ? "secondary" : "destructive"}>{state}</Badge></div><CardDescription>Keiko said: “Please remember that I take my medicine at eight.”</CardDescription></CardHeader>{state === "pending" && <CardContent className="flex flex-wrap gap-2"><Button onClick={() => onStateChange("approved")}><Check /> Approve</Button><Button variant="outline">Edit first</Button><Button variant="ghost" onClick={() => onStateChange("rejected")}>Reject</Button></CardContent>}</Card>
  )
}

function CaregiverInbox({ role, onRoleChange, view, onViewChange }: { role: Role; onRoleChange: (role: Role) => void; view: CaregiverView; onViewChange: (view: CaregiverView) => void }) {
  const [alertState, setAlertState] = React.useState<AlertState>("open")
  const [approvalState, setApprovalState] = React.useState<ApprovalState>("pending")
  const resolved = alertState === "safe"

  return (
    <main className="min-h-dvh bg-background">
      <header className="border-b"><div className="mx-auto flex min-h-20 max-w-[98rem] items-center justify-between gap-3 px-4 sm:px-6"><Brand /><div className="flex items-center gap-2"><Button variant="outline" onClick={() => onViewChange("chat")}><MessageCircle /> Ask TOMO</Button><RoleControl role={role} onRoleChange={onRoleChange} /><Avatar className="hidden sm:flex"><AvatarFallback>YK</AvatarFallback></Avatar></div></div></header>
      <div className="mx-auto grid max-w-[98rem] lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_20rem_minmax(0,1fr)]">
        <aside className="hidden border-r p-5 lg:block"><CaregiverNav current={view} onChange={onViewChange} /><Card size="sm" className="mt-8"><CardContent><p className="text-sm font-medium">System healthy</p><p className="mt-1 text-xs text-muted-foreground">Keiko’s device checked in now</p></CardContent></Card></aside>
        <aside className="hidden border-r p-5 xl:block"><div className="mb-5 flex items-center justify-between"><h1 className="text-xl font-semibold">Care inbox</h1><Badge variant="destructive">2 new</Badge></div><div className="grid gap-2"><Button type="button" variant="destructive" className="h-auto items-stretch rounded-3xl p-4 text-left"><span className="w-full"><span className="flex items-center justify-between"><Badge variant="destructive">Possible fall</Badge><span className="text-xs">10:41</span></span><span className="mt-3 block font-medium">Keiko · Living room</span><span className="mt-1 block text-sm">No response after check-in</span></span></Button><Button type="button" variant="outline" className="h-auto items-stretch rounded-3xl p-4 text-left"><span className="w-full"><span className="flex items-center justify-between"><Badge variant="outline">Approval</Badge><span className="text-xs text-muted-foreground">10:18</span></span><span className="mt-3 block font-medium">Medicine reminder</span><span className="mt-1 block text-sm text-muted-foreground">Patient-submitted information</span></span></Button><Button type="button" variant="ghost" className="h-auto items-stretch rounded-3xl border p-4 text-left"><span className="w-full"><span className="flex items-center justify-between"><Badge variant="secondary">Memory</Badge><span className="text-xs text-muted-foreground">10:36</span></span><span className="mt-3 block font-medium">Glasses located</span><span className="mt-1 block text-sm text-muted-foreground">Entrance table</span></span></Button></div></aside>
        <section className="min-w-0 space-y-5 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm text-muted-foreground">Selected incident</p><h2 className="text-2xl font-semibold tracking-tight">Possible fall in the living room</h2></div><Badge variant={resolved ? "secondary" : "destructive"}>{resolved ? "Resolved" : "Action recommended"}</Badge></div><div className="grid gap-5 2xl:grid-cols-[1.15fr_.85fr]"><EvidenceFrame kind="fall" /><div className="space-y-5"><Card className={cn(!resolved && "border-destructive/30")}><CardHeader><div className="flex items-start justify-between gap-3"><span className={cn("flex size-11 items-center justify-center rounded-2xl", resolved ? "bg-secondary" : "bg-destructive/10 text-destructive")}>{resolved ? <CircleCheck /> : <AlertTriangle />}</span><Badge variant={resolved ? "secondary" : "destructive"}>{resolved ? "Safe" : "Urgent"}</Badge></div><CardTitle className="text-2xl">{resolved ? "Keiko was marked safe" : alertState === "checking" ? "Yuki is checking now" : "Possible fall — please check"}</CardTitle><CardDescription>TOMO observed a rapid posture change and 12 seconds without movement.</CardDescription></CardHeader><CardContent className="sticky bottom-4 flex flex-wrap gap-2 rounded-3xl border bg-background/95 p-2 shadow-md backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"><Button className="min-h-12 min-w-32 flex-1" disabled={resolved} onClick={() => setAlertState("checking")}><UserRound /> I’m checking</Button><Button className="min-h-12 min-w-32 flex-1" variant="outline"><Phone /> Call Keiko</Button><Button className="min-h-12 min-w-32 flex-1" variant="secondary" disabled={resolved} onClick={() => setAlertState("safe")}><CircleCheck /> Resolve</Button></CardContent></Card><Card><CardHeader><CardTitle>Detection timeline</CardTitle></CardHeader><CardContent className="space-y-4">{[["10:40:56", "Rapid posture change"], ["10:41:02", "Person remained low"], ["10:41:08", "TOMO asked if Keiko is okay"]].map(([time, text], index) => <Marker key={time}><MarkerIcon>{index === 2 ? <AlertTriangle className="text-destructive" /> : <Activity />}</MarkerIcon><MarkerContent><span className="block font-medium text-foreground">{text}</span><span className="text-xs">{time}</span></MarkerContent></Marker>)}</CardContent></Card></div></div><ApprovalCard state={approvalState} onStateChange={setApprovalState} /></section>
      </div>
    </main>
  )
}

function TomoExperience() {
  const [role, setRole] = React.useState<Role>("patient")
  const [patientView, setPatientView] = React.useState<PatientView>("home")
  const [caregiverView, setCaregiverView] = React.useState<CaregiverView>("inbox")
  const patientTurn = useDemoTurn()
  const caregiverTurn = useDemoTurn()

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

export function TomoUiPrototype() {
  return <LiveCameraProvider><TomoExperience /></LiveCameraProvider>
}
