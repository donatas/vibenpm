import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "vibenpm — packages with a pulse",
    template: "%s · vibenpm",
  },
  description: "A community catalog for small, inspectable JavaScript packages.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <Link className="brand" href="/" aria-label="vibenpm home">
            <span className="brand-mark" aria-hidden="true">v</span>
            <span>vibe<span className="brand-accent">npm</span></span>
          </Link>
          <nav aria-label="Primary navigation">
            <Link href="/">Explore</Link>
            <Link href="/submit">Submit</Link>
            <a href="https://github.com/donatas/vibenpm" rel="noreferrer">GitHub ↗</a>
          </nav>
        </header>
        <main>{children}</main>
        <footer>
          <span>Built in public. Packages are community-submitted.</span>
          <span>vibenpm does not execute package code.</span>
        </footer>
      </body>
    </html>
  );
}
