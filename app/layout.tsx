import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Map STL Tiles",
  description: "Select a map area, download a printable STL tile",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
