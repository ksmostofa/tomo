import type { Metadata } from "next"
import { TomoAuthGate } from "@/components/tomo-auth-gate"
import { TomoConvexProvider } from "@/components/tomo-convex-provider"

export const metadata: Metadata = {
  title: "Tomo — A familiar voice. A trusted connection.",
  description:
    "A privacy-first companion for independent living and connected care.",
}

export default function Home() {
  return <TomoConvexProvider><TomoAuthGate /></TomoConvexProvider>
}
