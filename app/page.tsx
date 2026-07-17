import type { Metadata } from "next";
import CenterApp from "./CenterApp";

export const metadata: Metadata = {
  title: "سنتر التفوق | نظام الإدارة",
  description: "نظام متكامل لإدارة حصص وطلاب ومدرسي سنتر التفوق",
};

export default function Home() {
  return <CenterApp />;
}
