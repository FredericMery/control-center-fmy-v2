"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { MAIL_MAX_SCAN_FILES, type AiMailAnalysis } from "@/types/mail";

interface Props {
  onComplete: (data: {
    scan_url: string | null;
    scan_file_name: string | null;
    scan_urls: string[];
    scan_file_names: string[];
    full_text: string | null;
    ai_analysis: AiMailAnalysis | null;
  }) => void;
  onCancel: () => void;
}

export default function MailScanUpload({ onComplete, onCancel }: Props) {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Array<string | null>>([]);
  const [status, setStatus] = useState<
    "idle" | "uploading" | "ocr" | "ai" | "done" | "error"
  >("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const STEPS = [
    { key: "uploading", label: "Upload du scan…", pct: 25 },
    { key: "ocr",       label: "Lecture OCR…",   pct: 55 },
    { key: "ai",        label: "Analyse IA…",     pct: 85 },
    { key: "done",      label: "Terminé ✓",       pct: 100 },
  ];

  useEffect(() => {
    const nextPreviewUrls = files.map((file) => (
      file.type.startsWith("image/") ? URL.createObjectURL(file) : null
    ));

    setPreviewUrls(nextPreviewUrls);

    return () => {
      nextPreviewUrls.forEach((url) => {
        if (url) URL.revokeObjectURL(url);
      });
    };
  }, [files]);

  const handleFiles = (nextFiles: File[], mode: "replace" | "append" = "replace") => {
    const mergedFiles = mode === "append" ? [...files, ...nextFiles] : nextFiles;
    const dedupedFiles = Array.from(
      new Map(
        mergedFiles.map((file) => [`${file.name}-${file.size}-${file.lastModified}-${file.type}`, file])
      ).values()
    );
    const safeFiles = dedupedFiles.slice(0, MAIL_MAX_SCAN_FILES);

    setFiles(safeFiles);
    setError(null);

    if (mode === "append" && dedupedFiles.length > MAIL_MAX_SCAN_FILES) {
      setError(`Maximum ${MAIL_MAX_SCAN_FILES} documents pour un courrier`);
    }

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) handleFiles(dropped, files.length > 0 ? "append" : "replace");
  };

  const handleRemoveFile = (indexToRemove: number) => {
    const nextFiles = files.filter((_, index) => index !== indexToRemove);
    setFiles(nextFiles);
    setError(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  const handleMoveFile = (indexToMove: number, direction: "up" | "down") => {
    const targetIndex = direction === "up" ? indexToMove - 1 : indexToMove + 1;
    if (targetIndex < 0 || targetIndex >= files.length) return;

    const nextFiles = [...files];
    const [movedFile] = nextFiles.splice(indexToMove, 1);
    nextFiles.splice(targetIndex, 0, movedFile);
    setFiles(nextFiles);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setProgress(10);
    setError(null);

    try {
      const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/mail/scan` : "/api/mail/scan";
      const filesToUpload = files.slice(0, MAIL_MAX_SCAN_FILES);
      const scanUrls: string[] = [];
      const scanFileNames: string[] = [];
      const textParts: string[] = [];

      for (let index = 0; index < filesToUpload.length; index += 1) {
        const progressBase = 10 + Math.round((index / Math.max(1, filesToUpload.length)) * 55);
        setProgress(progressBase);
        setStatus("uploading");

        const formData = new FormData();
        formData.append("file", filesToUpload[index]);

        const res = await fetch(endpoint, {
          method: "POST",
          credentials: "include",
          body: formData,
        });
        const json = await readJsonSafely(res);

        if (!res.ok) {
          throw new Error(getApiErrorMessage(json, "Erreur lors du scan"));
        }

        const chunkUrls = normalizeStringArray(json?.scan_urls, json?.scan_url);
        const chunkNames = normalizeStringArray(json?.scan_file_names, json?.scan_file_name);
        scanUrls.push(...chunkUrls);
        scanFileNames.push(...chunkNames);

        const chunkText = String(json?.full_text || "").trim();
        if (chunkText) {
          textParts.push(chunkText);
        }
      }

      setProgress(70);
      setStatus("ocr");

      const mergedScanUrls = Array.from(new Set(scanUrls)).slice(0, MAIL_MAX_SCAN_FILES);
      const mergedScanFileNames = Array.from(new Set(scanFileNames)).slice(0, MAIL_MAX_SCAN_FILES);
      const fullText = textParts.filter(Boolean).join("\n\n");

      setProgress(85);
      setStatus("ai");

      const aiAnalysis = await analyzeMergedText(fullText);

      setProgress(100);
      setStatus("done");

      setTimeout(() => {
        onComplete({
          scan_url: mergedScanUrls[0] || null,
          scan_file_name: mergedScanFileNames[0] || null,
          scan_urls: mergedScanUrls,
          scan_file_names: mergedScanFileNames,
          full_text: fullText || null,
          ai_analysis: aiAnalysis,
        });
      }, 600);
    } catch (err: unknown) {
      setStatus("error");
      setError(mapScanUploadError(err instanceof Error ? err.message : "Erreur inconnue"));
    }
  };

  const currentStep = STEPS.find((s) => s.key === status);
  const mainPreview = previewUrls[0];

  return (
    <div className="space-y-4">
      {/* Zone de dépôt */}
      {status === "idle" && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all ${
            dragging
              ? "border-violet-400 bg-violet-400/10"
              : "border-white/20 bg-slate-900/40 hover:border-violet-400/60 hover:bg-violet-400/5"
          }`}
        >
          <div className="text-4xl mb-3">📎</div>
          <p className="text-sm font-medium text-slate-200">
            Glissez votre courrier ici ou cliquez pour sélectionner
          </p>
          <p className="mt-1 text-xs text-slate-500">
            JPG, PNG, WEBP, HEIC, PDF · max 15 Mo par piece · jusqu a {MAIL_MAX_SCAN_FILES} pieces
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files || []), files.length > 0 ? "append" : "replace")}
          />
        </div>
      )}

      {/* Aperçu */}
      {files.length > 0 && status === "idle" && (
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <div className="flex items-center gap-3">
            {mainPreview ? (
              <Image
                src={mainPreview}
                alt="aperçu"
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-lg object-cover border border-white/10"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-slate-800 text-2xl">
                📄
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-slate-100">{files[0].name}</p>
              <p className="text-xs text-slate-500">
                {files.length} piece(s) selectionnee(s) pour ce courrier
              </p>
              {files.length < MAIL_MAX_SCAN_FILES && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    inputRef.current?.click();
                  }}
                  className="mt-2 inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-2.5 py-1 text-xs font-medium text-violet-200 transition-colors hover:bg-violet-400/20"
                >
                  <span className="text-sm leading-none">+</span>
                  Ajouter un document
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFiles([]); setPreviewUrls([]); }}
              className="text-slate-500 hover:text-red-400 transition-colors text-lg"
            >
              ✕
            </button>
          </div>

          {files.length > 0 && (
            <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3">
              {files.map((file, index) => (
                <div
                  key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-950/40 px-2.5 py-2 text-xs text-slate-300"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {previewUrls[index] ? (
                      <Image
                        src={previewUrls[index]!}
                        alt={file.name}
                        width={44}
                        height={44}
                        unoptimized
                        className="h-11 w-11 flex-shrink-0 rounded-md border border-white/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md border border-white/10 bg-slate-800 text-base">
                        📄
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{index + 1}. {file.name}</span>
                        {index === 0 && (
                          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300">
                            Principal
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] text-slate-500">{Math.round(file.size / 1024)} Ko</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveFile(index, "up");
                      }}
                      disabled={index === 0}
                      className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMoveFile(index, "down");
                      }}
                      disabled={index === files.length - 1}
                      className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:border-white/20 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-35"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveFile(index);
                      }}
                      className="ml-1 rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:border-red-400/40 hover:text-red-300"
                    >
                      Supprimer
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Barre de progression */}
      {["uploading", "ocr", "ai", "done"].includes(status) && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4">
            <div className="relative h-10 w-10 flex-shrink-0">
              <svg className="h-10 w-10 -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
                <circle
                  cx="18" cy="18" r="15.9" fill="none"
                  stroke="#8b5cf6" strokeWidth="3"
                  strokeDasharray={`${progress} 100`}
                  className="transition-all duration-700"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-violet-300">
                {progress}%
              </span>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {currentStep?.label || "En cours…"}
              </p>
              <p className="text-xs text-slate-500">
                Analyse IA sur tous les documents de ce courrier
              </p>
            </div>
          </div>

          {/* Steps indicator */}
          <div className="flex gap-1">
            {STEPS.map((step) => (
              <div
                key={step.key}
                className={`h-1 flex-1 rounded-full transition-all duration-500 ${
                  progress >= step.pct ? "bg-violet-500" : "bg-slate-700"
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Erreur */}
      {status === "error" && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
          ⚠️ {error}
        </div>
      )}

      {/* Boutons */}
      {(status === "idle" || status === "error") && (
        <div className="flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-white/10 bg-slate-800 py-2.5 text-sm text-slate-300 hover:bg-slate-700 transition-colors"
          >
            Annuler
          </button>
          {files.length > 0 && (
            <button
              onClick={handleUpload}
              className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-semibold text-white hover:bg-violet-500 transition-colors"
            >
              🔍 Scanner & Analyser ({files.length})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function mapScanUploadError(message: string) {
  const raw = String(message || "").trim();
  const lower = raw.toLowerCase();

  if (!raw) return "Erreur lors du scan du courrier.";

  if (
    lower.includes("did not match the expected pattern") ||
    lower.includes("expected pattern") ||
    lower.includes("string did not match")
  ) {
    return `Erreur iPhone/PWA pendant l'envoi du fichier (${raw}). Essaie de fermer/reouvrir l'app puis reessaye.`;
  }

  return raw;
}

async function analyzeMergedText(fullText: string): Promise<AiMailAnalysis | null> {
  if (!fullText || fullText.length < 30) return null;

  const endpoint = typeof window !== "undefined"
    ? `${window.location.origin}/api/mail/scan/analyze`
    : "/api/mail/scan/analyze";

  const res = await fetch(endpoint, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ full_text: fullText }),
  });

  const json = await readJsonSafely(res);
  if (!res.ok) {
    return null;
  }

  return (json?.ai_analysis || null) as AiMailAnalysis | null;
}

function normalizeStringArray(value: unknown, fallback: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => String(entry || "").trim())
      .filter(Boolean);
  }

  const single = String(fallback || "").trim();
  return single ? [single] : [];
}

function getApiErrorMessage(json: unknown, fallback: string): string {
  if (json && typeof json === "object" && "error" in json) {
    const message = String((json as { error?: unknown }).error || "").trim();
    if (message) return message;
  }
  return fallback;
}

async function readJsonSafely(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const data = await response.json();
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
