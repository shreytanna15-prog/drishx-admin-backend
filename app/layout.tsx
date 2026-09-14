import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "./components/theme-provider";
import { ThemeScript } from "./components/theme-script";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://drishx-admin-and-backend.vercel.app"),
  title: "Drishx Admin",
  description: "Drishx admin portal",
  openGraph: {
    title: "Drishx Admin",
    description: "Drishx admin portal",
    type: "website",
    images: [
      {
        url: "/edited-photo.png?v=2",
        width: 1264,
        height: 742,
        alt: "Drishx Admin",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Drishx Admin",
    description: "Drishx admin portal",
    images: ["/edited-photo.png?v=2"],
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=12", sizes: "any", type: "image/x-icon" },
      { url: "/icon-32.png?v=12", sizes: "32x32", type: "image/png" },
      { url: "/icon-48.png?v=12", sizes: "48x48", type: "image/png" },
    ],
    shortcut: "/favicon.ico?v=12",
    apple: "/apple-touch-icon.png?v=12",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-full flex flex-col">
        <ThemeProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
