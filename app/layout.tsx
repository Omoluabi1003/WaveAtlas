import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'WaveAtlas — Travel the World Through Sound', description: 'A geospatial audio exploration platform built by ETL GIS Consulting LLC.', manifest: '/manifest.webmanifest' };
export default function RootLayout({ children }: { children: React.ReactNode }) { return <html lang="en"><body>{children}</body></html>; }
