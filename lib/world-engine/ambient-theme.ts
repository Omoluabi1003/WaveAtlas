import type { WorldContext } from "./types";

export type AmbientTheme = {
  themeName: string;
  backgroundGradient: string;
  glowIntensity: string;
  moodLabel: string;
  chipStyle: string;
  timePhase: "dawn" | "day" | "dusk" | "night";
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

export function getAmbientTheme(context: WorldContext | null | undefined): AmbientTheme {
  const climate = context?.climate;
  const phase = timePhase(hourFromLocalTime(context?.radioDNA.localTime));
  const hot = typeof climate?.temperatureC === "number" && climate.temperatureC >= 30;
  const humid = typeof climate?.humidityPercent === "number" && climate.humidityPercent >= 70;
  const rainy = typeof climate?.rainfallMillimeters === "number" && climate.rainfallMillimeters > 2;
  const dry = typeof climate?.humidityPercent === "number" && climate.humidityPercent <= 35;
  const region = context?.radioDNA.region?.toLowerCase() ?? "";
  const warmRegion = /africa|caribbean|latin|asia|oceania/.test(region);

  if (phase === "night") return { themeName: "midnight-signal", backgroundGradient: "radial-gradient(circle at 18% 8%, rgba(56,189,248,.16), transparent 28%), linear-gradient(145deg, rgba(3,7,18,.92), rgba(15,23,42,.78))", glowIntensity: "0 0 64px rgba(56,189,248,.22)", moodLabel: rainy || humid ? "Soft night air" : "Night signal", chipStyle: "border-sky/20 bg-sky/10 text-sky-100", timePhase: phase };
  if (rainy || humid) return { themeName: "humid-haze", backgroundGradient: "radial-gradient(circle at 18% 10%, rgba(125,211,252,.16), transparent 30%), radial-gradient(circle at 82% 22%, rgba(88,225,132,.12), transparent 32%), linear-gradient(145deg, rgba(8,47,73,.74), rgba(15,23,42,.82))", glowIntensity: "0 0 58px rgba(125,211,252,.20)", moodLabel: rainy ? "Rain-softened air" : "Humid air", chipStyle: "border-cyan-200/20 bg-cyan-200/10 text-cyan-50", timePhase: phase };
  if (hot || dry || warmRegion) return { themeName: "warm-horizon", backgroundGradient: "radial-gradient(circle at 20% 8%, rgba(214,168,79,.18), transparent 30%), radial-gradient(circle at 82% 24%, rgba(244,114,74,.10), transparent 34%), linear-gradient(145deg, rgba(31,24,12,.78), rgba(15,23,42,.84))", glowIntensity: "0 0 54px rgba(214,168,79,.20)", moodLabel: dry ? "Dry warm air" : "Warm horizon", chipStyle: "border-gold/25 bg-gold/10 text-gold", timePhase: phase };
  return { themeName: phase === "dawn" ? "first-light" : phase === "dusk" ? "blue-hour" : "clear-day", backgroundGradient: "radial-gradient(circle at 16% 10%, rgba(88,225,132,.13), transparent 28%), radial-gradient(circle at 80% 18%, rgba(56,189,248,.12), transparent 30%), linear-gradient(145deg, rgba(15,23,42,.72), rgba(2,6,23,.86))", glowIntensity: "0 0 50px rgba(88,225,132,.16)", moodLabel: phase === "dawn" ? "First light" : phase === "dusk" ? "Blue hour" : "Clear local air", chipStyle: "border-radio/20 bg-radio/10 text-radio", timePhase: phase };
}
