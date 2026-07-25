import type { Metadata } from "next"
import { Figtree } from "next/font/google"
import { cn } from "@/lib/utils"
import "./globals.css"

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "Tomo",
  description: "A privacy-first companion for independent living.",
  icons: {
    icon: [{ url: "/tomo-logo.png", type: "image/png", sizes: "512x512" }],
    shortcut: "/tomo-logo.png",
    apple: "/tomo-logo.png",
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("font-sans", figtree.variable)}>
      <body>{children}</body>
    </html>
  )
}
