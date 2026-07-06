import type { Metadata } from "next";
import { Suspense } from "react";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AppNav } from "@/components/app-nav";
import { NavGate } from "@/components/nav-gate";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "MotelAconchego",
  description: "Sistema de gestão MotelAconchego",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${inter.variable} ${bricolage.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <Suspense fallback={null}><NavGate><AppNav /></NavGate></Suspense>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
