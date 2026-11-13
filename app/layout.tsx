import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "Подарки — моменты, которые ждут", description: "Отправляйте подарки-сюрпризы, которые откроются точно в назначенное время." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ru"><body>{children}</body></html>; }