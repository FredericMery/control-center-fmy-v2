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
  const [imagePopup, setImagePopup] = useState<string | null>(null);

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

  const buildSearchUrl = (item: Item) => {
    if (!section?.search_template) return null;

    let query = section.search_template.replace(/\$\{title\}/g, item.title);

    Object.entries(item.extra_data || {}).forEach(([key, value]) => {
      query = query.replace(new RegExp(`\\$\\{${key}\\}`, "g"), String(value));
    });

    return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  };

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

  const resetForm = () => {
    setTitle("");
    setRating(0);
    setExtraData({});
    setImageFile(null);
    setShowForm(false);
  };

  if (!section) return <div>Loading...</div>;

  return (
    <div className="text-blue-950">

      {/* IMAGE POPUP */}
      {imagePopup && (
        <div
          onClick={() => setImagePopup(null)}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50"
        >
          <img
            src={imagePopup}
            className="max-h-[90vh] max-w-[90vw] rounded-2xl shadow-2xl"
          />
        </div>
      )}

      {/* HEADER */}
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-2xl font-semibold">
          {section.name}
        </h1>

        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-black text-white rounded-xl text-sm hover:opacity-80 transition"
        >
          + Fiche
        </button>
      </div>

      {/* LISTE */}
      <div className="grid gap-6">

        {items.map((item) => {

          const searchUrl = buildSearchUrl(item);

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl shadow-sm hover:shadow-md transition p-6 flex gap-6"
            >

              {/* CONTENU TEXTE */}
              <div className="flex-1 space-y-3">

                <div className="flex justify-between items-start">

                  <h2 className="font-semibold text-lg">
                    {item.title}
                  </h2>

                  <div className="flex gap-3 items-center">

                    {/* Pastille recherche */}
                    {searchUrl && (
                      <button
                        onClick={() => window.open(searchUrl, "_blank")}
                        className="w-8 h-8 rounded-full bg-blue-950 text-white text-sm flex items-center justify-center hover:opacity-80 transition"
                      >
                        @
                      </button>
                    )}

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-gray-400 hover:text-red-500 transition text-sm"
                    >
                      🗑
                    </button>

                  </div>
                </div>

                {item.rating && (
                  <div className="text-yellow-500 text-sm">
                    {"★".repeat(item.rating)}
                  </div>
                )}

                {Object.entries(item.extra_data || {}).map(([key, value]) => {
                  const field = fields.find((f) => f.field_key === key);
                  return (
                    <p key={key} className="text-sm text-gray-600">
                      <strong>{field?.label || key}:</strong> {value}
                    </p>
                  );
                })}
              </div>

              {/* IMAGE A DROITE */}
              {item.image_url && (
                <div
                  className="w-40 aspect-square shrink-0 cursor-pointer"
                  onClick={() => setImagePopup(item.image_url)}
                >
                  <img
                    src={item.image_url}
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
