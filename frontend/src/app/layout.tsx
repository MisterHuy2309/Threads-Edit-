import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Threads Video Generator",
  description: "Xuất video đọc Threads tự động chuẩn Reels & TikTok",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi">
      <body className="antialiased selection:bg-rose-500 selection:text-white">{children}</body>
    </html>
  );
}
