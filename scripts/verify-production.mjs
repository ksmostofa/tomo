import assert from "node:assert/strict"

const baseUrl = (process.env.PRODUCTION_URL || process.env.TOMO_BASE_URL || "https://tomocare-1mv.pages.dev").replace(/\/$/, "")
const results = []

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...options, signal: AbortSignal.timeout(30_000), redirect: "follow" })
  const payload = await response.json().catch(() => null)
  return { response, payload }
}

async function check(name, run) {
  const started = performance.now()
  await run()
  results.push({ name, milliseconds: Math.round(performance.now() - started) })
  console.log(`PASS ${name}`)
}

await check("application shell", async () => {
  const response = await fetch(baseUrl, { signal: AbortSignal.timeout(30_000) })
  assert.equal(response.status, 200)
  assert.match(await response.text(), /tomo/i)
})

await check("provider health", async () => {
  const { response, payload } = await request("/api/health")
  assert.equal(response.status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.providers.database, true)
  assert.equal(payload.providers.evidenceStorage, true)
  assert.equal(payload.providers.cloudflareQwen, true)
})

await check("weather guidance", async () => {
  const { response, payload } = await request("/api/weather?latitude=35.6762&longitude=139.6503")
  assert.equal(response.status, 200)
  assert.equal(typeof payload.weather.temperature, "number")
  assert.equal(typeof payload.weather.guidance, "string")
})

await check("AI gateway rejects public traffic", async () => {
  const { response } = await request("/api/inference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation: "chat", text: "hello" }) })
  assert.equal(response.status, 403)
})

await check("evidence gateway rejects public traffic", async () => {
  const { response } = await request("/api/evidence")
  assert.equal(response.status, 401)
})

console.log(JSON.stringify({ baseUrl, passed: results.length, results }, null, 2))
