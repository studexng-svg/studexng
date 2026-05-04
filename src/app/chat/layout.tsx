import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Messages",
  description: "Chat with vendors and buyers on StudEx.",
  robots: { index: false, follow: false },
};

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
