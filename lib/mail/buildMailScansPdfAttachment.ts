import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage } from 'pdf-lib';

type MailScanSource = {
  url: string;
  name: string;
};

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const PAGE_MARGIN = 24;
let sharpLoader: Promise<SharpLike | null> | null = null;

type SharpLike = (input: Uint8Array) => {
  png: (options?: { quality?: number }) => { toBuffer: () => Promise<Buffer> };
};

export async function buildMailScansPdfAttachment(args: {
  sources: MailScanSource[];
  subject?: string | null;
}): Promise<{ filename: string; content: string } | null> {
  if (!Array.isArray(args.sources) || args.sources.length === 0) {
    return null;
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let pageCount = 0;

  for (const source of args.sources) {
    try {
      const response = await fetch(source.url);
      if (!response.ok) {
        appendInfoPage(doc, font, bold, source.name, 'Impossible de recuperer cette piece pour le PDF final.');
        pageCount += 1;
        continue;
      }

      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentType = normalizeContentType(response.headers.get('content-type'), source.name);
      const normalized = await normalizeForPdfEmbedding(contentType, bytes);

      if (normalized.kind === 'application/pdf') {
        const sourceDoc = await PDFDocument.load(normalized.bytes);
        const pages = await doc.copyPages(sourceDoc, sourceDoc.getPageIndices());
        pages.forEach((page) => doc.addPage(page));
        pageCount += pages.length;
        continue;
      }

      if (normalized.kind === 'image/png') {
        const image = await doc.embedPng(normalized.bytes);
        appendImagePage(doc, image);
        pageCount += 1;
        continue;
      }

      if (normalized.kind === 'image/jpeg') {
        const image = await doc.embedJpg(normalized.bytes);
        appendImagePage(doc, image);
        pageCount += 1;
        continue;
      }

      appendInfoPage(
        doc,
        font,
        bold,
        source.name,
        normalized.note || 'Format non pris en charge automatiquement pour une integration visuelle dans le PDF.'
      );
      pageCount += 1;
    } catch {
      appendInfoPage(doc, font, bold, source.name, 'Une erreur est survenue pendant la preparation de cette piece.');
      pageCount += 1;
    }
  }

  if (pageCount === 0) {
    return null;
  }

  return {
    filename: `${buildSafeBaseName(args.subject, args.sources[0]?.name)}-pieces.pdf`,
    content: Buffer.from(await doc.save()).toString('base64'),
  };
}

function appendImagePage(doc: PDFDocument, image: PDFImage) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const maxWidth = PAGE_WIDTH - PAGE_MARGIN * 2;
  const maxHeight = PAGE_HEIGHT - PAGE_MARGIN * 2;
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;

  page.drawImage(image, {
    x: (PAGE_WIDTH - width) / 2,
    y: (PAGE_HEIGHT - height) / 2,
    width,
    height,
  });
}

function appendInfoPage(doc: PDFDocument, font: PDFFont, bold: PDFFont, fileName: string, message: string) {
  const page = doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);

  page.drawText('Piece jointe non integree visuellement', {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 70,
    size: 16,
    font: bold,
    color: rgb(0.14, 0.14, 0.14),
  });

  page.drawText(`Nom du document: ${fileName || 'inconnu'}`, {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 110,
    size: 11,
    font,
    color: rgb(0.22, 0.22, 0.22),
  });

  page.drawText(message, {
    x: PAGE_MARGIN,
    y: PAGE_HEIGHT - 145,
    size: 11,
    font,
    color: rgb(0.3, 0.3, 0.3),
    maxWidth: PAGE_WIDTH - PAGE_MARGIN * 2,
    lineHeight: 16,
  });
}

function normalizeContentType(contentType: string | null, name: string) {
  const normalizedType = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (normalizedType === 'image/jpg') return 'image/jpeg';
  if (normalizedType) return normalizedType;

  const extension = String(name || '').split('.').pop()?.trim().toLowerCase() || '';
  if (extension === 'pdf') return 'application/pdf';
  if (extension === 'png') return 'image/png';
  if (extension === 'jpg' || extension === 'jpeg') return 'image/jpeg';
  if (extension === 'webp') return 'image/webp';
  if (extension === 'heic' || extension === 'heif') return 'image/heic';
  if (extension === 'avif') return 'image/avif';
  if (extension === 'tif' || extension === 'tiff') return 'image/tiff';
  if (extension === 'bmp') return 'image/bmp';
  if (extension === 'gif') return 'image/gif';
  return 'application/octet-stream';
}

async function normalizeForPdfEmbedding(contentType: string, bytes: Uint8Array): Promise<{
  kind: 'application/pdf' | 'image/png' | 'image/jpeg' | 'unsupported';
  bytes: Uint8Array;
  note?: string;
}> {
  if (contentType === 'application/pdf') {
    return { kind: 'application/pdf', bytes };
  }

  if (contentType === 'image/png') {
    return { kind: 'image/png', bytes };
  }

  if (contentType === 'image/jpeg') {
    return { kind: 'image/jpeg', bytes };
  }

  if (isConvertibleImageType(contentType)) {
    const sharp = await loadSharp();
    if (!sharp) {
      return {
        kind: 'unsupported',
        bytes,
        note: 'Conversion image indisponible sur le serveur pour ce format.',
      };
    }

    try {
      const converted = await sharp(bytes).png({ quality: 90 }).toBuffer();
      return { kind: 'image/png', bytes: new Uint8Array(converted) };
    } catch {
      return {
        kind: 'unsupported',
        bytes,
        note: 'La conversion de cette image vers PNG a echoue.',
      };
    }
  }

  return {
    kind: 'unsupported',
    bytes,
    note: 'Format non pris en charge pour conversion PDF.',
  };
}

function isConvertibleImageType(contentType: string) {
  return [
    'image/webp',
    'image/heic',
    'image/heif',
    'image/avif',
    'image/tiff',
    'image/bmp',
    'image/gif',
  ].includes(contentType);
}

async function loadSharp(): Promise<SharpLike | null> {
  if (!sharpLoader) {
    sharpLoader = import('sharp')
      .then((module) => {
        const sharpCandidate = (module?.default || module) as unknown;
        if (typeof sharpCandidate === 'function') {
          return sharpCandidate as SharpLike;
        }
        return null;
      })
      .catch(() => null);
  }

  return sharpLoader;
}

function buildSafeBaseName(subject: string | null | undefined, fallbackName: string | undefined) {
  const safeSubject = slugify(subject || '');
  if (safeSubject) return safeSubject;

  const safeFallback = slugify(stripExtension(fallbackName || ''));
  return safeFallback || 'courrier';
}

function stripExtension(fileName: string) {
  return fileName.replace(/\.[a-z0-9]+$/i, '');
}

function slugify(value: string) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}