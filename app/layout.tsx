import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";
const assetPath = (path: string) => `${basePath}${path}`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "AstroShot · Real Sky & Meteor Simulator",
  description:
    "An interactive night-sky simulator built from a real star catalog, with atmospheric twinkle, Earth rotation, meteors, and fireballs.",
  openGraph: {
    title: "AstroShot · Real Sky & Meteor Simulator",
    description:
      "An interactive night-sky simulator built from a real star catalog, with atmospheric twinkle, Earth rotation, meteors, and fireballs.",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/og.png",
        width: 1200,
        height: 630,
        alt: "The night sky, Milky Way, and a green fireball",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "AstroShot · Real Sky & Meteor Simulator",
    description:
      "An interactive night-sky simulator built from a real star catalog, with atmospheric twinkle, Earth rotation, meteors, and fireballs.",
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
    <html lang="en">
      <body
        className={`${geistSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
