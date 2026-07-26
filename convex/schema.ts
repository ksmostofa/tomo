import { defineSchema, defineTable } from "convex/server"
import { v } from "convex/values"

const role = v.union(v.literal("patient"), v.literal("caregiver"))
const evidenceBox = v.object({
  label: v.string(),
  confidence: v.number(),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
})

export default defineSchema({
  households: defineTable({
    name: v.string(),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_creator", ["createdBy"]),

  memberships: defineTable({
    householdId: v.id("households"),
    userId: v.string(),
    roles: v.array(role),
    displayName: v.string(),
    email: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_household", ["householdId"])
    .index("by_household_user", ["householdId", "userId"]),

  invitations: defineTable({
    householdId: v.id("households"),
    tokenHash: v.string(),
    roles: v.array(role),
    createdBy: v.string(),
    expiresAt: v.number(),
    acceptedAt: v.optional(v.number()),
  })
    .index("by_token_hash", ["tokenHash"])
    .index("by_household", ["householdId"]),

  memories: defineTable({
    householdId: v.id("households"),
    patientUserId: v.string(),
    eventType: v.union(v.literal("object_placement"), v.literal("activity"), v.literal("routine"), v.literal("safety"), v.literal("profile")),
    subjectKey: v.optional(v.string()),
    description: v.string(),
    searchText: v.string(),
    objectLabels: v.array(v.string()),
    boxes: v.array(evidenceBox),
    occurredAt: v.number(),
    bestFrameKey: v.optional(v.string()),
    clipKey: v.optional(v.string()),
    embedding: v.optional(v.array(v.float64())),
    embeddingModel: v.optional(v.string()),
    provenance: v.union(v.literal("camera"), v.literal("patient"), v.literal("caregiver")),
    approvalState: v.union(v.literal("trusted"), v.literal("pending"), v.literal("rejected")),
    supersedesId: v.optional(v.id("memories")),
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_household_time", ["householdId", "occurredAt"])
    .index("by_household_subject_time", ["householdId", "subjectKey", "occurredAt"])
    .index("by_household_approval", ["householdId", "approvalState"])
    .searchIndex("search_text", { searchField: "searchText", filterFields: ["householdId", "approvalState", "eventType"] })
    .vectorIndex("by_embedding", { vectorField: "embedding", dimensions: 1024, filterFields: ["householdId", "approvalState", "eventType"] }),

  alerts: defineTable({
    householdId: v.id("households"),
    patientUserId: v.string(),
    fingerprint: v.string(),
    type: v.union(v.literal("possible_fall"), v.literal("sensitive_memory"), v.literal("reminder")),
    severity: v.union(v.literal("info"), v.literal("important"), v.literal("urgent")),
    status: v.union(v.literal("open"), v.literal("checking"), v.literal("resolved")),
    title: v.string(),
    message: v.string(),
    evidenceKey: v.optional(v.string()),
    clipKey: v.optional(v.string()),
    boxes: v.array(evidenceBox),
    createdAt: v.number(),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_household_time", ["householdId", "createdAt"])
    .index("by_household_status", ["householdId", "status"])
    .index("by_household_fingerprint", ["householdId", "fingerprint"]),

  approvals: defineTable({
    householdId: v.id("households"),
    memoryId: v.id("memories"),
    statement: v.string(),
    state: v.union(v.literal("pending"), v.literal("approved"), v.literal("rejected")),
    submittedBy: v.string(),
    submittedAt: v.number(),
    resolvedBy: v.optional(v.string()),
    resolvedAt: v.optional(v.number()),
  })
    .index("by_household_state", ["householdId", "state"])
    .index("by_memory", ["memoryId"]),

  schedules: defineTable({
    householdId: v.id("households"),
    patientUserId: v.string(),
    title: v.string(),
    startsAt: v.number(),
    reminderAt: v.optional(v.number()),
    status: v.union(v.literal("scheduled"), v.literal("done"), v.literal("cancelled")),
    createdBy: v.string(),
    createdAt: v.number(),
  }).index("by_household_start", ["householdId", "startsAt"]),

  conversationReceipts: defineTable({
    householdId: v.id("households"),
    userId: v.string(),
    subjectKey: v.optional(v.string()),
    question: v.string(),
    answer: v.string(),
    memoryId: v.optional(v.id("memories")),
    createdAt: v.number(),
  })
    .index("by_household_user_time", ["householdId", "userId", "createdAt"])
    .index("by_household_user_subject", ["householdId", "userId", "subjectKey"]),

  evidenceGrants: defineTable({
    householdId: v.id("households"),
    userId: v.string(),
    tokenHash: v.string(),
    operation: v.union(v.literal("read"), v.literal("write")),
    objectKey: v.string(),
    contentType: v.optional(v.string()),
    expiresAt: v.number(),
    consumedAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_token_hash", ["tokenHash"]),

  deviceStates: defineTable({
    householdId: v.id("households"),
    deviceId: v.string(),
    room: v.string(),
    privacyMode: v.union(v.literal("private"), v.literal("local"), v.literal("helping"), v.literal("sharing")),
    online: v.boolean(),
    lastHeartbeatAt: v.number(),
  })
    .index("by_household", ["householdId"])
    .index("by_household_device", ["householdId", "deviceId"]),

  notificationDeliveries: defineTable({
    householdId: v.id("households"),
    resourceId: v.string(),
    channel: v.union(v.literal("in_app"), v.literal("email"), v.literal("push")),
    idempotencyKey: v.string(),
    status: v.union(v.literal("queued"), v.literal("sent"), v.literal("failed"), v.literal("dead_letter")),
    attempts: v.number(),
    lastErrorCode: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_resource", ["resourceId"])
    .index("by_idempotency", ["idempotencyKey"]),

  auditEvents: defineTable({
    householdId: v.id("households"),
    actorUserId: v.string(),
    action: v.string(),
    resourceType: v.string(),
    resourceId: v.string(),
    metadata: v.any(),
    createdAt: v.number(),
  }).index("by_household_time", ["householdId", "createdAt"]),
})
