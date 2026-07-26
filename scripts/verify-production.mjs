import assert from "node:assert/strict"

const baseUrl = (process.env.TOMO_BASE_URL || "https://tomo-memoria.pages.dev").replace(/\/$/, "")
const household = `verify_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`
const isolatedHousehold = `${household}_other`
const results = []

console.log(`Verification household: ${household}`)

async function request(path, options = {}) {
  const attempts = 3
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...options,
        signal: AbortSignal.timeout(30_000),
        headers: {
          ...(options.body ? { "content-type": "application/json" } : {}),
          "x-tomo-household": household,
          ...options.headers,
        },
      })
      const payload = await response.json().catch(() => null)
      return { response, payload }
    } catch (error) {
      if (attempt === attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }
  throw new Error("Request retry loop ended unexpectedly")
}

async function check(name, run) {
  const startedAt = performance.now()
  await run()
  results.push({ name, milliseconds: Math.round(performance.now() - startedAt) })
  console.log(`PASS ${name}`)
}

await check("provider health", async () => {
  const { response, payload } = await request("/api/health")
  assert.equal(response.status, 200)
  assert.equal(payload.ready, true)
  assert.equal(payload.providers.database, true)
  assert.equal(payload.providers.cloudflareQwen || payload.providers.qwen, true)
})

await check("weather guidance", async () => {
  const { response, payload } = await request("/api/weather?latitude=35.6762&longitude=139.6503")
  assert.equal(response.status, 200)
  assert.equal(typeof payload.weather.temperature, "number")
  assert.equal(typeof payload.weather.guidance, "string")
})

const tinyJpeg = "data:image/jpeg;base64,/9j/2Q=="
const oldTime = new Date(Date.now() - 30 * 60_000).toISOString()
const newTime = new Date().toISOString()

await check("camera memory writes with evidence and boxes", async () => {
  const oldMemory = await request("/api/memories", {
    method: "POST",
    body: JSON.stringify({
      description: "Glasses were last seen on the bedroom desk.",
      objectLabels: ["glasses", "desk"],
      occurredAt: oldTime,
      evidenceDataUrl: tinyJpeg,
      boxes: [{ label: "Glasses", confidence: 0.91, x: 0.2, y: 0.2, width: 0.3, height: 0.2 }],
      importance: "important",
      provenance: "camera",
    }),
  })
  assert.equal(oldMemory.response.status, 201)
  assert.equal(oldMemory.payload.memory.approvalState, "trusted")

  const newMemory = await request("/api/memories", {
    method: "POST",
    body: JSON.stringify({
      description: "Glasses were last seen beside the plant on the entrance table.",
      objectLabels: ["glasses", "dining table"],
      occurredAt: newTime,
      evidenceDataUrl: tinyJpeg,
      boxes: [{ label: "Glasses", confidence: 0.94, x: 0.55, y: 0.3, width: 0.2, height: 0.16 }],
      importance: "important",
      provenance: "camera",
    }),
  })
  assert.equal(newMemory.response.status, 201)
})

await check("newest object retrieval and repeat awareness", async () => {
  const first = await request("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Where did I leave my spectacles?", locale: "en", audience: "patient" }),
  })
  assert.equal(first.response.status, 200)
  assert.match(first.payload.answer, /entrance table/i)
  assert.equal(first.payload.repeated, false)
  assert.equal(first.payload.evidence[0].occurredAt, newTime)
  assert.equal(first.payload.evidence[0].boxes[0].label, "Glasses")

  const repeated = await request("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "I still cannot find my glasses", locale: "en", audience: "patient" }),
  })
  assert.equal(repeated.response.status, 200)
  assert.equal(repeated.payload.repeated, true)
  assert.match(repeated.payload.answer, /still not found/i)

  const japanese = await request("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "メガネはどこですか？", locale: "ja", audience: "patient" }),
  })
  assert.equal(japanese.response.status, 200)
  assert.equal(japanese.payload.evidence[0].occurredAt, newTime)
})

let approvalId = ""
const sensitivePhrase = `Medicine code ${crypto.randomUUID().slice(0, 8)} should be taken at 8 PM.`

await check("patient memory is withheld until caregiver approval", async () => {
  const pending = await request("/api/memories", {
    method: "POST",
    body: JSON.stringify({ description: sensitivePhrase, importance: "safety", provenance: "patient" }),
  })
  assert.equal(pending.response.status, 201)
  assert.equal(pending.payload.requiresApproval, true)

  const before = await request(`/api/memories?q=${encodeURIComponent(sensitivePhrase)}`)
  assert.equal(before.response.status, 200)
  assert.equal(before.payload.memories.length, 0)

  const approvals = await request("/api/approvals")
  assert.equal(approvals.response.status, 200)
  const match = approvals.payload.approvals.find((approval) => approval.statement === sensitivePhrase)
  assert.ok(match)
  approvalId = match.id

  const approved = await request(`/api/approvals/${approvalId}`, {
    method: "PATCH",
    body: JSON.stringify({ state: "approved", resolvedBy: "production-verifier" }),
  })
  assert.equal(approved.response.status, 200)

  const after = await request(`/api/memories?q=${encodeURIComponent(sensitivePhrase)}`)
  assert.equal(after.response.status, 200)
  assert.equal(after.payload.memories.length, 1)
  assert.equal(after.payload.memories[0].approvalState, "trusted")
})

await check("semantic retrieval uses trusted memory", async () => {
  const relation = await request("/api/memories", {
    method: "POST",
    body: JSON.stringify({
      description: "Yuki is Keiko's daughter and primary caregiver.",
      objectLabels: ["family", "caregiver"],
      importance: "important",
      provenance: "caregiver",
    }),
  })
  assert.equal(relation.response.status, 201)

  const answer = await request("/api/chat", {
    method: "POST",
    body: JSON.stringify({ message: "Who is Keiko's child?", locale: "en", audience: "patient" }),
  })
  assert.equal(answer.response.status, 200)
  assert.ok(answer.payload.evidence.some((memory) => /Yuki/.test(memory.description)))
  assert.match(answer.payload.answer, /Yuki/i)
})

await check("household isolation", async () => {
  const { response, payload } = await request("/api/chat", {
    method: "POST",
    headers: { "x-tomo-household": isolatedHousehold },
    body: JSON.stringify({ message: "Where are the glasses?", locale: "en", audience: "patient" }),
  })
  assert.equal(response.status, 200)
  assert.equal(payload.evidence.length, 0)
})

await check("fall alert deduplication and resolution", async () => {
  const body = JSON.stringify({
    type: "possible_fall",
    severity: "urgent",
    title: "Possible fall — please check",
    message: "Production verification alert",
  })
  const created = await request("/api/alerts", { method: "POST", body })
  assert.ok(created.response.status === 201 || created.response.status === 200)
  const alertId = created.payload.alert.id

  const duplicate = await request("/api/alerts", { method: "POST", body })
  assert.equal(duplicate.response.status, 200)
  assert.equal(duplicate.payload.deduplicated, true)
  assert.equal(duplicate.payload.alert.id, alertId)

  const checking = await request(`/api/alerts/${alertId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "checking", actor: "production-verifier" }),
  })
  assert.equal(checking.response.status, 200)
  assert.equal(checking.payload.alert.status, "checking")

  const resolved = await request(`/api/alerts/${alertId}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "resolved", actor: "production-verifier" }),
  })
  assert.equal(resolved.response.status, 200)
  assert.equal(resolved.payload.alert.status, "resolved")
})

await check("evidence validation", async () => {
  const invalid = await request("/api/memories", {
    method: "POST",
    body: JSON.stringify({
      description: "Invalid evidence test",
      evidenceDataUrl: "data:text/plain;base64,SGVsbG8=",
      provenance: "camera",
    }),
  })
  assert.equal(invalid.response.status, 413)
})

console.log(JSON.stringify({ ok: true, baseUrl, household, checks: results }, null, 2))
