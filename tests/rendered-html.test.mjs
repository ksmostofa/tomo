import assert from "node:assert/strict"
import { access, readFile, stat } from "node:fs/promises"
import test from "node:test"

const root = new URL("../", import.meta.url)

async function source(path) {
  return readFile(new URL(path, root), "utf8")
}

test("ships the patient and caregiver experience with the approved language", async () => {
  const [layout, ui] = await Promise.all([
    source("app/layout.tsx"),
    source("components/tomo-experience.tsx"),
  ])

  assert.match(layout, /Tomo — A familiar voice\. A trusted connection\./)
  assert.match(ui, /What can I help you remember\?/)
  assert.match(ui, /English or Japanese is okay/)
  assert.match(ui, /Call Yuki/)
  assert.match(ui, /Care inbox/)
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
  assert.match(camera, /10 \* 60_000/)
  assert.ok(objectModel.size > 1_000_000)
  assert.ok(fallModel.size > 1_000_000)
})

test("uses the newest object observation and records repeat-aware retrieval receipts", async () => {
  const chat = await source("app/api/chat/route.ts")
  assert.match(chat, /Date\.parse\(right\.memory\.occurredAt\)/)
  assert.match(chat, /retrieval_answered/)
  assert.match(chat, /previousReceipt\?\.resourceId === primary\.id/)
  assert.match(chat, /Have you still not found it\?/)
  assert.match(chat, /candidates\.length === 0/)
})

test("includes D1-backed API routes and a reproducible Pages build", async () => {
  const [pagesConfig, packageJson] = await Promise.all([
    source("wrangler.jsonc"),
    source("package.json"),
  ])

  assert.match(pagesConfig, /"pages_build_output_dir"/)
  assert.match(pagesConfig, /"binding": "DB"/)
  assert.match(pagesConfig, /"binding": "AI"/)
  assert.match(packageJson, /"build:pages"/)

  await Promise.all([
    access(new URL("app/api/chat/route.ts", root)),
    access(new URL("app/api/memories/route.ts", root)),
    access(new URL("app/api/alerts/route.ts", root)),
    access(new URL("app/api/alerts/[id]/route.ts", root)),
    access(new URL("app/api/approvals/route.ts", root)),
    access(new URL("app/api/weather/route.ts", root)),
  ])
})

test("does not publish private execution plans", async () => {
  await assert.rejects(access(new URL("outputs/tomo-execution-plan.md", root)))
  await assert.rejects(access(new URL("tomo-final-project-plan.md", root)))
  await assert.rejects(access(new URL("public/fall-memory.jpg", root)))
  await assert.rejects(access(new URL("public/glasses-memory.jpg", root)))
})
