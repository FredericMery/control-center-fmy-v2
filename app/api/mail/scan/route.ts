import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { PDFDocument } from 'pdf-lib';
import { getUserIdFromRequest } from '@/lib/auth/serverAuth';
import { callGoogleVision } from '@/lib/ai/client';
import { analyzeMailText } from '@/lib/mail/analyzeMailText';
import { MAIL_MAX_SCAN_FILES, type AiMailAnalysis } from '@/types/mail';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'application/pdf',
]);

// POST /api/mail/scan — upload scan + OCR + analyse IA
export async function POST(request: NextRequest) {
  const userId = await getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'FormData invalide' }, { status: 400 });
  }

  const rawFiles = formData.getAll('files');
  const singleFile = formData.get('file');
  const combinePdf = formData.get('combine_pdf') === 'true';
  const skipAi = formData.get('skip_ai') === 'true';
  const files = (rawFiles.length > 0 ? rawFiles : singleFile ? [singleFile] : [])
    .filter((entry): entry is File => entry instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ error: 'Fichier requis' }, { status: 400 });
  }

  if (files.length > MAIL_MAX_SCAN_FILES) {
    return NextResponse.json({ error: `Maximum ${MAIL_MAX_SCAN_FILES} pieces par courrier` }, { status: 400 });
  }
  if (combinePdf && files.some((file) => !['image/jpeg', 'image/png'].includes(file.type))) {
    return NextResponse.json(
      { error: 'Le PDF continu accepte uniquement les captures JPG ou PNG' },
      { status: 400 }
    );
  }
  const maxSize = 15 * 1024 * 1024; // 15 MB
  const uploaded: Array<{ url: string; name: string; text: string; type: string; buffer: Buffer }> = [];

  for (const file of files) {
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: 'Format non supporte. Utilisez JPG, PNG, WEBP ou PDF.' },
        { status: 400 }
      );
    }

    if (file.size > maxSize) {
      return NextResponse.json({ error: `Fichier trop volumineux (${file.name}) - max 15 Mo` }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // 1. Upload dans Supabase Storage
    const timestamp = Date.now();
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `${timestamp}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storagePath = `${userId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('mail-scans')
      .upload(storagePath, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: 'Erreur upload scan' }, { status: 500 });
    }

    // URL signée valable 10 ans (pour archivage)
    const { data: signedData } = await supabase.storage
      .from('mail-scans')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10);

    const scanUrl = signedData?.signedUrl || '';

    // 2. OCR via Google Vision (uniquement pour les images)
    // (texte natif pour les PDF)
    let ocrText = '';
    if (file.type === 'application/pdf') {
      ocrText = await extractPdfText(buffer);
    } else {
      try {
        const base64 = buffer.toString('base64');
        ocrText = await callGoogleVision(userId, base64);
      } catch (err) {
        console.error('OCR error:', err);
      }
    }

    uploaded.push({ url: scanUrl, name: fileName, text: ocrText || '', type: file.type, buffer });
  }

  const validUploads = uploaded.filter((entry) => entry.url);
  const scanUrls = validUploads.map((entry) => entry.url).slice(0, MAIL_MAX_SCAN_FILES);
  const scanFileNames = validUploads.map((entry) => entry.name).slice(0, MAIL_MAX_SCAN_FILES);
  const ocrText = uploaded
    .map((entry, index) => (entry.text ? `--- Piece ${index + 1}: ${entry.name} ---\n${entry.text}` : ''))
    .filter(Boolean)
    .join('\n\n');

  // 3. Analyse IA via OpenAI (+ extraction déterministe en complément)
  let aiAnalysis: AiMailAnalysis | null = null;
  if (!skipAi && ocrText) {
    aiAnalysis = await analyzeMailText(userId, ocrText);
  }

  let responseScanUrls = scanUrls;
  let responseScanFileNames = scanFileNames;

  if (combinePdf) {
    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await buildCombinedScanPdf(uploaded);
    } catch (error) {
      console.error('Combined PDF creation error:', error);
      return NextResponse.json({ error: 'Impossible de créer le PDF du courrier' }, { status: 500 });
    }

    const timestamp = Date.now();
    const pdfStorageName = `${timestamp}-${Math.random().toString(36).slice(2, 8)}-courrier-scan.pdf`;
    const pdfStoragePath = `${userId}/${pdfStorageName}`;
    const { error: pdfUploadError } = await supabase.storage
      .from('mail-scans')
      .upload(pdfStoragePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert: false,
      });

    if (pdfUploadError) {
      console.error('Combined PDF upload error:', pdfUploadError);
      return NextResponse.json({ error: 'Erreur upload du PDF final' }, { status: 500 });
    }

    const { data: pdfSignedData } = await supabase.storage
      .from('mail-scans')
      .createSignedUrl(pdfStoragePath, 60 * 60 * 24 * 365 * 10);
    if (!pdfSignedData?.signedUrl) {
      return NextResponse.json({ error: 'Impossible de générer le lien du PDF final' }, { status: 500 });
    }

    responseScanUrls = [pdfSignedData.signedUrl];
    responseScanFileNames = [pdfStorageName];

    const temporaryPaths = validUploads.map((entry) => `${userId}/${entry.name}`);
    if (temporaryPaths.length > 0) {
      const { error: cleanupError } = await supabase.storage
        .from('mail-scans')
        .remove(temporaryPaths);
      if (cleanupError) {
        console.error('Temporary mail scan cleanup error:', cleanupError);
      }
    }
  }

  return NextResponse.json({
    scan_url: responseScanUrls[0] || null,
    scan_file_name: responseScanFileNames[0] || null,
    scan_urls: responseScanUrls,
    scan_file_names: responseScanFileNames,
    full_text: ocrText || null,
    ai_analysis: aiAnalysis,
  });
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return String(result?.text || '').trim();
    } finally {
      await parser.destroy();
    }
  } catch (err) {
    console.error('PDF text extraction error:', err);
    return '';
  }
}

async function buildCombinedScanPdf(
  sources: Array<{ type: string; buffer: Buffer }>
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const portrait = { width: 595.28, height: 841.89 };
  const landscape = { width: 841.89, height: 595.28 };
  const margin = 18;

  for (const source of sources) {
    const image = source.type === 'image/png'
      ? await pdf.embedPng(source.buffer)
      : await pdf.embedJpg(source.buffer);
    const pageSize = image.width > image.height ? landscape : portrait;
    const page = pdf.addPage([pageSize.width, pageSize.height]);
    const scale = Math.min(
      (pageSize.width - margin * 2) / image.width,
      (pageSize.height - margin * 2) / image.height
    );
    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(image, {
      x: (pageSize.width - width) / 2,
      y: (pageSize.height - height) / 2,
      width,
      height,
    });
  }

  return Buffer.from(await pdf.save());
}
