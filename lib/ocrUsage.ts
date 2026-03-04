const OCR_USAGE_KEY = 'ocr_scan_request_count';
const OCR_USAGE_EVENT = 'ocr-usage-updated';

export function getOcrUsageCount(): number {
  if (typeof window === 'undefined') return 0;
  const raw = window.localStorage.getItem(OCR_USAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function incrementOcrUsageCount(): number {
  if (typeof window === 'undefined') return 0;
  const next = getOcrUsageCount() + 1;
  window.localStorage.setItem(OCR_USAGE_KEY, String(next));
  window.dispatchEvent(new CustomEvent(OCR_USAGE_EVENT, { detail: next }));
  return next;
}

export function subscribeToOcrUsageCount(callback: (count: number) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  const onCustom = (event: Event) => {
    const customEvent = event as CustomEvent<number>;
    if (typeof customEvent.detail === 'number') {
      callback(customEvent.detail);
      return;
    }
    callback(getOcrUsageCount());
  };

  const onStorage = (event: StorageEvent) => {
    if (event.key === OCR_USAGE_KEY) {
      callback(getOcrUsageCount());
    }
  };

  window.addEventListener(OCR_USAGE_EVENT, onCustom as EventListener);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(OCR_USAGE_EVENT, onCustom as EventListener);
    window.removeEventListener('storage', onStorage);
  };
}
