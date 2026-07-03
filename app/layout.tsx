import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Forge — Tu coach de entrenamiento personal",
  description: "Programación de entrenamiento con base científica. Adaptada a tu disciplina, nivel y objetivos.",
  manifest: "/manifest.json",
  icons: {
    apple: "/icon-512.png",
    icon: "/icon-512.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Forge",
    startupImage: "/icon-512.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#FF6B00",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-512.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Forge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover, interactive-widget=resizes-content" />
      </head>
      <body>
        <div className="fixed inset-0 -z-50 overflow-hidden bg-black">
          <div className="absolute left-1/2 top-[-300px] h-[700px] w-[700px] -translate-x-1/2 rounded-full bg-orange-500/15 blur-[160px]" />
          <div className="absolute bottom-[-400px] right-[-200px] h-[700px] w-[700px] rounded-full bg-orange-600/10 blur-[180px]" />
        </div>
        {children}
      </body>
    </html>
  );
}