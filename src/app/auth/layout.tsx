import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Login or Sign Up",
  description:
    "Join StudEx — the campus marketplace for Pan-Atlantic University students. Create a free account or sign in to book services and shop from student vendors.",
  openGraph: {
    title: "Login or Sign Up | StudEx",
    description:
      "Join StudEx — the campus marketplace for PAU students. Create a free account or sign in.",
  },
  twitter: {
    title: "Login or Sign Up | StudEx",
    description:
      "Join StudEx — the campus marketplace for PAU students. Create a free account or sign in.",
  },
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
