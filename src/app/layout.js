import "./globals.css";
import SiteHeader from "@/components/SiteHeader";

export const metadata = {
  title: "UW Score Tracker",
  description: "Live scores for every University of Washington Division I sport.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <SiteHeader />
        {children}
      </body>
    </html>
  );
}
