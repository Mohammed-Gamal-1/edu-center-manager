import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:4173";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  return {
    title: "سنتر + | نظام الإدارة",
    description: "إدارة الحصص والطلاب والمدرسين والحسابات من مكان واحد.",
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      title: "سنتر + | إدارة أذكى ليومك",
      description: "نظام متكامل لإدارة حصص وطلاب ومدرسي السنتر.",
      type: "website",
      locale: "ar_EG",
      images: [{ url: `${origin}/og.png`, width: 1736, height: 909, alt: "سنتر + — إدارة أذكى ليومك" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "سنتر + | إدارة أذكى ليومك",
      description: "نظام متكامل لإدارة حصص وطلاب ومدرسي السنتر.",
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
