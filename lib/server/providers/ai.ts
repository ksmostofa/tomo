import { getBindings } from "@/lib/server/runtime";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type AiAnswer = {
  text: string;
  provider: "qwen-cloud" | "cloudflare-qwen" | "deterministic";
  model: string;
};

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

type EmbeddingResponse = {
  data?: Array<{ embedding?: number[] }>;
  error?: { message?: string };
};

type WorkersAiTextResponse = {
  response?: string;
};

type WorkersAiEmbeddingResponse = {
  data?: number[][];
  shape?: number[];
};

function configuredQwen() {
  const bindings = getBindings();
  if (!bindings.DASHSCOPE_API_KEY || !bindings.QWEN_BASE_URL) return null;
  return {
    apiKey: bindings.DASHSCOPE_API_KEY,
    baseUrl: bindings.QWEN_BASE_URL.replace(/\/$/, ""),
    chatModel: bindings.QWEN_CHAT_MODEL || "qwen3.6-flash",
    embeddingModel: bindings.QWEN_EMBEDDING_MODEL || "text-embedding-v4",
  };
}

export async function generateAnswer(messages: ChatMessage[], fallback: string): Promise<AiAnswer> {
  const qwen = configuredQwen();
  if (!qwen) {
    const workersAi = getBindings().AI;
    if (!workersAi) return { text: fallback, provider: "deterministic", model: "grounded-fallback-v1" };
    const payload = await workersAi.run("@cf/qwen/qwen3-30b-a3b-fp8", {
      messages,
      temperature: 0.2,
      max_tokens: 320,
    }) as WorkersAiTextResponse;
    const text = payload.response?.trim();
    return text
      ? { text, provider: "cloudflare-qwen", model: "@cf/qwen/qwen3-30b-a3b-fp8" }
      : { text: fallback, provider: "deterministic", model: "grounded-fallback-v1" };
  }

  const response = await fetch(`${qwen.baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${qwen.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: qwen.chatModel, messages, temperature: 0.2, max_tokens: 320 }),
  });
  const payload = await response.json() as ChatResponse;
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!response.ok || !text) throw new Error(payload.error?.message || `Qwen request failed (${response.status})`);
  return { text, provider: "qwen-cloud", model: qwen.chatModel };
}

export async function createEmbedding(input: string) {
  const qwen = configuredQwen();
  if (!qwen) {
    const workersAi = getBindings().AI;
    if (!workersAi) return null;
    const payload = await workersAi.run("@cf/qwen/qwen3-embedding-0.6b", { text: [input] }) as WorkersAiEmbeddingResponse;
    const embedding = payload.data?.[0];
    return embedding ? { embedding, model: "@cf/qwen/qwen3-embedding-0.6b" } : null;
  }
  const response = await fetch(`${qwen.baseUrl}/embeddings`, {
    method: "POST",
    headers: { Authorization: `Bearer ${qwen.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: qwen.embeddingModel, input, dimensions: 256 }),
  });
  const payload = await response.json() as EmbeddingResponse;
  const embedding = payload.data?.[0]?.embedding;
  if (!response.ok || !embedding) throw new Error(payload.error?.message || `Embedding request failed (${response.status})`);
  return { embedding, model: qwen.embeddingModel };
}
