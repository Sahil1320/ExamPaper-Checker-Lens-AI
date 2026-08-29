import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VedaAI — AI Assessment Extraction & Answer Mapping",
  description:
    "Upload question papers and answer sheets to automatically extract questions, map answers, grade responses, and get AI-powered feedback.",
  keywords: [
    "AI",
    "assessment",
    "grading",
    "answer mapping",
    "question extraction",
    "education",
    "VedaAI",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
