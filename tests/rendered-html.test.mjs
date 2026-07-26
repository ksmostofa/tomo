import assert from "node:assert/strict"
import { access, readFile, stat } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), "utf8")
}

test("ships the patient and caregiver experience with the approved language", async () => {
  const [layout, ui, localizedCopy] = await Promise.all([
    source("app/layout.tsx"),
    source("components/tomo-experience.tsx"),
    source("lib/shared/tomo-copy.ts"),
  ])

  assert.match(layout, /Tomo — A familiar voice\. A trusted connection\./)
  assert.match(ui, /How can I help today\?/)
  assert.match(ui, /English or Japanese is okay/)
  assert.match(ui, /Call Yuki/)
  assert.match(localizedCopy, /Care inbox/)
  assert.match(localizedCopy, /ケア受信箱/)
  assert.match(ui, /No possible-fall alerts/)
  assert.doesNotMatch(ui, /tomo-demo-seeded|Example incident|Simulate possible fall|Demo glasses mapping/)
})

test("keeps perception local and includes both detector artifacts", async () => {
  const camera = await source("components/live-camera-provider.tsx")
  const [objectModel, fallModel] = await Promise.all([
    stat(new URL("public/yolo26n.onnx", root)),
    stat(new URL("public/memoria-fall.onnx", root)),
  ])

  assert.match(camera, /onnxruntime-web/)
  assert.match(camera, /yolo26n\.onnx/)
  assert.match(camera, /memoria-fall\.onnx/)
  assert.match(camera, /detectPersonalObjects/)
  assert.match(camera, /positiveVotes\.length >= 4/)
  assert.match(camera, /lastMeaningfulMotionAt/)
  assert.match(camera, /if \(!confirmed && positiveVotes\.length === 0\) alertSent = false/)
  assert.ok(objectModel.size > 1_000_000)
  assert.ok(fallModel.size > 1_000_000)
})

test("declares the Cloudflare Node compatibility flag exactly once", async () => {
  const [vite, wrangler] = await Promise.all([source("vite.config.ts"), source("wrangler.jsonc")])
  const declarations = `${vite}\n${wrangler}`.match(/nodejs_compat/g) ?? []
  assert.equal(declarations.length, 1)
})

test("auth and household forms use explicit submit buttons", async () => {
  const authGate = await source("components/tomo-auth-gate.tsx")
  assert.equal((authGate.match(/<Button type="submit"/g) ?? []).length, 2)
})

test("pairs separate patient and caregiver accounts with expiring single-use invitations", async () => {
  const [invitations, onboarding] = await Promise.all([
    source("convex/invitations.ts"),
    source("components/tomo-auth-gate.tsx"),
  ])
  assert.match(invitations, /tokenHash/)
  assert.match(invitations, /expiresAt/)
  assert.match(invitations, /acceptedAt/)
  assert.match(invitations, /roles: \["caregiver"\]/)
  assert.match(onboarding, /Connect to a patient/)
  assert.match(onboarding, /Generate pairing code/)
})

test("starts the front camera and detector together without exposing implementation details", async () => {
  const [camera, ui] = await Promise.all([
    source("components/live-camera-provider.tsx"),
    source("components/tomo-experience.tsx"),
  ])

  assert.match(camera, /facingMode:\s*\{\s*ideal:\s*"user"\s*\}/)

  const detectorStart = camera.indexOf("const detectorPromise")
  const cameraStart = camera.indexOf("await navigator.mediaDevices.getUserMedia")
  const detectorReady = camera.indexOf("await detectorPromise")
  assert.ok(detectorStart >= 0 && detectorStart < cameraStart, "detector loading must begin before camera negotiation")
  assert.ok(detectorReady > cameraStart, "camera and detector startup must overlap")

  const visibleImplementationDetails = /Starting private YOLO analysis|YOLO26n ·|YOLO26n object recognition|WebGPU ·|WebAssembly ·|Memoria temporal fall model|Provider:|Searchable in D1/
  assert.doesNotMatch(camera, visibleImplementationDetails)
  assert.doesNotMatch(ui, visibleImplementationDetails)
  assert.match(camera, /now - cameraReadyAt >= 3_000/)
  assert.match(camera, /requestIdleCallback/)
  assert.match(camera, /}, 6_000\)/)
})

test("gates fall confirmation on a visible person and stronger fallen evidence", async () => {
  const [camera, ui] = await Promise.all([
    source("components/live-camera-provider.tsx"),
    source("components/tomo-experience.tsx"),
  ])

  assert.match(camera, /uprightScore/)
  assert.match(camera, /fallenScore > uprightScore \+ 0\.08/)
  assert.match(camera, /visiblePerson/)
  assert.match(camera, /rapidPostureChange/)
  assert.match(camera, /geometryFallVotes/)
  assert.doesNotMatch(ui, /label="Glasses and keys"/)
  assert.doesNotMatch(ui, /label="Fall safety"/)
})

test("captures, stores, links, and renders real fall evidence", async () => {
  const [camera, alerts, schema, caregiver, evidence] = await Promise.all([
    readFile(new URL("components/live-camera-provider.tsx", root), "utf8"),
    readFile(new URL("convex/alerts.ts", root), "utf8"),
    readFile(new URL("convex/schema.ts", root), "utf8"),
    readFile(new URL("components/tomo-experience.tsx", root), "utf8"),
    readFile(new URL("convex/evidence.ts", root), "utf8"),
  ])
  assert.match(camera, /new MediaRecorder/)
  assert.match(camera, /fallBoxes/)
  assert.match(camera, /issueEvidenceWrite/)
  assert.match(camera, /openPossibleFall/)
  assert.match(alerts, /evidenceKey/)
  assert.match(alerts, /clipKey/)
  assert.match(schema, /evidenceGrants/)
  assert.match(evidence, /consumedAt/)
  assert.match(caregiver, /storedAlert\.evidenceKey/)
  assert.match(caregiver, /storedAlert\.videoKey/)
})

test("creates fresh fall evidence and uploads the segment containing the confirmation", async () => {
  const [camera, alerts] = await Promise.all([
    source("components/live-camera-provider.tsx"),
    source("convex/alerts.ts"),
  ])
  assert.doesNotMatch(alerts, /deduplicated: true/)
  assert.doesNotMatch(camera, /10 \* 60_000/)
  assert.match(camera, /await nextCompletedClip\(fallConfirmedAt\)/)
  assert.match(camera, /fingerprint: `\$\{userId\}:\$\{fallConfirmedAt\}`/)
})

test("uses the newest object observation and records repeat-aware retrieval receipts", async () => {
  const [chat, receipts, memories] = await Promise.all([source("convex/chat.ts"), source("convex/receipts.ts"), source("convex/memories.ts")])
  assert.match(memories, /by_household_subject_time/)
  assert.match(receipts, /conversationReceipts/)
  assert.match(chat, /previous\.memoryId === primary\._id/)
  assert.match(chat, /Have you not found it yet\?/)
  assert.match(chat, /conversationalFallback/)
  assert.match(chat, /createEmbedding/)
})

test("uses authenticated Convex data and a reproducible Pages build", async () => {
  const [pagesConfig, packageJson] = await Promise.all([
    source("wrangler.jsonc"),
    source("package.json"),
  ])

  assert.match(pagesConfig, /"pages_build_output_dir"/)
  assert.doesNotMatch(pagesConfig, /"binding": "DB"/)
  assert.match(pagesConfig, /"binding": "AI"/)
  assert.match(packageJson, /"build:pages"/)

  await Promise.all([
    access(new URL("convex/chat.ts", root)),
    access(new URL("convex/memories.ts", root)),
    access(new URL("convex/alerts.ts", root)),
    access(new URL("convex/approvals.ts", root)),
    access(new URL("app/api/weather/route.ts", root)),
  ])
})

test("keeps household evidence private and uncacheable", async () => {
  const [evidence, grants, convexAlerts, convexMemories] = await Promise.all([
    source("app/api/evidence/route.ts"),
    source("convex/evidence.ts"),
    source("convex/alerts.ts"),
    source("convex/memories.ts"),
  ])
  assert.match(evidence, /consumeGrant\(request, "read"\)/)
  assert.match(evidence, /consumeGrant\(request, "write"\)/)
  assert.match(evidence, /private, no-store, max-age=0/)
  assert.match(evidence, /X-Content-Type-Options/)
  assert.match(grants, /requireMembership/)
  assert.match(grants, /args\.objectKey\.startsWith\(`\$\{args\.householdId\}\//)
  assert.match(convexAlerts, /requireMembership/)
  assert.match(convexMemories, /requireMembership/)
})

test("does not publish private execution plans", async () => {
  await assert.rejects(access(new URL("outputs/tomo-execution-plan.md", root)))
  await assert.rejects(access(new URL("tomo-final-project-plan.md", root)))
  await assert.rejects(access(new URL("public/fall-memory.jpg", root)))
  await assert.rejects(access(new URL("public/glasses-memory.jpg", root)))
})
