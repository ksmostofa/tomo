import { env } from "cloudflare:workers";

export type TomoBindings = {
  AI?: {
    run(model: string, input: Record<string, unknown>): Promise<unknown>;
  };
  DB?: D1Database;
  EVIDENCE?: R2Bucket;
  DASHSCOPE_API_KEY?: string;
  QWEN_BASE_URL?: string;
  QWEN_CHAT_MODEL?: string;
  QWEN_EMBEDDING_MODEL?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  CAREGIVER_EMAIL?: string;
};

export function getBindings(): TomoBindings {
  return env as unknown as TomoBindings;
}

export function providerStatus() {
  const bindings = getBindings();
  return {
    database: Boolean(bindings.DB),
    evidenceStorage: Boolean(bindings.EVIDENCE),
    qwen: Boolean(bindings.DASHSCOPE_API_KEY && bindings.QWEN_BASE_URL),
    cloudflareQwen: Boolean(bindings.AI),
    email: Boolean(bindings.RESEND_API_KEY && bindings.EMAIL_FROM && bindings.CAREGIVER_EMAIL),
    weather: true,
  };
}
