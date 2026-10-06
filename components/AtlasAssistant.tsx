"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageCircle, Mic, Send, Volume2, X } from 'lucide-react';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor } from '@/lib/voice-command-engine';

type Props = { station: Station | null; onSearch?: (query: string) => void };
type Line = { role: 'user' | 'atlas'; text: string };

export function AtlasAssistant({ station, onSearch }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<Line[]>([{ role: 'atlas', text: 'Ask Atlas about the signal you are hearing or where you want to listen next.' }]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);

  async function ask(text: string) {
    const value = text.trim(); if (!value || busy) return;
    setLines((old) => [...old, { role: 'user', text: value }]); setQuestion(''); setBusy(true);
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value, context: { station } }) });
      const data = await response.json();
      const answer = data.answer || 'I could not answer that from the Atlas yet.';
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (data.action?.type === 'search' && data.action.query) onSearch?.(data.action.query);
    } catch { setLines((old) => [...old, { role: 'atlas', text: 'The Atlas Assistant is temporarily unavailable.' }]); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }
  function listen() {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { setLines((old) => [...old, { role: 'atlas', text: 'Voice input is not available in this browser. You can still type to me for free.' }]); return; }
    const recognition = new Recognition(); recognition.lang = 'en-NG'; recognition.interimResults = false;
    recognition.onresult = (event) => { const text = event.results?.[0]?.[0]?.transcript; if (text) void ask(text); };
    recognition.start();
  }
  function speak(text: string) { if ('speechSynthesis' in window) { speechSynthesis.cancel(); speechSynthesis.speak(new SpeechSynthesisUtterance(text)); } }

  return <>
    <button onClick={() => setOpen(true)} aria-label="Ask Atlas" className="fixed bottom-24 right-4 z-[90] flex h-12 items-center gap-2 rounded-full border border-emerald-400/30 bg-slate-950/90 px-4 text-sm font-semibold text-emerald-100 shadow-2xl backdrop-blur md:bottom-6"><MessageCircle size={18}/> Ask Atlas</button>
    {open && <section className="fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-h-[72vh] max-w-md flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950/95 shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="font-semibold text-white">Atlas Assistant</div><div className="text-[11px] text-emerald-300">Free • WaveAtlas context • no paid AI API</div></div><button onClick={() => setOpen(false)} aria-label="Close Atlas Assistant" className="rounded-full p-2 text-slate-300 hover:bg-white/10"><X size={18}/></button></header>
      <div className="min-h-44 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line,i)=><div key={i} className={line.role==='user'?'ml-10 rounded-2xl bg-emerald-400/15 px-3 py-2 text-sm text-emerald-50':'mr-7 rounded-2xl bg-white/5 px-3 py-2 text-sm text-slate-100'}>{line.text}{line.role==='atlas'&&<button onClick={()=>speak(line.text)} className="ml-2 inline-flex align-middle text-slate-400" aria-label="Read answer aloud"><Volume2 size={14}/></button>}</div>)}{busy&&<div className="text-xs text-slate-400">Reading the Atlas…</div>}</div>
      <form onSubmit={submit} className="flex gap-2 border-t border-white/10 p-3"><button type="button" onClick={listen} className="rounded-full border border-white/10 p-3 text-emerald-300" aria-label="Speak to Atlas"><Mic size={18}/></button><input ref={inputRef} value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="Ask about this station…" className="min-w-0 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-slate-500"/><button type="submit" disabled={!question.trim()||busy} className="rounded-full bg-emerald-400 p-3 text-slate-950 disabled:opacity-40" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}
