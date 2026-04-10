import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SDG Dashboard — Amina',
  description: 'An application using Workflow as a service',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-bg text-text font-sans min-h-screen overflow-x-hidden">{children}</body>
    </html>
  );
}
