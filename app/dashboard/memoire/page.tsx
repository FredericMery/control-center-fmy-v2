"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";

type Section = {
  id: string;
  name: string;
  slug: string;
  allow_image: boolean;
  user_id: string;
};

export default function MemoirePage() {
  const user = useAuthStore((s) => s.user);

  const [sections, setSections] = useState<Section[]>([]);
  const [showForm, setShowForm] = useState(false);

  const [sectionName, setSectionName] = useState("");
  const [fields, setFields] = useState(["", "", "", ""]);
  const [allowImage, setAllowImage] = useState(true);
  const [templateParts, setTemplateParts] = useState<string[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchSections = async () => {
      const { data } = await supabase
        .from("memory_sections")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setSections(data || []);
    };

    fetchSections();

    const channel = supabase
      .channel("memory_sections_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "memory_sections",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setSections((prev) => [payload.new as Section, ...prev]);
          }
          if (payload.eventType === "DELETE") {
            setSections((prev) =>
              prev.filter((s) => s.id !== payload.old.id)
            );
          }
          if (payload.eventType === "UPDATE") {
            setSections((prev) =>
              prev.map((s) =>
                s.id === payload.new.id ? (payload.new as Section) : s
              )
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const createSection = async () => {
    if (!sectionName || !user) return;

    const slug = sectionName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");

    const template = templateParts.join(" ");

    const { data: sectionData } = await supabase
      .from("memory_sections")
      .insert([
        {
          name: sectionName,
          slug,
          search_template: template || "${title}",
          allow_image: allowImage,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    if (!sectionData) return;

    const validFields = fields.filter((f) => f.trim() !== "");

    if (validFields.length > 0) {
      await supabase.from("memory_section_fields").insert(
        validFields.map((field) => ({
          section_id: sectionData.id,
          label: field,
          field_key: field.toLowerCase().replace(/\s+/g, "_"),
        }))
      );
    }

    resetForm();
  };

  const deleteSection = async (id: string) => {
    if (!confirm("Supprimer cette section et tout son contenu ?")) return;

    await supabase.from("memory_section_fields").delete().eq("section_id", id);
    await supabase.from("memory_items").delete().eq("section_id", id);
    await supabase.from("memory_sections").delete().eq("id", id);
  };

  const resetForm = () => {
    setSectionName("");
    setFields(["", "", "", ""]);
    setTemplateParts([]);
    setAllowImage(true);
    setShowForm(false);
  };

  return (
    <div className="relative min-h-screen text-blue-950">

      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-gray-50 via-white to-gray-100" />
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] bg-black/5 rounded-full blur-3xl -z-10" />
      <div className="absolute -bottom-40 -left-40 w-[500px] h-[500px] bg-gray-400/5 rounded-full blur-3xl -z-10" />

      {/* Header */}
      <div className="flex justify-between items-center mb-14">
        <h1 className="text-3xl font-semibold tracking-tight">Mémoire</h1>

        <button
          onClick={() => setShowForm(true)}
          className="relative inline-flex items-center gap-2 px-7 py-3 rounded-full text-sm font-medium text-white bg-gradient-to-r from-black via-gray-900 to-black shadow-lg shadow-black/20 hover:shadow-2xl hover:shadow-black/30 hover:scale-105 active:scale-95 transition-all duration-300"
        >
          <span className="text-lg">＋</span>
          Section
        </button>
      </div>

      {/* Grid */}
      <div className="grid gap-10 md:grid-cols-2">

        {sections.map((section, index) => (
          <div
            key={section.id}
            className="group relative rounded-3xl transition-all duration-500 hover:-translate-y-2"
            style={{
              animation: `fadeInUp 0.5s ease ${index * 0.08}s forwards`,
              opacity: 0,
            }}
          >
            <div className="relative p-[1px] rounded-3xl bg-gradient-to-br from-gray-200 via-white to-gray-200 group-hover:from-black/30 group-hover:to-gray-400/20 transition-all duration-500">
              <div className="bg-white/70 backdrop-blur-2xl rounded-3xl p-8 shadow-md group-hover:shadow-2xl transition-all duration-500">

                <Link
                  href={`/dashboard/memoire/${section.slug}`}
                  className="block space-y-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-black to-gray-800 text-white flex items-center justify-center text-lg font-semibold shadow-lg">
                      {section.name.charAt(0).toUpperCase()}
                    </div>

                    <h2 className="text-xl font-semibold tracking-tight">
                      {section.name}
                    </h2>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {section.allow_image && (
                      <span className="px-3 py-1 bg-gray-100 rounded-full">
                        Image autorisée
                      </span>
                    )}
                    <span className="px-3 py-1 bg-gray-50 border border-gray-200 rounded-full">
                      Section
                    </span>
                  </div>
                </Link>

                <button
                  onClick={() => deleteSection(section.id)}
                  className="absolute top-6 right-6 opacity-0 group-hover:opacity-100 transition-all duration-300 text-gray-400 hover:text-red-500"
                >
                  🗑
                </button>

              </div>
            </div>
          </div>
        ))}

      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-md flex items-center justify-center z-50">
          <div className="bg-white w-full max-w-xl rounded-3xl shadow-2xl p-10 space-y-6 text-blue-950">
            <h2 className="text-xl font-semibold">
              Créer une nouvelle section mémoire
            </h2>

            <input
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              placeholder="Nom de la section"
              className="w-full p-4 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
            />

            <div className="flex justify-end gap-4 pt-4">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600"
              >
                Annuler
              </button>

              <button
                onClick={createSection}
                className="px-6 py-2 bg-black text-white rounded-xl hover:opacity-90 transition"
              >
                Créer
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes fadeInUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
      `}</style>

    </div>
  );
}
