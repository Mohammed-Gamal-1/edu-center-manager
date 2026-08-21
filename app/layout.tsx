import type { Metadata } from "next";
import "./globals.css";
import ServiceWorkerRegistration from "./ServiceWorkerRegistration";

export const metadata: Metadata = {
  title: "سنتر التفوق | نظام الإدارة",
  description: "إدارة الحصص والطلاب والمدرسين والحسابات من مكان واحد.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "سنتر التفوق | إدارة أذكى ليومك",
    description: "نظام متكامل لإدارة حصص وطلاب ومدرسي سنتر التفوق.",
    type: "website",
    locale: "ar_EG",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
