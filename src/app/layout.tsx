import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`antialiased`}>
        {children}
        <Toaster
          theme="light"
          toastOptions={{
            actionButtonStyle: { backgroundColor: "#fff", color: "black" },
          }}
        />
      </body>
    </html>
  );
}
