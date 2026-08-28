import "./globals.css";

export const metadata = {
  title: "Pipeskool Site Management",
  description: "Internal site management software — Pipeskool Projects Pvt. Ltd.",
  manifest: "/manifest.json",
  themeColor: "#0F1419",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
