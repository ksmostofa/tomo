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
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link rel="preload" href="/yolo26n.onnx?v=1" as="fetch" type="application/octet-stream" crossOrigin="anonymous" />
        <link rel="preload" href="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort-wasm-simd-threaded.wasm" as="fetch" type="application/wasm" crossOrigin="anonymous" />
      </head>
      <body>{children}</body>
    </html>
  )
}
