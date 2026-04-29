export const metadata = {
  title: "CiteCast Backend",
  description: "CiteCast API — citation extraction from YouTube transcripts",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
