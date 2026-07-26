export const copy = {
  en: {
    patient: "Patient", caregiver: "Caregiver", askTomo: "Ask TOMO", askAnything: "Ask TOMO anything",
    today: "Today", camera: "Home camera", tapToTalk: "Tap to talk", callYuki: "Call Yuki",
    repeat: "Repeat", typeInstead: "Type instead", careInbox: "Care inbox", memories: "Memories",
    schedule: "Schedule", settings: "Settings", languageLabel: "日本語に切り替える",
  },
  ja: {
    patient: "患者", caregiver: "介護者", askTomo: "TOMOに聞く", askAnything: "TOMOに何でも聞いてください",
    today: "今日", camera: "ホームカメラ", tapToTalk: "タップして話す", callYuki: "ユキに電話",
    repeat: "もう一度", typeInstead: "文字で入力", careInbox: "ケア受信箱", memories: "記憶",
    schedule: "予定", settings: "設定", languageLabel: "Switch to English",
  },
} as const

export type TomoLocale = keyof typeof copy
