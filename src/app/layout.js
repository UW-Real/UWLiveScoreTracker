import "./globals.css";

export const metadata = {
  title: "UW Score Tracker",
  description: "Your scores. One place. Sign in or create your UW Score Tracker account.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
