import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MakeItHappen",
  description: "The trip coordination engine. Your friends stay in WhatsApp; the trip gets a date.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
