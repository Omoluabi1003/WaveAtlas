import { notFound, redirect } from 'next/navigation';
import { audioJourneys } from '@/lib/maturity/audio-journeys';
export async function generateMetadata({ params }: { params: Promise<{ journeyId: string }> }) { const {journeyId}=await params;const journey=audioJourneys.find(item=>item.id===journeyId);return journey?{title:`${journey.name} | WaveAtlas`,description:journey.description}:{}; }
export default async function JourneyPage({ params }: { params: Promise<{ journeyId: string }> }) { const { journeyId }=await params;if(!audioJourneys.some(item=>item.id===journeyId))notFound();redirect(`/?tour=${encodeURIComponent(journeyId)}`); }
