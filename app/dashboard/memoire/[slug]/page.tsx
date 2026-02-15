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
  extra_data: Record<string, string> | null;
  section_id: string;
  user_id: string;
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
  const [isSaving, setIsSaving] = useState(false);

  /* =============================
     LOAD INITIAL DATA
  ==============================*/
  useEffect(() => {
    if (!user || !slug) return;

    const load = async () => {
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

    load();
  }, [slug, user]);

  /* =============================
     REALTIME SYNC
  ==============================*/
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel("memory_items_realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "memory_items",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setItems((prev) => {
              if (prev.find((i) => i.id === payload.new.id)) return prev;
              return [payload.new as Item, ...prev];
            });
          }

          if (payload.eventType === "DELETE") {
            setItems((prev) =>
              prev.filter((i) => i.id !== payload.old.id)
            );
          }

          if (payload.eventType === "UPDATE") {
            setItems((prev) =>
              prev.map((i) =>
                i.id === payload.new.id ? (payload.new as Item) : i
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

  /* =============================
     CREATE ITEM
  ==============================*/
  const addItem = async () => {
    if (!user || !section || !title || isSaving) return;

    setIsSaving(true);

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

    const { data, error } = await supabase
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

    if (!error && data) {
      setItems((prev) => {
        if (prev.find((i) => i.id === data.id)) return prev;
        return [data, ...prev];
      });
    }

    resetForm();
    setIsSaving(false);
  };

  const deleteItem = async (id: string) => {
    if (!confirm("Supprimer cette entrée ?")) return;
    await supabase.from("memory_items").delete().eq("id", id);
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
    <div className="text-blue-950">

      {/* IMAGE POPUP */}
      {imagePopup && (
        <div
          onClick={() => setImagePopup(null)}
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
        >
          <img
            src={imagePopup}
            className="max-h-[90vh] max-w-[90vw] rounded-2xl"
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
          className="px-4 py-2 bg-black text-white rounded-xl text-sm"
        >
          + Fiche
        </button>
      </div>

      {/* FORMULAIRE COMPLET */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-gray-50 w-full max-w-xl rounded-3xl shadow-xl p-8 space-y-6">

            <h2 className="text-xl font-semibold">
              Nouvelle fiche mémoire
            </h2>

            {/* TITRE */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Titre</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-3 bg-white border border-gray-300 rounded-xl"
              />
            </div>

            {/* PHOTO */}
            {section.allow_image && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Photo</label>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      setImageFile(e.target.files[0]);
                    }
                  }}
                />
              </div>
            )}

            {/* NOTE */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Note</label>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setRating(star)}
                    className={`text-2xl ${
                      rating >= star
                        ? "text-yellow-500"
                        : "text-gray-300"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>

            {/* CHAMPS DYNAMIQUES */}
            {fields.map((field) => (
              <div key={field.id} className="space-y-2">
                <label className="text-sm font-medium">
                  {field.label}
                </label>
                <input
                  value={extraData[field.field_key] || ""}
                  onChange={(e) =>
                    setExtraData({
                      ...extraData,
                      [field.field_key]: e.target.value,
                    })
                  }
                  className="w-full p-3 bg-white border border-gray-300 rounded-xl"
                />
              </div>
            ))}

            <div className="flex justify-end gap-4 pt-4">
              <button
                onClick={resetForm}
                className="px-4 py-2 text-gray-600"
              >
                Annuler
              </button>

              <button
                onClick={addItem}
                disabled={isSaving}
                className="px-6 py-2 bg-black text-white rounded-xl disabled:opacity-50"
              >
                {isSaving ? "Enregistrement..." : "Ajouter"}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* LISTE */}
      <div className="grid gap-6">
        {items.map((item) => {
          const searchUrl = buildSearchUrl(item);

          return (
            <div
              key={item.id}
              className="bg-white rounded-2xl shadow-sm p-6 flex gap-6"
            >
              <div className="flex-1 space-y-2">
                <div className="flex justify-between items-start">
                  <h2 className="font-semibold text-lg">
                    {item.title}
                  </h2>

                  <div className="flex gap-3 items-center">
                    {searchUrl && (
                      <button
                        onClick={() => window.open(searchUrl, "_blank")}
                        className="w-8 h-8 rounded-full bg-blue-950 text-white text-sm flex items-center justify-center"
                      >
                        @
                      </button>
                    )}

                    <button
                      onClick={() => deleteItem(item.id)}
                      className="text-gray-400 hover:text-red-500"
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

              {item.image_url && (
                <div
                  className="w-40 aspect-square cursor-pointer"
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
