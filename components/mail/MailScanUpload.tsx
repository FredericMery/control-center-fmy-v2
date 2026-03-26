"use client";

import { useState, useRef } from "react";
import type { AiMailAnalysis } from "@/types/mail";
import { getAuthHeaders } from "@/lib/auth/clientSession";

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
  const [preview, setPreview] = useState<string | null>(null);
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

  const handleFiles = (nextFiles: File[]) => {
    const safeFiles = nextFiles.slice(0, 10);
    setFiles(safeFiles);
    setError(null);
    if (safeFiles[0]?.type.startsWith("image/")) {
      const url = URL.createObjectURL(safeFiles[0]);
      setPreview(url);
    } else {
      setPreview(null);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files || []);
    if (dropped.length > 0) handleFiles(dropped);
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setProgress(10);
    setError(null);

    const formData = new FormData();
    files.slice(0, 10).forEach((file) => formData.append("files", file));

    try {
      const headers = await getAuthHeaders(false);
      setProgress(25);
      setStatus("ocr");

      const res = await fetch("/api/mail/scan", {
        method: "POST",
        headers,
        body: formData,
      });

      setProgress(70);
      setStatus("ai");

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error || "Erreur lors du scan");
      }

      setProgress(100);
      setStatus("done");

      setTimeout(() => {
        onComplete({
          scan_url: json.scan_url,
          scan_file_name: json.scan_file_name,
          scan_urls: Array.isArray(json.scan_urls) ? json.scan_urls : json.scan_url ? [json.scan_url] : [],
          scan_file_names: Array.isArray(json.scan_file_names) ? json.scan_file_names : json.scan_file_name ? [json.scan_file_name] : [],
          full_text: json.full_text,
          ai_analysis: json.ai_analysis,
        });
      }, 600);
    } catch (err: unknown) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    }
  };

  const currentStep = STEPS.find((s) => s.key === status);

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
            JPG, PNG, WEBP, HEIC, PDF · max 15 Mo par piece · jusqu a 10 pieces
          </p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            className="hidden"
            onChange={(e) => handleFiles(Array.from(e.target.files || []))}
          />
        </div>
      )}

      {/* Aperçu */}
      {files.length > 0 && status === "idle" && (
        <div className="rounded-xl border border-white/10 bg-slate-900/50 p-3">
          <div className="flex items-center gap-3">
            {preview ? (
              <img
                src={preview}
                alt="aperçu"
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
                {files.length} piece(s) selectionnee(s)
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); setFiles([]); setPreview(null); }}
              className="text-slate-500 hover:text-red-400 transition-colors text-lg"
            >
              ✕
            </button>
          </div>
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
                L'IA analyse votre courrier automatiquement
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
