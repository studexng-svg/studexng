// src/components/ThemeProvider.tsx
"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

// ← Remove the old import entirely, just inline the props type
export function ThemeProvider({ children, ...props }: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange={false}
      {...props}
    >
      {children}
    </NextThemesProvider>
  );
}