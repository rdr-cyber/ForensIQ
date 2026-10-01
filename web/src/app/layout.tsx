import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import GuideChat from "@/components/GuideChat";
import TourRunner from "@/components/tour/TourRunner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
});

export const metadata: Metadata = {
  title: "Jocky",
  description:
    "Auditable forensic scripting — SIH26148 (NTRO) prototype",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${jetbrains.variable} font-sans min-h-screen`}
      >
        {children}
        <GuideChat />
        <TourRunner />
      </body>
    </html>
  );
}
