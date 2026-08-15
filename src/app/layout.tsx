import type { Metadata, Viewport } from "next";
import "./globals.css";
import { APP_NAME } from "@/lib/branding";

// Most students open this on a phone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: APP_NAME,
  description: "Eratunnid — sinu järgmine tund, tööd ja materjalid",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="et">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
