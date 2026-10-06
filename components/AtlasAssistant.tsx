"use client";

import { FormEvent, useEffect, useRef, useState } from 'react';
import { MessageCircle, Mic, MicOff, Send, Volume2, VolumeX, X } from 'lucide-react';
import type { Station } from '@/lib/stations';
import { getSpeechRecognitionConstructor, type BrowserSpeechRecognition } from '@/lib/voice-command-engine';

type Props = { station: Station | null; onSearch?: (query: string) => void };
type Line = { role: 'user' | 'atlas'; text: string };

export function AtlasAssistant({ station, onSearch }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [lines, setLines] = useState<Line[]>([{ role: 'atlas', text: 'Where would you like to listen next?' }]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState('Tap the microphone and speak');
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 80); }, [open]);
  useEffect(() => () => { recognitionRef.current?.abort(); if (typeof window !== 'undefined') window.speechSynthesis?.cancel(); }, []);

  function speak(text: string) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = navigator.language || 'en-US';
    utterance.rate = 0.98;
    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }

  async function ask(text: string, spoken = false) {
    const value = text.trim(); if (!value || busy) return;
    setLines((old) => [...old, { role: 'user', text: value }]); setQuestion(''); setBusy(true);
    try {
      const response = await fetch('/api/atlas-assistant', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: value, context: { station } }) });
      const data = await response.json();
      const answer = data.answer || 'I could not answer that from the Atlas yet.';
      setLines((old) => [...old, { role: 'atlas', text: answer }]);
      if (data.action?.type === 'search' && data.action.query) onSearch?.(data.action.query);
      if (spoken) speak(answer);
    } catch { setLines((old) => [...old, { role: 'atlas', text: 'Atlas is temporarily unavailable. Please try again.' }]); }
    finally { setBusy(false); }
  }

  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }
  function listen() {
    if (listening) { recognitionRef.current?.stop(); return; }
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) { setVoiceMessage('Voice input is unavailable here. Type your question instead.'); return; }
    try {
      const recognition = new Recognition();
      recognitionRef.current = recognition;
      recognition.lang = navigator.language || 'en-US'; recognition.interimResults = false; recognition.continuous = false; recognition.maxAlternatives = 1;
      recognition.onstart = () => { setListening(true); setVoiceMessage('Listening…'); };
      recognition.onend = () => { setListening(false); recognitionRef.current = null; setVoiceMessage('Tap the microphone and speak'); };
      recognition.onerror = (event) => { setListening(false); recognitionRef.current = null; setVoiceMessage(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Microphone access is blocked. Allow it in browser settings.' : 'I could not hear that. Tap the microphone to try again.'); };
      recognition.onresult = (event) => { const text = event.results?.[0]?.[0]?.transcript?.trim(); if (text) { setVoiceMessage(`Heard: “${text}”`); void ask(text, true); } };
      recognition.start();
    } catch { setListening(false); setVoiceMessage('Microphone could not start. Tap to try again.'); }
  }

  return <>
    <button onClick={() => setOpen(true)} aria-label="Ask Atlas" className="fixed right-3 top-[max(5.25rem,env(safe-area-inset-top))] z-[88] grid size-11 place-items-center rounded-full border border-white/15 bg-[#07111f]/90 text-emerald-300 shadow-[0_12px_35px_rgba(0,0,0,.34)] backdrop-blur-xl transition hover:bg-[#0b1a2b] md:right-5 md:top-auto md:bottom-6 md:flex md:w-auto md:px-4"><MessageCircle size={18}/><span className="hidden md:ml-2 md:inline md:text-sm md:font-semibold">Ask Atlas</span></button>
    {open && <section role="dialog" aria-label="Atlas Assistant" className="fixed inset-x-2 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-[100] mx-auto flex max-h-[64dvh] max-w-md flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#050b19]/96 shadow-[0_30px_90px_rgba(0,0,0,.55)] backdrop-blur-2xl md:inset-x-auto md:bottom-20 md:right-5 md:w-[390px]">
      <header className="flex items-center justify-between border-b border-white/10 px-4 py-3"><div><div className="font-semibold tracking-tight text-white">Atlas Assistant</div><div className="mt-0.5 text-[11px] text-slate-400">Your WaveAtlas listening guide</div></div><button onClick={() => setOpen(false)} aria-label="Close Atlas Assistant" className="grid size-9 place-items-center rounded-full text-slate-300 transition hover:bg-white/10"><X size={18}/></button></header>
      <div className="min-h-32 flex-1 space-y-3 overflow-y-auto p-4">{lines.map((line,i)=><div key={i} className={line.role==='user'?'ml-8 rounded-2xl rounded-br-md bg-emerald-400/15 px-3.5 py-2.5 text-sm leading-5 text-emerald-50':'mr-5 rounded-2xl rounded-bl-md bg-white/[.06] px-3.5 py-2.5 text-sm leading-5 text-slate-100'}>{line.text}{line.role==='atlas'&&<button onClick={()=>speaking ? (window.speechSynthesis.cancel(), setSpeaking(false)) : speak(line.text)} className="ml-2 inline-flex rounded-full p-1 align-middle text-slate-400 transition hover:bg-white/10 hover:text-emerald-300" aria-label={speaking?'Stop speaking':'Read answer aloud'}>{speaking?<VolumeX size={14}/>:<Volume2 size={14}/>}</button>}</div>)}{busy&&<div className="px-1 text-xs text-slate-400">Atlas is thinking…</div>}</div>
      <div className="border-t border-white/10 bg-black/10 px-3 pt-2"><p className={`text-center text-[11px] ${listening?'font-semibold text-emerald-300':'text-slate-500'}`}>{voiceMessage}</p></div>
      <form onSubmit={submit} className="flex items-center gap-2 bg-black/10 p-3 pt-2"><button type="button" onClick={listen} className={`grid size-11 shrink-0 place-items-center rounded-full border transition ${listening?'border-emerald-300 bg-emerald-300 text-slate-950 shadow-[0_0_0_5px_rgba(110,231,183,.12)]':'border-white/10 bg-white/[.04] text-emerald-300 hover:bg-white/[.08]'}`} aria-label={listening?'Stop listening':'Speak to Atlas'}>{listening?<MicOff size={19}/>:<Mic size={19}/>}</button><input ref={inputRef} value={question} onChange={(e)=>setQuestion(e.target.value)} placeholder="Ask Atlas…" className="h-11 min-w-0 flex-1 rounded-full border border-white/10 bg-white/[.04] px-4 text-sm text-white outline-none placeholder:text-slate-500 focus:border-emerald-400/50"/><button type="submit" disabled={!question.trim()||busy} className="grid size-11 shrink-0 place-items-center rounded-full bg-emerald-400 text-slate-950 transition disabled:opacity-35" aria-label="Send"><Send size={18}/></button></form>
    </section>}
  </>;
}
