import { providerStatus } from "@/lib/server/runtime";

export async function GET() {
  const providers = providerStatus();
  return Response.json({
    ok: true,
    service: "tomo",
    time: new Date().toISOString(),
    providers,
    ready: providers.database && (providers.qwen || providers.cloudflareQwen),
    optional: {
      privateClipStorage: providers.evidenceStorage,
      directQwenCloud: providers.qwen,
      caregiverEmail: providers.email,
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
