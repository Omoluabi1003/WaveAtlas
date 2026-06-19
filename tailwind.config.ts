import type { Config } from 'tailwindcss';
const config: Config = { content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'], theme: { extend: { colors: { midnight:'#07111F', navy:'#0B1F33', gold:'#D6A84F', sky:'#38BDF8', ivory:'#F8F5ED', radio:'#36F5A2' }, fontFamily: { mono:['var(--font-geist-mono)','ui-monospace'], sans:['var(--font-geist-sans)','Inter','sans-serif'] }, boxShadow: { glow:'0 0 40px rgba(56,189,248,.24)' } } }, plugins: [] };
export default config;
