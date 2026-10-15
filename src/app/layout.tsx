import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";
import "./globals.css";

const display = Space_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-display" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["400", "600"], variable: "--font-mono" });

const ticker = (process.env.NEXT_PUBLIC_TICKER || "SHILL").replace(/^\$/, "").toUpperCase();
const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(site),
  title: `$${ticker} — Tweet it. Get paid per view.`,
  description: `Post about $${ticker} on X and earn SOL for every view your post gets. 100 views = 0.1 SOL. No games, no tiers, no "later".`,
  openGraph: {
    title: `$${ticker} — the coin that pays you to shill it`,
    description: `Log in with X, post $${ticker}, get SOL for your reach.`,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${mono.variable}`}>
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
