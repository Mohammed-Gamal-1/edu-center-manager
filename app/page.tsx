import type { Metadata } from "next";
import CenterApp from "./CenterApp";

export const metadata: Metadata = {
  title: "سنتر + | نظام الإدارة",
  description: "نظام متكامل لإدارة حصص وطلاب ومدرسي السنتر",
};

export default function Home() {
  return <CenterApp />;
}
