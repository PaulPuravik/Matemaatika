import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Matemaatika",
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
