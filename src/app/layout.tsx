import type { Metadata } from "next"
import { Inter } from "next/font/google"
import LayoutClient from "./layout-client"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

export const metadata: Metadata = {
  title: "Bokeh",
  description: "Professional screen recording and editing tool",
  icons: {
    icon: "/favicon.svg",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className={`${inter.variable} font-sans antialiased h-full overflow-hidden`}>
        <LayoutClient>
          {children}
        </LayoutClient>
      </body>
    </html>
  )
}
