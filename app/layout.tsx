import type { Metadata } from "next"
import { Figtree } from "next/font/google"
import { cn } from "@/lib/utils"
import "./globals.css"

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "Tomo — A familiar voice. A trusted connection.",
  description: "A privacy-first bilingual memory and safety companion for independent living and connected care.",
  icons: {
    icon: [{ url: "/brand/mark-black-transparent.png", type: "image/png", sizes: "384x384" }],
    shortcut: "/brand/mark-black-transparent.png",
    apple: "/brand/mark-black-transparent.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", figtree.variable)}>
      <body>{children}</body>
    </html>
  )
}
