import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trainer Studio",
  description: "Label images and export YOLO on this computer.",
  icons: { icon: "/favicon.ico", apple: "/logo-256.png" },
};

const boot = `
try {
  var theme = localStorage.getItem("trainer-studio.theme");
  var locale = localStorage.getItem("trainer-studio.locale") || "en";
  document.documentElement.classList.toggle("dark", theme !== "light");
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
} catch (e) {}
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: boot }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
