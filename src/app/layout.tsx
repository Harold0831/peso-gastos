import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeScript } from "@/components/theme-script";
import { THEME_COLOR } from "@/lib/theme";
import { RegisterSW } from "@/components/register-sw";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Peso",
  description: "Rastreo personal de gastos e ingresos",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Peso",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        {/* Lo reescribe ThemeScript según el tema resuelto. Sin `media` a
            propósito: la preferencia del usuario puede ir contra la del
            sistema, así que el navegador no puede elegir solo. */}
        <meta name="theme-color" content={THEME_COLOR.light} />
        <ThemeScript />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
