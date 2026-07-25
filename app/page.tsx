import type { Metadata } from "next"
import { TomoExperienceApp } from "@/components/tomo-experience"

export const metadata: Metadata = {
  title: "Tomo — A familiar voice. A trusted connection.",
  description:
    "A privacy-first companion for independent living and connected care.",
}

export default function Home() {
  return <TomoExperienceApp />
}
