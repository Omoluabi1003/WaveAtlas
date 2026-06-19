import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'WaveAtlas — Tune the World', description: 'A global live radio discovery platform with a terrestrial dial feel.', manifest: '/manifest.webmanifest' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
