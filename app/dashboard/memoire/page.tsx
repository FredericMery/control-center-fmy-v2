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
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold">Mémoire</h1>

        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm"
        >
          + Section
        </button>
      </div>

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

      {/* FORMULAIRE IDENTIQUE (structure OK) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-lg space-y-4">
            <h2 className="text-lg font-semibold">Nouvelle section</h2>

            <input
              placeholder="Nom de section"
              value={sectionName}
              onChange={(e) => setSectionName(e.target.value)}
              className="w-full p-3 border rounded-xl"
            />

            {fields.map((field, index) => (
              <input
                key={index}
                placeholder={`Champ perso ${index + 1}`}
                value={field}
                onChange={(e) => {
                  const updated = [...fields];
                  updated[index] = e.target.value;
                  setFields(updated);
                }}
                className="w-full p-3 border rounded-xl"
              />
            ))}

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={allowImage}
                onChange={() => setAllowImage(!allowImage)}
              />
              <span>Autoriser photo</span>
            </div>

            <div>
              <p className="text-sm mb-2">Template recherche :</p>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() =>
                    setTemplateParts([...templateParts, "${title}"])
                  }
                  className="px-3 py-1 bg-gray-200 rounded-xl text-sm"
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
                      className="px-3 py-1 bg-gray-200 rounded-xl text-sm"
                    >
                      {field}
                    </button>
                  ))}
              </div>

              <div className="mt-2 text-sm text-gray-600">
                {templateParts.join(" ")}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button onClick={resetForm} className="text-gray-500">
                Annuler
              </button>

              <button
                onClick={createSection}
                className="bg-black text-white px-4 py-2 rounded-xl"
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
