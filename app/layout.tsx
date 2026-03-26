import "./globals.css";
import AuthProvider from "@/components/providers/AuthProvider";
import ThemeProvider from "@/components/providers/ThemeProvider";
import LanguageProvider from "@/components/providers/LanguageProvider";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
  title: "H+ – Mémorises ce qui compte",
  description:
    "H+ est votre espace personnel intelligent pour mémoriser, organiser et agir sur ce qui compte.",
  applicationName: "H+",
  manifest: "/manifest.json",
  themeColor: "#0f172a",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export const viewport = {
  themeColor: "#4f46e5",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body className="bg-black text-white antialiased">
        <AuthProvider>
          <LanguageProvider>
            <ThemeProvider>{children}</ThemeProvider>
          </LanguageProvider>
        </AuthProvider>
        <Analytics />
      </body>
    </html>
  );
}
