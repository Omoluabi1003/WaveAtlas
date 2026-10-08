export function uniquePlaceLabel(parts: Array<string | undefined>, separator = ", "): string {
  const seen = new Set<string>();
  return parts.filter((part): part is string => {
    const key = part?.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((part) => part.trim()).join(separator);
}
