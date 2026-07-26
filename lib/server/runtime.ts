import { env } from "cloudflare:workers";

export type TomoBindings = {
  AI?: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
  EVIDENCE?: R2Bucket;
  DASHSCOPE_API_KEY?: string;
  QWEN_BASE_URL?: string;
  QWEN_CHAT_MODEL?: string;
  QWEN_EMBEDDING_MODEL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  CONVEX_SITE_URL?: string;
  EVIDENCE_GATEWAY_SECRET?: string;
  AI_GATEWAY_SECRET?: string;
};

export function getBindings(): TomoBindings {
  return env as unknown as TomoBindings;
}

export function providerStatus() {
  const bindings = getBindings();
  return {
    database: Boolean(bindings.CONVEX_SITE_URL),
    evidenceStorage: Boolean(bindings.EVIDENCE),
    qwen: Boolean(bindings.DASHSCOPE_API_KEY && bindings.QWEN_BASE_URL),
    cloudflareQwen: Boolean(bindings.AI),
    email: Boolean(bindings.RESEND_API_KEY && bindings.EMAIL_FROM),
    weather: true,
  };
}
