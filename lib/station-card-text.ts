import { ArabicShaper } from 'arabic-persian-reshaper';
import bidiFactory from 'bidi-js';

const bidi = bidiFactory();
// Satori does not shape connected Arabic or apply Unicode bidi layout. This
// affects only the server-rendered card; metadata and shared text remain untouched.
export function stationCardVisualText(text: string) {
  if (!/[\p{Script=Arabic}\p{Script=Hebrew}]/u.test(text)) return text;
  const shaped = /\p{Script=Arabic}/u.test(text) ? ArabicShaper.convertArabic(text) : text;
  return bidi.getReorderedString(shaped, bidi.getEmbeddingLevels(shaped));
}
