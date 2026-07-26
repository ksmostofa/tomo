/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as alerts from "../alerts.js";
import type * as approvals from "../approvals.js";
import type * as auth from "../auth.js";
import type * as chat from "../chat.js";
import type * as embeddings from "../embeddings.js";
import type * as evidence from "../evidence.js";
import type * as households from "../households.js";
import type * as http from "../http.js";
import type * as invitations from "../invitations.js";
import type * as lib_authorization from "../lib/authorization.js";
import type * as memories from "../memories.js";
import type * as notifications from "../notifications.js";
import type * as receipts from "../receipts.js";
import type * as schedules from "../schedules.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  alerts: typeof alerts;
  approvals: typeof approvals;
  auth: typeof auth;
  chat: typeof chat;
  embeddings: typeof embeddings;
  evidence: typeof evidence;
  households: typeof households;
  http: typeof http;
  invitations: typeof invitations;
  "lib/authorization": typeof lib_authorization;
  memories: typeof memories;
  notifications: typeof notifications;
  receipts: typeof receipts;
  schedules: typeof schedules;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {
  betterAuth: import("@convex-dev/better-auth/_generated/component.js").ComponentApi<"betterAuth">;
};
