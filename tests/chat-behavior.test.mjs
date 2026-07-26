import assert from "node:assert/strict"
import test from "node:test"

import { classifyChatIntent, conversationalFallback } from "../lib/shared/chat-intent.ts"
import { copy } from "../lib/shared/tomo-copy.ts"

test("ordinary conversation is not misrouted to memory retrieval", () => {
  assert.equal(classifyChatIntent("Hello, how are you?", "patient").kind, "conversation")
  assert.match(conversationalFallback("Hello, how are you?", "en", "patient"), /hello|here with you/i)
})

test("natural patient context enters caregiver approval", () => {
  const intent = classifyChatIntent("Yuki is my daughter", "patient")
  assert.equal(intent.kind, "memory")
  assert.equal(intent.provenance, "patient")
})

test("natural caregiver context becomes trusted memory", () => {
  const intent = classifyChatIntent("Keiko's daughter is Yuki", "caregiver")
  assert.equal(intent.kind, "memory")
  assert.equal(intent.provenance, "caregiver")
})

test("site copy is available in English and Japanese", () => {
  assert.equal(copy.en.patient, "Patient")
  assert.equal(copy.ja.patient, "患者")
  assert.notEqual(copy.en.askAnything, copy.ja.askAnything)
})
