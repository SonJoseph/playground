export const metadata = {
  title: 'Playground',
  description: 'Next.js + Express + SQLite playground',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}


