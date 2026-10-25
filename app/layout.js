import "./globals.css";
import GlobalMobileNav from "@/components/GlobalMobileNav";   // update374
import ITExecutiveUiGate from "@/components/ITExecutiveUiGate";

export const metadata = {
  title: "Pipeskool Site Management",
  description: "Internal site management software — Pipeskool Projects Pvt. Ltd.",
  manifest: "/manifest.json",
  themeColor: "#0F1419",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}<ITExecutiveUiGate /><GlobalMobileNav /></body>
    </html>
  );
}