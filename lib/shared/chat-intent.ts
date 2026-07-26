export type ChatAudience = "patient" | "caregiver"

export type ChatIntent =
  | { kind: "conversation" }
  | { kind: "memory"; statement: string; provenance: ChatAudience; importance: "routine" | "important" | "safety" }

const explicitMemory = /^(?:please\s+)?(?:remember(?:\s+that)?|note(?:\s+that)?|keep in mind(?:\s+that)?|save(?:\s+that)?|覚えて|記憶して|メモして)[\s,:：]*/i
const personalContext = /(?:\b(?:is|are)\s+(?:my|her|his)\s+(?:daughter|son|wife|husband|caregiver|doctor|friend)\b|\bmy\s+(?:daughter|son|wife|husband|caregiver|doctor|friend|address|home|birthday|allergy|medicine|medication)\s+is\b|\b[\p{L}]+(?:'s)?\s+(?:daughter|son|wife|husband|caregiver|doctor|friend|address|birthday|allergy|medicine|medication)\s+is\b|\bi\s+(?:live|take|need|prefer|usually|always)\b|(?:娘|息子|妻|夫|介護者|医者|住所|誕生日|アレルギー|薬)(?:です|は|が)|(?:住んで|飲んで|必要|好き))/iu
const safetyContext = /medicine|medication|dose|allerg|appointment|emergency|薬|服用|アレルギー|緊急|診察/i

export function classifyChatIntent(message: string, audience: ChatAudience): ChatIntent {
  const trimmed = message.trim()
  const explicit = explicitMemory.test(trimmed)
  if (!explicit && !personalContext.test(trimmed)) return { kind: "conversation" }
  const statement = trimmed.replace(explicitMemory, "").trim()
  return {
    kind: "memory",
    statement: statement || trimmed,
    provenance: audience,
    importance: safetyContext.test(statement) ? "safety" : "important",
  }
}

export function conversationalFallback(message: string, locale: "en" | "ja", audience: ChatAudience) {
  const normalized = message.trim().toLocaleLowerCase(locale === "ja" ? "ja-JP" : "en-US")
  if (/^(hi|hello|hey|good (?:morning|afternoon|evening))\b|こんにちは|おはよう|こんばんは/.test(normalized)) {
    return locale === "ja" ? "こんにちは。ここにいます。今日はどうしましたか？" : "Hello. I’m here with you. How can I help?"
  }
  if (/how are you|元気/.test(normalized)) return locale === "ja" ? "元気です。お話しできてうれしいです。" : "I’m doing well, and I’m glad to talk with you."
  return locale === "ja"
    ? audience === "caregiver" ? "もちろんです。質問したり、患者さんについて覚えておくことを話してください。" : "もちろんです。お話ししましょう。質問したり、覚えてほしいことを教えてください。"
    : audience === "caregiver" ? "Of course. Ask me anything, or tell me something TOMO should remember." : "Of course. We can talk, or you can tell me something you want TOMO to remember."
}
