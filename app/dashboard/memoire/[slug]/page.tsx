"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useParams } from "next/navigation";

type Section = {
  id: string;
  name: string;
  search_template: string | null;
  allow_image: boolean;
};

type Field = {
  id: string;
  label: string;
  field_key: string;
};

type Item = {
  id: string;
  title: string;
  image_url: string | null;
  rating: number | null;
  extra_data: Record<string, string>;
};

export default function SectionPage() {
  const params = useParams();
  const slug = params?.slug as string;
  const user = useAuthStore((s) => s.user);

  const [section, setSection] = useState<Section | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [items, setItems] = useState<Item[]>([]);

  const [title, setTitle] = useState("");
  const [rating, setRating] = useState(0);
  const [extraData, setExtraData] = useState<Record<string, string>>({});
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    if (!user || !slug) return;

    const init = async () => {
      const { data: sectionData } = await supabase
        .from("memory_sections")
        .select("*")
        .eq("slug", slug)
        .eq("user_id", user.id)
        .single();

      if (!sectionData) return;

      setSection(sectionData);

      const { data: fieldData } = await supabase
        .from("memory_section_fields")
        .select("*")
        .eq("section_id", sectionData.id);

      setFields(fieldData || []);

      const { data: itemData } = await supabase
        .from("memory_items")
        .select("*")
        .eq("section_id", sectionData.id)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      setItems(itemData || []);
    };

    init();
  }, [slug, user]);

  const addItem = async () => {
    if (!user || !section || !title) return;

    let uploadedImageUrl: string | null = null;

    if (imageFile && section.allow_image) {
      const filePath = `${user.id}/${Date.now()}`;

      const { error } = await supabase.storage
        .from("memory-images")
        .upload(filePath, imageFile);

      if (!error) {
        const { data } = supabase.storage
          .from("memory-images")
          .getPublicUrl(filePath);

        uploadedImageUrl = data.publicUrl;
      }
    }

    const { data } = await supabase
      .from("memory_items")
      .insert([
        {
          title,
          image_url: uploadedImageUrl,
          rating,
          extra_data: extraData,
          section_id: section.id,
          user_id: user.id,
        },
      ])
      .select()
      .single();

    if (data) {
      setItems([data, ...items]);
      resetForm();
    }
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Supprimer cette entrée ?")) return;

    await supabase.from("memory_items").delete().eq("id", id);
    setItems(items.filter((item) => item.id !== id));
  };

  const buildSearchUrl = (item: Item) => {
    if (!section?.search_template) return null;

    let query = section.search_template.replace(/\$\{title\}/g, item.title);

    Object.entries(item.extra_data || {}).forEach(([key, value]) => {
      query = query.replace(new RegExp(`\\$\\{${key}\\}`, "g"), String(value));
    });

    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  };

  const resetForm = () => {
    setTitle("");
    setRating(0);
    setExtraData({});
    setImageFile(null);
    setShowForm(false);
  };

  if (!section) return <div>Loading...</div>;

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold">{section.name}</h1>

        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm"
        >
          +
        </button>
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">Nouvelle entrée</h2>

            <input
              placeholder="Titre"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full p-3 border rounded-xl mb-4"
            />

            {section.allow_image && (
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    setImageFile(e.target.files[0]);
                  }
                }}
                className="mb-4"
              />
            )}

            {fields.map((field) => (
              <input
                key={field.id}
                placeholder={field.label}
                value={extraData[field.field_key] || ""}
                onChange={(e) =>
                  setExtraData({
                    ...extraData,
                    [field.field_key]: e.target.value,
                  })
                }
                className="w-full p-3 border rounded-xl mb-3"
              />
            ))}

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={resetForm} className="text-gray-500">
                Annuler
              </button>

              <button
                onClick={addItem}
                className="bg-black text-white px-4 py-2 rounded-xl"
              >
                Ajouter
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.id}
            className="bg-white p-6 rounded-2xl shadow-sm space-y-3 hover:shadow-md transition"
          >
            <div className="flex justify-between items-start">
              <h2 className="font-semibold text-lg">{item.title}</h2>

              <button
                onClick={() => deleteItem(item.id)}
                className="text-gray-400 hover:text-red-500 transition text-sm"
              >
                🗑
              </button>
            </div>

            {item.image_url && (
              <img
                src={item.image_url}
                className="w-full h-40 object-cover rounded-xl"
              />
            )}

            {Object.entries(item.extra_data || {}).map(([key, value]) => {
              const field = fields.find((f) => f.field_key === key);
              return (
                <p key={key} className="text-sm text-gray-600">
                  <strong>{field?.label || key}:</strong> {value}
                </p>
              );
            })}

            <button
              onClick={() => {
                const url = buildSearchUrl(item);
                if (url) window.open(url, "_blank");
              }}
              className="text-sm text-blue-600 underline"
            >
              🔎 Rechercher
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
