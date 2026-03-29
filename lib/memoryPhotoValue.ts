export const MAX_MEMORY_PHOTOS = 5;

function normalizeMemoryPhotoUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const rawUrl of urls) {
    const url = rawUrl.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    normalized.push(url);
    if (normalized.length >= MAX_MEMORY_PHOTOS) break;
  }

  return normalized;
}

export function parseMemoryPhotoUrls(value: string | null | undefined): string[] {
  const rawValue = String(value || '').trim();
  if (!rawValue) return [];

  try {
    const parsed = JSON.parse(rawValue) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeMemoryPhotoUrls(parsed.map((entry) => String(entry || '')));
    }
    if (typeof parsed === 'string') {
      return normalizeMemoryPhotoUrls([parsed]);
    }
  } catch {
    // Keep backward compatibility with legacy single-URL string values.
  }

  return normalizeMemoryPhotoUrls([rawValue]);
}

export function serializeMemoryPhotoUrls(urls: string[]): string | null {
  const normalized = normalizeMemoryPhotoUrls(urls);
  if (normalized.length === 0) return null;
  if (normalized.length === 1) return normalized[0];
  return JSON.stringify(normalized);
}

export function appendMemoryPhotoUrl(
  currentValue: string | null | undefined,
  nextUrl: string
): string | null {
  const urls = parseMemoryPhotoUrls(currentValue);
  return serializeMemoryPhotoUrls([...urls, nextUrl]);
}

export function removeMemoryPhotoUrl(
  currentValue: string | null | undefined,
  urlToRemove: string
): string | null {
  const nextUrls = parseMemoryPhotoUrls(currentValue).filter((url) => url !== urlToRemove);
  return serializeMemoryPhotoUrls(nextUrls);
}

export function getPrimaryMemoryPhotoUrl(value: string | null | undefined): string | null {
  return parseMemoryPhotoUrls(value)[0] || null;
}