import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
const assetPath = (path: string) => `${basePath}${path}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AstroShot · 真实星空与流星模拟器",
  description:
    "基于真实恒星星表的交互式地球夜空，包含闪烁、自转、普通流星与分级火流星。",
  openGraph: {
    title: "AstroShot · 真实星空与流星模拟器",
    description:
      "基于真实恒星星表的交互式地球夜空，包含闪烁、自转、普通流星与分级火流星。",
    type: "website",
    locale: "zh_CN",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "夜空、银河与一颗绿色火流星",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AstroShot · 真实星空与流星模拟器",
    description:
      "基于真实恒星星表的交互式地球夜空，包含闪烁、自转、普通流星与分级火流星。",
    images: ["/og.png"],
  },
  icons: {
    icon: [
      { url: assetPath("/favicon.svg"), type: "image/svg+xml" },
      { url: assetPath("/favicon.ico"), sizes: "any" },
      {
        url: assetPath("/favicon-32.png"),
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: assetPath("/favicon-16.png"),
        sizes: "16x16",
        type: "image/png",
      },
    ],
    shortcut: assetPath("/favicon.ico"),
    apple: [
      {
        url: assetPath("/apple-touch-icon.png"),
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
