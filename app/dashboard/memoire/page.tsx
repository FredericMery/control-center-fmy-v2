"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import Link from "next/link";
import {
  buildFieldKey,
  MEMORY_ITEM_CATALOG,
  type MemoryItemType,
} from "@/lib/memoryFieldCatalog";

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
  const [selectedItems, setSelectedItems] = useState<
    { type: MemoryItemType; label: string }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);

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
    if (!sectionName.trim() || !user || selectedItems.length !== 5 || isSaving) {
      return;
    }

    setIsSaving(true);

    const slug = sectionName
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, "")
      .replace(/\s+/g, "-");
    const hasPhoto = selectedItems.some((item) => item.type === "photo");

    const { data: sectionData } = await supabase
      .from("memory_sections")
      .insert([
        {
          name: sectionName,
          slug,
          search_template: "${title}",
          allow_image: hasPhoto,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    if (!sectionData) {
      setIsSaving(false);
      return;
    }

    if (selectedItems.length > 0) {
      await supabase.from("memory_section_fields").insert(
        selectedItems.map((item, index) => ({
          section_id: sectionData.id,
          label: item.label.trim() || item.type,
          field_key: buildFieldKey(item.type, item.label || item.type, index),
        }))
      );
    }

    resetForm();
    setIsSaving(false);
  };

  const toggleItem = (type: MemoryItemType) => {
    const itemDef = MEMORY_ITEM_CATALOG.find((item) => item.type === type);
    if (!itemDef) return;

    setSelectedItems((prev) => {
      const already = prev.some((item) => item.type === type);

      if (already) {
        return prev.filter((item) => item.type !== type);
      }

      if (prev.length >= 5) return prev;

      return [...prev, { type, label: itemDef.defaultLabel }];
    });
  };

  const updateLabel = (type: MemoryItemType, label: string) => {
    setSelectedItems((prev) =>
      prev.map((item) => (item.type === type ? { ...item, label } : item))
    );
  };

  const deleteSection = async (id: string) => {
    if (!confirm("Supprimer cette section et tout son contenu ?")) return;

    await supabase.from("memory_section_fields").delete().eq("section_id", id);
    await supabase.from("memory_items").delete().eq("section_id", id);
    await supabase.from("memory_sections").delete().eq("id", id);
  };

  const resetForm = () => {
    setSectionName("");
    setSelectedItems([]);
    setIsSaving(false);
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

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-gray-600">
                <p>Choisis 5 composants pour la fiche</p>
                <p className="font-medium">{selectedItems.length} / 5</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-64 overflow-auto pr-1">
                {MEMORY_ITEM_CATALOG.map((item) => {
                  const isSelected = selectedItems.some(
                    (selected) => selected.type === item.type
                  );

                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => toggleItem(item.type)}
                      className={`text-left border rounded-xl px-4 py-3 transition ${
                        isSelected
                          ? "border-black bg-black text-white"
                          : "border-gray-200 bg-white hover:border-gray-400"
                      }`}
                    >
                      <p className="font-medium text-sm">{item.name}</p>
                      <p
                        className={`text-xs mt-1 ${
                          isSelected ? "text-gray-200" : "text-gray-500"
                        }`}
                      >
                        {item.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedItems.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Nom personnalisé des composants</p>

                <div className="space-y-2 max-h-52 overflow-auto pr-1">
                  {selectedItems.map((item) => (
                    <div key={item.type} className="grid grid-cols-12 gap-3 items-center">
                      <p className="col-span-4 text-xs text-gray-500 uppercase tracking-wide">
                        {item.type.replace("_", " ")}
                      </p>
                      <input
                        value={item.label}
                        onChange={(e) => updateLabel(item.type, e.target.value)}
                        placeholder="Nom du champ"
                        className="col-span-8 p-2.5 bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-black"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selectedItems.length !== 5 && (
              <p className="text-sm text-amber-600">
                Sélectionne exactement 5 composants pour continuer.
              </p>
            )}

            <div className="flex justify-end gap-4 pt-4">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600"
              >
                Annuler
              </button>

              <button
                onClick={createSection}
                disabled={!sectionName.trim() || selectedItems.length !== 5 || isSaving}
                className="px-6 py-2 bg-black text-white rounded-xl hover:opacity-90 transition disabled:opacity-50"
              >
                {isSaving ? "Création..." : "Créer"}
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
