import { getBindings } from "@/lib/server/runtime";

type ResendResponse = { id?: string; message?: string };

export async function notifyCaregiver(subject: string, text: string) {
  const bindings = getBindings();
  if (!bindings.RESEND_API_KEY || !bindings.EMAIL_FROM || !bindings.CAREGIVER_EMAIL) {
    return { delivered: false, provider: "disabled" as const, id: null };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${bindings.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: bindings.EMAIL_FROM, to: [bindings.CAREGIVER_EMAIL], subject, text }),
  });
  const payload = await response.json() as ResendResponse;
  if (!response.ok || !payload.id) throw new Error(payload.message || `Email request failed (${response.status})`);
  return { delivered: true, provider: "resend" as const, id: payload.id };
}
