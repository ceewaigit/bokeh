import type { Metadata } from "next"
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google"
import LayoutClient from "./layout-client"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: 'swap',
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: 'swap',
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: "400",
  display: 'swap',
})

export const metadata: Metadata = {
  title: "Bokeh",
  description: "Professional screen recording and editing tool",
  icons: {
    icon: "/favicon.svg",
  },
}

export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${geistSans.className} antialiased h-full overflow-hidden`}>
        <LayoutClient>
          {children}
        </LayoutClient>
      </body>
    </html>
  )
}
