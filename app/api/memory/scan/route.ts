import { NextRequest, NextResponse } from 'next/server';

type ScanField = {
  id: string;
  field_label: string;
  field_type: string;
  options?: string[] | null;
};

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s:/.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDate(text: string): string | null {
  const patterns = [
    /(\d{4}-\d{2}-\d{2})/,
    /(\d{2}\/\d{2}\/\d{4})/,
    /(\d{2}-\d{2}-\d{4})/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }

  return null;
}

function extractRating(text: string): string | null {
  const ratingPattern = /(?:^|\s)([1-5])\s*(?:\/\s*5)?(?:\s|$)/;
  const match = text.match(ratingPattern);
  if (match?.[1]) return match[1];
  return null;
}

function extractNumber(text: string): string | null {
  const match = text.match(/\b(\d+(?:[.,]\d+)?)\b/);
  if (!match?.[1]) return null;
  return match[1].replace(',', '.');
}

function extractValueFromLines(lines: string[], label: string): string | null {
  const normalizedLabel = normalize(label);

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const normalizedLine = normalize(rawLine);

    if (!normalizedLine) continue;

    const startsWithLabel =
      normalizedLine.startsWith(`${normalizedLabel}:`) ||
      normalizedLine.startsWith(`${normalizedLabel} -`) ||
      normalizedLine.startsWith(`${normalizedLabel} `);

    const includesLabel = normalizedLine.includes(` ${normalizedLabel}:`) || normalizedLine.includes(`${normalizedLabel}:`);

    if (!startsWithLabel && !includesLabel) continue;

    const split = rawLine.split(/[:\-]/);
    if (split.length > 1) {
      const candidate = split.slice(1).join('-').trim();
      if (candidate) return candidate;
    }

    const next = lines[i + 1]?.trim();
    if (next && !normalize(next).includes(normalizedLabel)) {
      return next;
    }
  }

  return null;
}

function mapTextToFields(rawText: string, fields: ScanField[]) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const normalizedText = normalize(rawText);
  const mappedValues: Record<string, string> = {};

  for (const field of fields) {
    if (field.field_type === 'url') continue;

    let value: string | null = extractValueFromLines(lines, field.field_label);

    if (field.field_type === 'select' && field.options?.length) {
      const matchedOption = field.options.find((option) =>
        normalizedText.includes(normalize(option))
      );
      if (matchedOption) value = matchedOption;
    }

    if (field.field_type === 'rating') {
      value = value ? extractRating(value) : extractRating(rawText);
    }

    if (field.field_type === 'date') {
      value = value ? extractDate(value) : extractDate(rawText);
    }

    if (field.field_type === 'number') {
      value = value ? extractNumber(value) : extractNumber(rawText);
    }

    if (value) {
      mappedValues[field.id] = value.trim();
    }
  }

  const suggestedTitle = lines[0] || '';

  return {
    mappedValues,
    suggestedTitle: suggestedTitle.slice(0, 120),
  };
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.GOOGLE_VISION_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_VISION_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'Google Vision API key missing (GOOGLE_VISION_API_KEY).' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const imageBase64 = body?.imageBase64 as string | undefined;
    const fields = (body?.fields || []) as ScanField[];

    if (!imageBase64) {
      return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 });
    }

    const cleanBase64 = imageBase64.includes(',')
      ? imageBase64.split(',')[1]
      : imageBase64;

    const visionRes = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: cleanBase64 },
              features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      }
    );

    const visionData = await visionRes.json();

    if (!visionRes.ok) {
      return NextResponse.json(
        {
          error:
            visionData?.error?.message || 'Google Vision API error',
        },
        { status: 502 }
      );
    }

    const rawText =
      visionData?.responses?.[0]?.fullTextAnnotation?.text ||
      visionData?.responses?.[0]?.textAnnotations?.[0]?.description ||
      '';

    if (!rawText) {
      return NextResponse.json({ rawText: '', mappedValues: {}, suggestedTitle: '' });
    }

    const mapped = mapTextToFields(rawText, fields);

    return NextResponse.json({
      rawText,
      mappedValues: mapped.mappedValues,
      suggestedTitle: mapped.suggestedTitle,
      filledCount: Object.keys(mapped.mappedValues).length,
    });
  } catch (error) {
    console.error('Error in OCR scan:', error);
    return NextResponse.json(
      { error: 'Failed to scan image' },
      { status: 500 }
    );
  }
}
