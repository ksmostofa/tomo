"use client"

import * as React from "react"
import { useMutation, useQuery } from "convex/react"
import { Copy, HeartHandshake, LoaderCircle, LogOut, ShieldCheck, UserRound, UsersRound } from "lucide-react"

import { api } from "@/convex/_generated/api"
import type { Id } from "@/convex/_generated/dataModel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { authClient } from "@/lib/client/auth-client"
import { TomoHouseholdProvider } from "./tomo-household-context"

import { TomoExperienceApp } from "./tomo-experience"

function AccountForm({ mode }: { mode: "sign-in" | "sign-up" }) {
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = mode === "sign-up"
        ? await authClient.signUp.email({ name: name.trim(), email: email.trim(), password })
        : await authClient.signIn.email({ email: email.trim(), password })
      if (result.error) setError(result.error.message ?? "TOMO could not complete that request.")
    } catch {
      setError("TOMO could not reach the account service. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return <form onSubmit={submit} className="space-y-4">
    {mode === "sign-up" && <Input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" placeholder="Your name" aria-label="Your name" required />}
    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="Email" aria-label="Email" required />
    <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "sign-up" ? "new-password" : "current-password"} placeholder="Password" aria-label="Password" minLength={8} required />
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <Button type="submit" className="w-full" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{mode === "sign-up" ? "Create account" : "Sign in"}</Button>
  </form>
}

function AccountScreen() {
  return <main className="flex min-h-svh items-center justify-center bg-background p-4">
    <Card className="w-full max-w-md">
      <CardHeader className="items-center text-center">
        <span className="flex size-14 items-center justify-center rounded-3xl bg-primary text-primary-foreground"><HeartHandshake /></span>
        <CardTitle className="text-3xl">Welcome to TOMO</CardTitle>
        <CardDescription>One familiar place for patients and trusted caregivers.</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="sign-in">
          <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="sign-in">Sign in</TabsTrigger><TabsTrigger value="sign-up">Create account</TabsTrigger></TabsList>
          <TabsContent value="sign-in" className="pt-4"><AccountForm mode="sign-in" /></TabsContent>
          <TabsContent value="sign-up" className="pt-4"><AccountForm mode="sign-up" /></TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="justify-center"><Badge variant="secondary"><ShieldCheck /> Private household access</Badge></CardFooter>
    </Card>
  </main>
}

function HouseholdSetup() {
  const createHousehold = useMutation(api.households.create)
  const acceptInvite = useMutation(api.invitations.acceptCaregiverInvite)
  const [displayName, setDisplayName] = React.useState("")
  const [householdName, setHouseholdName] = React.useState("Our TOMO home")
  const [role, setRole] = React.useState<"patient" | "caregiver" | null>(null)
  const [pairingCode, setPairingCode] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (role === "patient") await createHousehold({ householdName, displayName, initialRole: "patient" })
      else if (role === "caregiver") await acceptInvite({ code: pairingCode, displayName })
    } catch {
      setError(role === "caregiver" ? "That pairing code is invalid, expired, or already used." : "TOMO could not create the household. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return <main className="flex min-h-svh items-center justify-center bg-background p-4"><Card className="w-full max-w-lg">
    <CardHeader><CardTitle>{role ? role === "patient" ? "Set up the patient device" : "Connect to a patient" : "Who is using TOMO?"}</CardTitle><CardDescription>{role ? role === "patient" ? "Create a private home, then pair the caregiver’s separate device." : "Enter the single-use code shown on the patient’s device." : "Choose the role for this account and device."}</CardDescription></CardHeader>
    <CardContent><form onSubmit={submit} className="space-y-4">
      {!role ? <div className="grid gap-3 sm:grid-cols-2"><Button type="button" variant="outline" className="h-28 flex-col rounded-3xl" onClick={() => setRole("patient")}><UserRound className="size-7" />I’m the patient</Button><Button type="button" variant="outline" className="h-28 flex-col rounded-3xl" onClick={() => setRole("caregiver")}><UsersRound className="size-7" />I’m a caregiver</Button></div> : <>
        <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Your name" aria-label="Your display name" required />
        {role === "patient" ? <Input value={householdName} onChange={(event) => setHouseholdName(event.target.value)} placeholder="Household name" aria-label="Household name" required /> : <Input value={pairingCode} onChange={(event) => setPairingCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 8))} placeholder="8-character pairing code" aria-label="Pairing code" minLength={8} required />}
      </>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {role && <div className="flex gap-2"><Button type="button" variant="outline" onClick={() => { setRole(null); setError(null) }}>Back</Button><Button type="submit" className="flex-1" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{role === "patient" ? "Create TOMO home" : "Connect to patient"}</Button></div>}
    </form></CardContent>
    <CardFooter><Button variant="ghost" onClick={() => void authClient.signOut()}><LogOut /> Sign out</Button></CardFooter>
  </Card></main>
}

function PairingDock({ householdId }: { householdId: Id<"households"> }) {
  const createInvite = useMutation(api.invitations.createCaregiverInvite)
  const [invite, setInvite] = React.useState<{ code: string; expiresAt: number } | null>(null)
  const [open, setOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function generate() {
    setBusy(true)
    try { setInvite(await createInvite({ householdId })) } finally { setBusy(false) }
  }

  return <div className="fixed bottom-4 right-4 z-50">
    {open ? <Card className="w-[min(24rem,calc(100vw-2rem))] shadow-lg"><CardHeader><CardTitle>Pair a caregiver device</CardTitle><CardDescription>On the caregiver’s device, choose “I’m a caregiver” and enter this one-time code.</CardDescription></CardHeader><CardContent className="space-y-3">{invite ? <><div className="rounded-3xl bg-muted p-5 text-center font-mono text-3xl font-semibold tracking-[.2em]">{invite.code}</div><p className="text-center text-xs text-muted-foreground">Expires in 10 minutes and can be used once.</p><Button className="w-full" variant="outline" onClick={() => void navigator.clipboard.writeText(invite.code)}><Copy /> Copy code</Button></> : <Button className="w-full" disabled={busy} onClick={() => void generate()}>{busy && <LoaderCircle className="animate-spin" />}Generate pairing code</Button>}</CardContent><CardFooter><Button variant="ghost" onClick={() => setOpen(false)}>Close</Button></CardFooter></Card> : <Button className="shadow-lg" onClick={() => setOpen(true)}><UsersRound /> Pair caregiver</Button>}
  </div>
}

function AuthenticatedApp({ userId }: { userId: string }) {
  const households = useQuery(api.households.mine)
  if (households === undefined) return <main className="flex min-h-svh items-center justify-center"><LoaderCircle className="size-7 animate-spin" aria-label="Loading TOMO" /></main>
  if (households.length === 0) return <HouseholdSetup />
  const active = households[0]
  if (!active.household) return null
  return <TomoHouseholdProvider value={{ householdId: active.household._id, userId, roles: active.membership.roles, displayName: active.membership.displayName }}><TomoExperienceApp />{active.membership.roles.includes("patient") && <PairingDock householdId={active.household._id} />}</TomoHouseholdProvider>
}

export function TomoAuthGate() {
  const session = authClient.useSession()
  if (session.isPending) return <main className="flex min-h-svh items-center justify-center"><LoaderCircle className="size-7 animate-spin" aria-label="Checking account" /></main>
  if (!session.data) return <AccountScreen />
  return <AuthenticatedApp userId={session.data.user.id} />
}
