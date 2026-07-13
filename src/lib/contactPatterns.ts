// src/lib/contactPatterns.ts
// Client-side mirror of the backend's contact-info/off-platform detection
// (studex-backend/chat/views.py _has_suspicious_content). Both sides load the
// SAME file — contracts/contact_patterns.json — so there is one definition of
// these rules, not two hand-copied regex lists. This check is a fast local
// pre-check for UX only; the backend re-validates on every send() regardless.
import contactPatterns from "../../contracts/contact_patterns.json";

interface PatternCategory {
  key: string;
  reason: "contact_info" | "off_platform";
  patterns: string[];
}

interface ContactPatternsFile {
  contact_info_message: string;
  off_platform_message: string;
  categories: PatternCategory[];
}

const data = contactPatterns as ContactPatternsFile;

const compiledCategories = data.categories.map((cat) => ({
  reason: cat.reason,
  message: cat.reason === "contact_info" ? data.contact_info_message : data.off_platform_message,
  patterns: cat.patterns.map((p) => new RegExp(p, "i")),
}));

export function checkContactInfo(content: string): { message: string; reason: string } | null {
  for (const category of compiledCategories) {
    if (category.patterns.some((re) => re.test(content))) {
      return { message: category.message, reason: category.reason };
    }
  }
  return null;
}
