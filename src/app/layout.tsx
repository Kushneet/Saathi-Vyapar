import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import { LanguageProvider } from "@/contexts/LanguageContext";
import ChatPanel from "@/components/ChatPanel";
import { getServerLanguage } from "@/lib/i18n.server";

export const metadata: Metadata = {
  title: "Saathi Vyapar (साथी व्यापार) — AI Business Advisory for Rural Micro-Entrepreneurs",
  description:
    "AI-driven hyper-local business advisory and financial structuring assistant for rural micro-entrepreneurs, accessible via WhatsApp, SMS, and web. SIH26091 · Ministry of Social Justice & Empowerment · Team Pantheon Eternal.",
  icons: {
    icon: [
      { url: '/Logo.png', type: 'image/png' },
      { url: '/icon.png', type: 'image/png' },
      { url: '/favicon.ico' },
    ],
    shortcut: ['/Logo.png'],
    apple: [
      { url: '/Logo.png', type: 'image/png' },
      { url: '/apple-icon.png', type: 'image/png' },
    ],
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Read the language on the server so the first paint is already in the
  // visitor's language and <html lang> is correct for assistive tech.
  const language = await getServerLanguage();

  return (
    <html
      lang={language}
      className="h-full antialiased light scroll-smooth"
    >
      <head>
        <link rel="icon" href="/Logo.png" type="image/png" />
        <link rel="shortcut icon" href="/Logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/Logo.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,300;0,400;0,500;0,700;0,900;1,400&family=Open+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[#F5F1E6] text-[#0B1E33] font-['Open_Sans',sans-serif]">
        <LanguageProvider initialLanguage={language}>
          {children}
          {/* Ask Saathi on every page. Suspense because the panel reads the
              URL (?user_id=) with useSearchParams. */}
          <Suspense fallback={null}>
            <ChatPanel />
          </Suspense>
        </LanguageProvider>
      </body>
    </html>
  );
}
