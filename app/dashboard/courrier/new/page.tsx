"use client";

import { useRouter } from "next/navigation";
import MailForm from "@/components/mail/MailForm";

export default function NewCourrierPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl px-3 pb-24 sm:px-4">
      <section className="rounded-3xl border border-white/10 bg-slate-900/65 p-4 shadow-xl backdrop-blur sm:p-6">
        <div className="mb-5">
          <p className="text-xs uppercase tracking-[0.22em] text-violet-200/70">Module Courrier</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-white">
            📥 Ajouter un courrier
          </h1>
        </div>

        <MailForm
          defaultContext="pro"
          onSave={() => router.push("/dashboard/courrier")}
          onCancel={() => router.push("/dashboard/courrier")}
        />
      </section>
    </div>
  );
}
