import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const households = sqliteTable("households", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull().default("TOMO household"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  description: text("description").notNull(),
  objectLabels: text("object_labels", { mode: "json" }).$type<string[]>().notNull().default([]),
  occurredAt: text("occurred_at").notNull(),
  bestFrameKey: text("best_frame_key"),
  videoKey: text("video_key"),
  boxes: text("boxes", { mode: "json" }).$type<Array<{
    label: string;
    confidence: number;
    x: number;
    y: number;
    width: number;
    height: number;
  }>>().notNull().default([]),
  embedding: text("embedding", { mode: "json" }).$type<number[]>(),
  embeddingModel: text("embedding_model"),
  importance: text("importance", { enum: ["routine", "important", "safety"] }).notNull().default("routine"),
  approvalState: text("approval_state", { enum: ["trusted", "pending", "rejected"] }).notNull().default("pending"),
  provenance: text("provenance", { enum: ["camera", "patient", "caregiver"] }).notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("memories_household_time_idx").on(table.householdId, table.occurredAt),
  index("memories_household_approval_idx").on(table.householdId, table.approvalState),
]);

export const approvals = sqliteTable("approvals", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  memoryId: text("memory_id").notNull().unique().references(() => memories.id),
  statement: text("statement").notNull(),
  state: text("state", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  submittedAt: text("submitted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: text("resolved_at"),
  resolvedBy: text("resolved_by"),
}, (table) => [index("approvals_household_state_idx").on(table.householdId, table.state)]);

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  householdId: text("household_id").notNull().references(() => households.id),
  type: text("type", { enum: ["possible_fall", "sensitive_memory", "reminder"] }).notNull(),
  severity: text("severity", { enum: ["info", "important", "urgent"] }).notNull(),
  status: text("status", { enum: ["open", "checking", "resolved"] }).notNull().default("open"),
  title: text("title").notNull(),
  message: text("message").notNull(),
  evidenceKey: text("evidence_key"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  resolvedAt: text("resolved_at"),
}, (table) => [index("alerts_household_status_idx").on(table.householdId, table.status)]);

export const auditEvents = sqliteTable("audit_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  householdId: text("household_id").notNull(),
  actor: text("actor").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_household_time_idx").on(table.householdId, table.createdAt)]);
