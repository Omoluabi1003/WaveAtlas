import type { WorldContext } from "./types";

export type AmbientTheme = {
  themeName: string;
  backgroundGradient: string;
  glowIntensity: string;
  moodLabel: string;
  chipStyle: string;
  timePhase: "dawn" | "day" | "dusk" | "night";
  climateMood: "hot" | "humid" | "rainy" | "dry" | "mild" | "cool";
};

function hourFromLocalTime(localTime?: string) {
  const match = localTime?.match(/(\d{1,2})(?::\d{2})?\s*(AM|PM)?/i);
  if (!match) return new Date().getUTCHours();
  let hour = Number(match[1]);
  const meridiem = match[2]?.toUpperCase();
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;
  return hour;
}

function timePhase(hour: number): AmbientTheme["timePhase"] {
  if (hour >= 5 && hour < 8) return "dawn";
  if (hour >= 8 && hour < 17) return "day";
  if (hour >= 17 && hour < 20) return "dusk";
  return "night";
}

function climateMood(context: WorldContext | null | undefined): AmbientTheme["climateMood"] {
  const climate = context?.climate;
  if (typeof climate?.rainfallMillimeters === "number" && climate.rainfallMillimeters > 2) return "rainy";
  if (typeof climate?.humidityPercent === "number" && climate.humidityPercent >= 70) return "humid";
  if (typeof climate?.temperatureC === "number" && climate.temperatureC >= 30) return "hot";
  if (typeof climate?.humidityPercent === "number" && climate.humidityPercent <= 35) return "dry";
  if (typeof climate?.temperatureC === "number" && climate.temperatureC <= 12) return "cool";
  const region = context?.radioDNA.region?.toLowerCase() ?? "";
  if (/africa|caribbean|latin|middle east|oceania/.test(region)) return "hot";
  if (/nordic|northern europe|canada|alaska/.test(region)) return "cool";
  return "mild";
}

export function getAmbientTheme(context: WorldContext | null | undefined): AmbientTheme {
  const phase = timePhase(hourFromLocalTime(context?.radioDNA.localTime));
  const mood = climateMood(context);
  const phasePrefix = phase === "dawn" ? "Dawn" : phase === "dusk" ? "Dusk" : phase === "night" ? "Night" : "Local";

  if (phase === "night") return { themeName: `midnight-${mood}`, backgroundGradient: "radial-gradient(circle at 18% 8%, rgba(56,189,248,.18), transparent 28%), radial-gradient(circle at 82% 18%, rgba(88,225,132,.08), transparent 34%), linear-gradient(145deg, rgba(3,7,18,.94), rgba(15,23,42,.82))", glowIntensity: "0 0 72px rgba(56,189,248,.24)", moodLabel: mood === "humid" || mood === "rainy" ? "Soft night air" : mood === "cool" ? "Cool night signal" : "Quiet night signal", chipStyle: "border-sky/20 bg-sky/10 text-sky-100", timePhase: phase, climateMood: mood };
  if (mood === "rainy" || mood === "humid") return { themeName: `${phase}-humid-haze`, backgroundGradient: "radial-gradient(circle at 18% 10%, rgba(125,211,252,.18), transparent 30%), radial-gradient(circle at 82% 22%, rgba(88,225,132,.14), transparent 32%), linear-gradient(145deg, rgba(8,47,73,.78), rgba(15,23,42,.84))", glowIntensity: "0 0 64px rgba(125,211,252,.22)", moodLabel: mood === "rainy" ? `${phasePrefix} rain air` : `${phasePrefix} humid air`, chipStyle: "border-cyan-200/20 bg-cyan-200/10 text-cyan-50", timePhase: phase, climateMood: mood };
  if (mood === "hot" || mood === "dry") return { themeName: `${phase}-warm-horizon`, backgroundGradient: "radial-gradient(circle at 20% 8%, rgba(214,168,79,.22), transparent 30%), radial-gradient(circle at 82% 24%, rgba(244,114,74,.12), transparent 34%), linear-gradient(145deg, rgba(31,24,12,.82), rgba(15,23,42,.84))", glowIntensity: "0 0 60px rgba(214,168,79,.24)", moodLabel: mood === "dry" ? `${phasePrefix} dry air` : `${phasePrefix} warm air`, chipStyle: "border-gold/25 bg-gold/10 text-gold", timePhase: phase, climateMood: mood };
  if (mood === "cool") return { themeName: `${phase}-cool-current`, backgroundGradient: "radial-gradient(circle at 16% 10%, rgba(186,230,253,.14), transparent 28%), radial-gradient(circle at 80% 18%, rgba(99,102,241,.12), transparent 30%), linear-gradient(145deg, rgba(15,23,42,.82), rgba(2,6,23,.9))", glowIntensity: "0 0 54px rgba(186,230,253,.18)", moodLabel: `${phasePrefix} cool air`, chipStyle: "border-sky/20 bg-sky/10 text-sky-100", timePhase: phase, climateMood: mood };
  return { themeName: phase === "dawn" ? "first-light" : phase === "dusk" ? "blue-hour" : "clear-day", backgroundGradient: "radial-gradient(circle at 16% 10%, rgba(88,225,132,.15), transparent 28%), radial-gradient(circle at 80% 18%, rgba(56,189,248,.13), transparent 30%), linear-gradient(145deg, rgba(15,23,42,.76), rgba(2,6,23,.88))", glowIntensity: "0 0 54px rgba(88,225,132,.18)", moodLabel: phase === "dawn" ? "First light" : phase === "dusk" ? "Blue hour" : "Mild local air", chipStyle: "border-radio/20 bg-radio/10 text-radio", timePhase: phase, climateMood: mood };
}
