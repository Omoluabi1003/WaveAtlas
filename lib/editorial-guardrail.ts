const NUMBER_WITH_CONTEXT = /\b\d+(?:\.\d+)?\s?(?:°[CF]|km|mi|m|ft|meters?|metres?|kilometers?|kilometres?|miles?|percent|%|million|billion|thousand|stations?|signals?|people|residents?|listeners?|hours?|minutes?|seconds?|ms|years?|century|centuries|languages?|votes?|kbps|°)\b/i;
const NAKED_NUMBER = /\b\d+(?:\.\d+)?[.!?]$/;
const RAW_WIKI_MARKERS = /\b(is a|was a|refers to|may refer to|coordinates|citation needed|according to wikipedia)\b/i;

export function formatEditorialNumber(value: number, context: string) {
  const abs = Math.abs(value);
  const formatted = abs >= 1_000_000_000 ? `${(value / 1_000_000_000).toFixed(abs >= 10_000_000_000 ? 0 : 1).replace(/\.0$/, "")} billion ${context}` : abs >= 1_000_000 ? `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace(/\.0$/, "")} million ${context}` : `${value.toLocaleString()} ${context}`;
  return formatted;
}

function hasBareNumericFact(sentence: string) {
  const numericTokens = sentence.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  if (!numericTokens.length) return false;
  return !NUMBER_WITH_CONTEXT.test(sentence);
}

function isCompleteEditorialSentence(sentence: string) {
  const trimmed = sentence.trim();
  if (!/^[A-Z0-9“"'‘]/.test(trimmed) || !/[.!?]["')\]]?$/.test(trimmed)) return false;
  if (NAKED_NUMBER.test(trimmed) || hasBareNumericFact(trimmed)) return false;
  if (trimmed.split(/\s+/).length < 7 || trimmed.length > 230) return false;
  if (RAW_WIKI_MARKERS.test(trimmed) && trimmed.length > 150) return false;
  return true;
}

export function extractEditorialSentences(text: string, limit = 2) {
  const normalized = text.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();
  const sentences = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g)?.map((item) => item.trim()) ?? [];
  return sentences.filter(isCompleteEditorialSentence).slice(0, limit).join(" ");
}

export function guardEditorialCopy(candidates: Array<string | undefined | null>) {
  for (const candidate of candidates) {
    const copy = extractEditorialSentences(candidate || "", 2);
    if (copy) return copy;
  }
  return "";
}
