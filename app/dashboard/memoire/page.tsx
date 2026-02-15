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

    setSections([sectionData, ...sections]);
    resetForm();
  };

  const deleteSection = async (id: string) => {
    if (!confirm("Supprimer cette section et tout son contenu ?")) return;

    await supabase.from("memory_section_fields").delete().eq("section_id", id);
    await supabase.from("memory_items").delete().eq("section_id", id);
    await supabase.from("memory_sections").delete().eq("id", id);

    setSections(sections.filter((section) => section.id !== id));
  };

  const resetForm = () => {
    setSectionName("");
    setFields(["", "", "", ""]);
    setTemplateParts([]);
    setAllowImage(true);
    setShowForm(false);
  };

  return (
    <div>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold">Mémoire</h1>

        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm hover:opacity-80 transition"
        >
          + Section
        </button>
      </div>

      {/* LISTE SECTIONS */}
      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <div
            key={section.id}
            className="bg-white p-6 rounded-2xl shadow-sm flex justify-between items-center hover:shadow-md transition"
          >
            <Link
              href={`/dashboard/memoire/${section.slug}`}
              className="flex-1"
            >
              <h2 className="font-medium text-lg">{section.name}</h2>
            </Link>

            <button
              onClick={() => deleteSection(section.id)}
              className="text-gray-400 hover:text-red-500 transition"
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      {/* FORMULAIRE CREATION */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-50 w-full max-w-xl rounded-3xl shadow-xl p-8 space-y-6">

            <h2 className="text-xl font-semibold">
              Créer une nouvelle section mémoire
            </h2>

            {/* NOM */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">
                Nom de la section
              </label>
              <input
                value={sectionName}
                onChange={(e) => setSectionName(e.target.value)}
                className="w-full p-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
              />
            </div>

            {/* CHAMPS PERSONNALISÉS */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Champs personnalisés
              </p>

              {fields.map((field, index) => (
                <input
                  key={index}
                  placeholder={`Champ ${index + 1}`}
                  value={field}
                  onChange={(e) => {
                    const updated = [...fields];
                    updated[index] = e.target.value;
                    setFields(updated);
                  }}
                  className="w-full p-3 bg-white border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-black"
                />
              ))}
            </div>

            {/* PHOTO */}
            <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200">
              <div>
                <p className="text-sm font-medium">Autoriser une photo</p>
                <p className="text-xs text-gray-500">
                  Permet d’ajouter une image à chaque fiche mémoire
                </p>
              </div>

              <input
                type="checkbox"
                checked={allowImage}
                onChange={() => setAllowImage(!allowImage)}
                className="w-5 h-5"
              />
            </div>

            {/* TEMPLATE */}
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">
                Template de recherche Internet
              </p>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    setTemplateParts([...templateParts, "${title}"])
                  }
                  className="px-3 py-1 bg-black text-white rounded-xl text-xs"
                >
                  Titre
                </button>

                {fields
                  .filter((f) => f.trim() !== "")
                  .map((field, i) => (
                    <button
                      key={i}
                      onClick={() =>
                        setTemplateParts([
                          ...templateParts,
                          `\${${field.toLowerCase().replace(/\s+/g, "_")}}`,
                        ])
                      }
                      className="px-3 py-1 bg-gray-300 rounded-xl text-xs"
                    >
                      {field}
                    </button>
                  ))}
              </div>

              <div className="bg-white p-3 rounded-xl border text-sm text-gray-600 min-h-[40px]">
                {templateParts.join(" ") || "Aucun template défini"}
              </div>
            </div>

            {/* ACTIONS */}
            <div className="flex justify-end gap-4 pt-4">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600"
              >
                Annuler
              </button>

              <button
                onClick={createSection}
                className="px-6 py-2 bg-black text-white rounded-xl hover:opacity-80 transition"
              >
                Créer
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
