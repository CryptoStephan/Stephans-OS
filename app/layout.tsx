import "./globals.css";
import "@/components/os/apps/apps.css";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "Stephan’s OS — your browser, a little more personal",
  description:
    "A personal desktop with a real LOTW shell, persistent files, and a place to make things.",
  icons: { icon: "/favi-32x32.png" },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
