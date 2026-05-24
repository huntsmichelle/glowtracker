import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "GlowTracker",
  description: "Track your personal beauty & grooming routines",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className={`${geist.className} bg-gray-50 min-h-full antialiased`}>
        {children}
      </body>
    </html>
  );
}
