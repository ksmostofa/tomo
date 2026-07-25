"use client"

import * as React from "react"
import {
  Activity,
  AlertTriangle,
  ArrowUp,
  CalendarDays,
  Camera,
  Check,
  ChevronRight,
  CircleCheck,
  Clock3,
  EyeOff,
  Glasses,
  Headphones,
  HeartHandshake,
  House,
  LockKeyhole,
  MessageCircle,
  Mic,
  Phone,
  ShieldCheck,
  UserRoundCheck,
  UsersRound,
  Wifi,
} from "lucide-react"

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
} from "@/components/ui/attachment"
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
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type VoiceState = "ready" | "listening" | "thinking" | "answered"
type AlertState = "open" | "checking" | "safe"

function Brand() {
  return (
    <div className="flex items-center gap-3" aria-label="Tomo home">
      <span className="flex size-10 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
        <House className="size-5" />
      </span>
      <div>
        <p className="text-lg font-semibold leading-none tracking-tight">Tomo</p>
        <p className="mt-1 hidden text-xs text-muted-foreground sm:block">A familiar voice, close by.</p>
      </div>
    </div>
  )
}

function PrivacyBadge({ cameraOn }: { cameraOn: boolean }) {
  return (
    <Badge variant={cameraOn ? "secondary" : "outline"} className="gap-1.5">
      {cameraOn ? <ShieldCheck className="size-3.5" /> : <EyeOff className="size-3.5" />}
      {cameraOn ? "Local processing" : "Privacy on"}
    </Badge>
  )
}

function EvidenceScene({ compact = false, kind = "object" }: { compact?: boolean; kind?: "object" | "fall" }) {
  const isFall = kind === "fall"
  return (
    <div
      className={`evidence-scene relative overflow-hidden rounded-2xl border ${isFall ? "evidence-scene--fall" : ""} ${compact ? "min-h-52" : "min-h-64 sm:min-h-72"}`}
      aria-label={isFall ? "Living room evidence showing a possible fall" : "Entrance view showing glasses on the table"}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between p-3">
        <Badge className="border-white/10 bg-black/60 text-white">
          <Camera className="size-3.5" /> {isFall ? "Living room" : "Entrance"}
        </Badge>
        <span className="rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">{isFall ? "10:41" : "10:36"}</span>
      </div>
      <div className="scene-door" />
      <div className="scene-plant"><span /><span /><span /></div>
      <div className="scene-table" />
      {isFall && <div className="fall-person" aria-hidden><i /><b /></div>}
      <div className={`evidence-box ${isFall ? "evidence-box--fall" : ""}`}>
        {isFall ? <UserRoundCheck className="size-8 text-white" /> : <Glasses className="size-8 text-white" />}
        <span>{isFall ? "Person low · 82%" : "Glasses · 91%"}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-4 pb-3 pt-10 text-xs font-medium text-white">
        Processed locally · {isFall ? "Shared for review" : "Shared for this answer"}
      </div>
    </div>
  )
}

function ContactDialog() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" size="lg" />}>
        <Phone /> Call Yuki
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Call Yuki?</DialogTitle>
          <DialogDescription>Yuki is your primary family contact.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-3 rounded-2xl bg-muted p-4">
          <Avatar className="size-11"><AvatarFallback>YK</AvatarFallback></Avatar>
          <div><p className="font-medium">Yuki Kato</p><p className="text-sm text-muted-foreground">Daughter · Available</p></div>
        </div>
        <DialogFooter><Button><Phone /> Start call</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ConversationPanel() {
  const [voiceState, setVoiceState] = React.useState<VoiceState>("answered")
  const [draft, setDraft] = React.useState("")
  const timers = React.useRef<number[]>([])

  React.useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  function runTurn() {
    timers.current.forEach(window.clearTimeout)
    timers.current = []
    setVoiceState("listening")
    timers.current.push(window.setTimeout(() => setVoiceState("thinking"), 1000))
    timers.current.push(window.setTimeout(() => setVoiceState("answered"), 1900))
  }

  function submitTurn(event: React.FormEvent) {
    event.preventDefault()
    if (!draft.trim()) return
    setDraft("")
    setVoiceState("thinking")
    timers.current.push(window.setTimeout(() => setVoiceState("answered"), 1000))
  }

  return (
    <Card className="min-h-[42rem] overflow-hidden shadow-sm">
      <CardHeader className="flex-row items-center justify-between border-b py-4">
        <div>
          <CardTitle className="text-base">Conversation</CardTitle>
          <CardDescription>Speak naturally. Interrupt at any time.</CardDescription>
        </div>
        <Badge variant="outline" className="gap-1.5"><LockKeyhole className="size-3.5" /> Private</Badge>
      </CardHeader>
      <CardContent className="flex h-[38rem] flex-col p-0">
        <MessageScrollerProvider>
          <MessageScroller className="flex-1">
            <MessageScrollerViewport>
              <MessageScrollerContent className="gap-6 p-5 sm:p-8">
                <MessageScrollerItem messageId="today-marker">
                  <Marker variant="separator"><MarkerContent>Today</MarkerContent></Marker>
                </MessageScrollerItem>

                <MessageScrollerItem messageId="keiko-question" scrollAnchor>
                  <Message align="end">
                    <MessageContent>
                      <MessageHeader>You</MessageHeader>
                      <Bubble variant="secondary" align="end">
                        <BubbleContent className="text-base">Where are my glasses? I think I have somewhere to go.</BubbleContent>
                      </Bubble>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>

                <MessageScrollerItem messageId="tomo-answer">
                  <Message>
                    <MessageAvatar>
                      <Avatar className="size-8"><AvatarFallback><House className="size-4" /></AvatarFallback></Avatar>
                    </MessageAvatar>
                    <MessageContent>
                      <MessageHeader>Tomo</MessageHeader>
                      <Bubble variant="ghost" className="w-full">
                        <BubbleContent className="w-full space-y-4 text-base">
                          <p>Your glasses are on the entrance table. You’re meeting Tanaka-san at the community centre at 2:00 PM.</p>
                          <EvidenceScene />
                          <Attachment className="w-full" size="sm">
                            <AttachmentMedia><Camera /></AttachmentMedia>
                            <AttachmentContent>
                              <AttachmentTitle>Entrance table</AttachmentTitle>
                              <AttachmentDescription>Seen six minutes ago · Removes tomorrow</AttachmentDescription>
                            </AttachmentContent>
                          </Attachment>
                        </BubbleContent>
                      </Bubble>
                      <MessageFooter>High confidence · 10:36 AM</MessageFooter>
                    </MessageContent>
                  </Message>
                </MessageScrollerItem>

                {voiceState === "listening" && (
                  <MessageScrollerItem messageId="listening-status">
                    <Marker role="status"><MarkerIcon><Mic /></MarkerIcon><MarkerContent>Listening… take your time.</MarkerContent></Marker>
                  </MessageScrollerItem>
                )}
                {voiceState === "thinking" && (
                  <MessageScrollerItem messageId="thinking-status">
                    <Marker role="status"><MarkerIcon><Spinner /></MarkerIcon><MarkerContent>Checking recent activity…</MarkerContent></Marker>
                  </MessageScrollerItem>
                )}
              </MessageScrollerContent>
            </MessageScrollerViewport>
            <MessageScrollerButton />
          </MessageScroller>
        </MessageScrollerProvider>

        <form onSubmit={submitTurn} className="border-t bg-background p-4">
          <div className="flex items-center gap-2">
            <InputGroup className="h-12 flex-1">
              <InputGroupInput value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask Tomo anything" aria-label="Message Tomo" />
              <InputGroupAddon align="inline-end">
                <InputGroupButton type="submit" size="icon-sm" variant="secondary" aria-label="Send message"><ArrowUp /></InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            <Button type="button" size="icon-lg" className="size-12" onClick={runTurn} aria-label={voiceState === "listening" ? "Finish speaking" : "Start speaking"}>
              {voiceState === "thinking" ? <Spinner /> : <Mic />}
            </Button>
          </div>
          <p className="mt-2 text-center text-xs text-muted-foreground">Tomo may be mistaken. Important decisions stay with you and your care circle.</p>
        </form>
      </CardContent>
    </Card>
  )
}

function CompanionView({ cameraOn, onCameraChange }: { cameraOn: boolean; onCameraChange: (value: boolean) => void }) {
  return (
    <div className="grid gap-5 min-[1180px]:grid-cols-[minmax(0,1.5fr)_minmax(19rem,.62fr)]">
      <ConversationPanel />
      <aside className="grid content-start gap-5">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div><CardTitle className="text-2xl">Good morning, Keiko.</CardTitle><CardDescription className="mt-1">Your day is ready.</CardDescription></div>
              <Badge variant="outline">Today</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-3 rounded-2xl bg-muted p-4">
              <CalendarDays className="mt-0.5 size-5 shrink-0" />
              <div><p className="font-medium">Community centre</p><p className="mt-1 text-sm text-muted-foreground">2:00 PM · Tanaka-san</p></div>
            </div>
            <Button variant="ghost" className="mt-3 w-full justify-between">View today <ChevronRight /></Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-muted">{cameraOn ? <ShieldCheck className="size-5" /> : <EyeOff className="size-5" />}</span>
                <div><CardTitle className="text-base">Home camera</CardTitle><CardDescription>{cameraOn ? "Processing stays local" : "Camera is paused"}</CardDescription></div>
              </div>
              <Switch checked={cameraOn} onCheckedChange={onCameraChange} aria-label="Home camera" />
            </div>
          </CardHeader>
          <CardContent><Separator className="mb-4" /><p className="flex items-center gap-2 text-sm text-muted-foreground"><LockKeyhole className="size-4" /> Nothing is shared without a clear reason.</p></CardContent>
        </Card>

        <ContactDialog />
      </aside>
    </div>
  )
}

function StatusItem({ icon, label, detail, warning = false }: { icon: React.ReactNode; label: string; detail: string; warning?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className={`flex size-9 items-center justify-center rounded-xl ${warning ? "bg-destructive/10 text-destructive" : "bg-muted"}`}>{icon}</span>
      <div className="min-w-0 flex-1"><p className="text-sm font-medium">{label}</p><p className="truncate text-xs text-muted-foreground">{detail}</p></div>
      <span className={`size-2 rounded-full ${warning ? "bg-destructive" : "bg-foreground"}`} aria-hidden />
    </div>
  )
}

function CareCircleView({ cameraOn, onCameraChange, alertState, onAlertStateChange }: {
  cameraOn: boolean
  onCameraChange: (value: boolean) => void
  alertState: AlertState
  onAlertStateChange: (value: AlertState) => void
}) {
  const resolved = alertState === "safe"
  return (
    <div className="grid gap-5 min-[1180px]:grid-cols-[minmax(0,1.5fr)_minmax(20rem,.72fr)]">
      <div className="grid content-start gap-5">
        <Card className={resolved ? "overflow-hidden" : "overflow-hidden border-destructive/30"}>
          <div className={`h-1.5 ${resolved ? "bg-primary" : "bg-destructive"}`} />
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex gap-3">
                <span className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${resolved ? "bg-muted" : "bg-destructive/10 text-destructive"}`}>
                  {resolved ? <CircleCheck className="size-6" /> : <AlertTriangle className="size-6" />}
                </span>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Living room · 10:41 AM</p>
                  <CardTitle className="mt-1 text-2xl">{resolved ? "Marked as safe" : alertState === "checking" ? "Yuki is checking" : "Possible fall — please check"}</CardTitle>
                  <CardDescription className="mt-2 max-w-2xl leading-6">Tomo noticed a quick posture change followed by 12 seconds without movement. It cannot confirm an injury.</CardDescription>
                </div>
              </div>
              <Badge variant={resolved ? "secondary" : "destructive"}>{resolved ? "Resolved" : "Check recommended"}</Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-5 lg:grid-cols-[minmax(18rem,1.15fr)_minmax(18rem,.85fr)]">
            <EvidenceScene compact kind="fall" />
            <div className="flex flex-col rounded-2xl bg-muted p-5">
              <div className="flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Confidence</p><p className="mt-1 text-3xl font-semibold">82%</p></div><Badge variant="outline" className="bg-background">Unconfirmed</Badge></div>
              <Progress value={82} className="mt-4" />
              <div className="mt-5 space-y-3 text-sm">
                <p className="flex items-center gap-2"><Check className="size-4" /> Rapid posture change detected</p>
                <p className="flex items-center gap-2"><Check className="size-4" /> No movement for 12 seconds</p>
                <p className="flex items-center gap-2 text-muted-foreground"><Activity className="size-4" /> Tomo asked if Keiko is okay</p>
              </div>
              <Separator className="my-5" />
              <div className="mt-auto grid gap-2">
                <Button disabled={resolved} onClick={() => onAlertStateChange("checking")}><UserRoundCheck /> {alertState === "checking" ? "Checking now" : "I’m checking"}</Button>
                <Button variant="outline" disabled={resolved}><Phone /> Call Keiko</Button>
                <Button variant="secondary" disabled={resolved} onClick={() => onAlertStateChange("safe")}><CircleCheck /> {resolved ? "Marked safe" : "Mark as safe"}</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent activity</CardTitle><CardDescription>Only meaningful events are kept.</CardDescription></CardHeader>
          <CardContent>
            {[
              ["10:41", "Possible fall detected", resolved ? "Marked safe by Yuki" : "Awaiting review", AlertTriangle],
              ["10:36", "Glasses located", "Answered for Keiko", Glasses],
              ["9:05", "Morning check-in", "Keiko said she is doing well", MessageCircle],
            ].map(([time, title, detail, Icon], index) => {
              const RowIcon = Icon as typeof AlertTriangle
              return <React.Fragment key={String(time)}><div className="grid grid-cols-[3.5rem_2.5rem_1fr] items-center gap-3 py-3"><span className="text-sm text-muted-foreground">{String(time)}</span><span className="flex size-9 items-center justify-center rounded-xl bg-muted"><RowIcon className="size-4" /></span><div><p className="text-sm font-medium">{String(title)}</p><p className="text-xs text-muted-foreground">{String(detail)}</p></div></div>{index < 2 && <Separator />}</React.Fragment>
            })}
          </CardContent>
        </Card>
      </div>

      <aside className="grid content-start gap-5">
        <Card>
          <CardHeader><div className="flex items-center justify-between"><div><CardTitle>Keiko’s day</CardTitle><CardDescription>Saturday, 25 July</CardDescription></div><Avatar><AvatarFallback>KK</AvatarFallback></Avatar></div></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-3 rounded-2xl bg-muted p-4"><Clock3 className="mt-0.5 size-5" /><div><p className="font-medium">Community centre</p><p className="text-sm text-muted-foreground">2:00 PM · Tanaka-san</p></div></div>
            <div className="flex gap-3 rounded-2xl border p-4"><HeartHandshake className="mt-0.5 size-5" /><div><p className="font-medium">Yuki is primary contact</p><p className="text-sm text-muted-foreground">Last connected 12 min ago</p></div></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><div className="flex items-center justify-between"><div><CardTitle>Home status</CardTitle><CardDescription>Private by default</CardDescription></div><Switch checked={cameraOn} onCheckedChange={onCameraChange} aria-label="Home camera" /></div></CardHeader>
          <CardContent>
            <StatusItem icon={<Camera className="size-4" />} label="Entrance camera" detail={cameraOn ? "Online · Local processing" : "Paused by Keiko"} warning={!cameraOn} />
            <Separator /><StatusItem icon={<Wifi className="size-4" />} label="Connection" detail="Stable · 42 ms" />
            <Separator /><StatusItem icon={<Headphones className="size-4" />} label="Voice companion" detail="Ready" />
          </CardContent>
        </Card>
      </aside>
    </div>
  )
}

export function TomoPrototype() {
  const [cameraOn, setCameraOn] = React.useState(true)
  const [alertState, setAlertState] = React.useState<AlertState>("open")
  const hasAlert = alertState !== "safe"

  return (
    <main className="min-h-screen bg-muted/30">
      <Tabs defaultValue="companion" className="mx-auto min-h-screen w-full max-w-[96rem] gap-0 px-4 pb-10 sm:px-6 lg:px-8">
        <header className="flex min-h-20 items-center justify-between gap-4 border-b py-4">
          <Brand />
          <div className="flex items-center gap-3">
            <PrivacyBadge cameraOn={cameraOn} />
            <TabsList className="h-11 bg-background shadow-sm ring-1 ring-border">
              <TabsTrigger value="companion" aria-label="Companion" className="h-9 px-4"><MessageCircle /><span className="hidden sm:inline">Companion</span></TabsTrigger>
              <TabsTrigger value="circle" aria-label={hasAlert ? "Care circle, one alert" : "Care circle"} className="h-9 px-4"><UsersRound /><span className="hidden sm:inline">Care circle</span>{hasAlert && <span className="size-2 rounded-full bg-destructive" aria-hidden />}</TabsTrigger>
            </TabsList>
            <Avatar className="hidden sm:flex"><AvatarFallback>YK</AvatarFallback></Avatar>
          </div>
        </header>
        <div className="py-6 sm:py-8">
          <TabsContent value="companion"><CompanionView cameraOn={cameraOn} onCameraChange={setCameraOn} /></TabsContent>
          <TabsContent value="circle"><CareCircleView cameraOn={cameraOn} onCameraChange={setCameraOn} alertState={alertState} onAlertStateChange={setAlertState} /></TabsContent>
        </div>
      </Tabs>
    </main>
  )
}

