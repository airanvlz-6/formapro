import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FormaPro — Tu coach de entrenamiento personal",
  description: "Programación de entrenamiento con base científica. Adaptada a tu disciplina, nivel y objetivos.",
  manifest: "/manifest.json",
  themeColor: "#1E5C3A",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FormaPro",
  },
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
        <link rel="apple-touch-icon" href="/icon.svg" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="FormaPro" />
        <meta name="theme-color" content="#1E5C3A" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
      </head>
      <body>{children}</body>
    </html>
  );
}