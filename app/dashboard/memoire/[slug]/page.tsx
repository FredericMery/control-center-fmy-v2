"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { useParams } from "next/navigation";
import { parseFieldType } from "@/lib/memoryFieldCatalog";

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
  type: ReturnType<typeof parseFieldType>;
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
  const [locatingField, setLocatingField] = useState<string | null>(null);

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

      setFields(
        (fieldData || []).map((field) => ({
          ...field,
          type: parseFieldType(field.field_key),
        }))
      );

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
    if (!user || !section || isSaving) return;

    setIsSaving(true);

    const generatedTitle =
      title.trim() || `Fiche du ${new Date().toLocaleDateString("fr-FR")}`;

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

    const finalExtraData = fields.reduce<Record<string, string>>((acc, field) => {
      if (["title", "photo", "rating"].includes(field.type)) return acc;

      const value = extraData[field.field_key] || "";

      if (field.type === "checkbox") {
        acc[field.field_key] = value === "true" ? "true" : "false";
        return acc;
      }

      if (value.trim() !== "") {
        acc[field.field_key] = value;
      }

      return acc;
    }, {});

    const { data, error } = await supabase
      .from("memory_items")
      .insert([
        {
          title: generatedTitle,
          image_url: uploadedImageUrl,
          rating,
          extra_data: finalExtraData,
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
    setLocatingField(null);
    setShowForm(false);
  };

  const updateExtraValue = (fieldKey: string, value: string) => {
    setExtraData((prev) => ({
      ...prev,
      [fieldKey]: value,
    }));
  };

  const fillCurrentLocation = (fieldKey: string) => {
    if (!navigator.geolocation) return;

    setLocatingField(fieldKey);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const value = `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`;
        updateExtraValue(fieldKey, value);
        setLocatingField(null);
      },
      () => {
        setLocatingField(null);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const renderDynamicField = (field: Field) => {
    if (field.type === "title") {
      return (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full p-3 bg-white border border-gray-300 rounded-xl"
          />
        </div>
      );
    }

    if (field.type === "photo") {
      return (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
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
      );
    }

    if (field.type === "rating") {
      return (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                type="button"
                key={star}
                onClick={() => setRating(star)}
                className={`text-2xl ${rating >= star ? "text-yellow-500" : "text-gray-300"}`}
              >
                ★
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (field.type === "long_text") {
      return (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <textarea
            value={extraData[field.field_key] || ""}
            onChange={(e) => updateExtraValue(field.field_key, e.target.value)}
            rows={4}
            className="w-full p-3 bg-white border border-gray-300 rounded-xl"
          />
        </div>
      );
    }

    if (field.type === "location") {
      return (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <div className="flex gap-2">
            <input
              value={extraData[field.field_key] || ""}
              onChange={(e) => updateExtraValue(field.field_key, e.target.value)}
              placeholder="Latitude, Longitude"
              className="w-full p-3 bg-white border border-gray-300 rounded-xl"
            />
            <button
              type="button"
              onClick={() => fillCurrentLocation(field.field_key)}
              className="px-3 py-2 text-xs rounded-xl border border-gray-300 bg-white whitespace-nowrap"
            >
              {locatingField === field.field_key ? "Localisation..." : "Ma position"}
            </button>
          </div>
        </div>
      );
    }

    if (field.type === "checkbox") {
      const checked = extraData[field.field_key] === "true";
      return (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                updateExtraValue(field.field_key, e.target.checked ? "true" : "false")
              }
            />
            <span>{checked ? "Oui" : "Non"}</span>
          </label>
        </div>
      );
    }

    if (field.type === "mood") {
      return (
        <div key={field.id} className="space-y-2">
          <label className="text-sm font-medium">{field.label}</label>
          <select
            value={extraData[field.field_key] || ""}
            onChange={(e) => updateExtraValue(field.field_key, e.target.value)}
            className="w-full p-3 bg-white border border-gray-300 rounded-xl"
          >
            <option value="">Sélectionner</option>
            <option value="😀 Heureux">😀 Heureux</option>
            <option value="🙂 Bien">🙂 Bien</option>
            <option value="😐 Neutre">😐 Neutre</option>
            <option value="😕 Fatigué">😕 Fatigué</option>
            <option value="😢 Triste">😢 Triste</option>
          </select>
        </div>
      );
    }

    const inputTypeByField: Partial<Record<Field["type"], string>> = {
      date: "date",
      time: "time",
      number: "number",
      url: "url",
      phone: "tel",
      email: "email",
      short_text: "text",
      tags: "text",
      legacy_text: "text",
    };

    return (
      <div key={field.id} className="space-y-2">
        <label className="text-sm font-medium">{field.label}</label>
        <input
          type={inputTypeByField[field.type] || "text"}
          value={extraData[field.field_key] || ""}
          placeholder={field.type === "tags" ? "tag1, tag2, tag3" : ""}
          onChange={(e) => updateExtraValue(field.field_key, e.target.value)}
          className="w-full p-3 bg-white border border-gray-300 rounded-xl"
        />
      </div>
    );
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
          <div className="bg-gray-50 w-full max-w-xl rounded-3xl shadow-xl p-8 space-y-6 max-h-[90vh] overflow-auto">

            <h2 className="text-xl font-semibold">
              Nouvelle fiche mémoire
            </h2>

            {fields.map((field) => renderDynamicField(field))}

            {!fields.some((field) => field.type === "title") && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Titre (optionnel)</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full p-3 bg-white border border-gray-300 rounded-xl"
                />
              </div>
            )}

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
            <div key={item.id} className="bg-white rounded-2xl shadow-sm p-6 flex flex-col sm:flex-row gap-6">
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

                {fields.some((field) => field.type === "rating") && item.rating ? (
                  <div className="text-yellow-500 text-sm">
                    {"★".repeat(item.rating)}
                  </div>
                ) : null}

                {fields
                  .filter((field) => !["title", "photo", "rating"].includes(field.type))
                  .map((field) => {
                    const value = item.extra_data?.[field.field_key];

                    if (field.type !== "checkbox" && (!value || value.trim() === "")) {
                      return null;
                    }

                    if (field.type === "url" && value) {
                      return (
                        <p key={field.id} className="text-sm text-gray-600">
                          <strong>{field.label}:</strong>{" "}
                          <a href={value} target="_blank" rel="noreferrer" className="text-blue-600 underline break-all">
                            {value}
                          </a>
                        </p>
                      );
                    }

                    if (field.type === "location" && value) {
                      const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(value)}`;
                      return (
                        <p key={field.id} className="text-sm text-gray-600">
                          <strong>{field.label}:</strong>{" "}
                          <a href={mapsUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
                            {value}
                          </a>
                        </p>
                      );
                    }

                    if (field.type === "checkbox") {
                      return (
                        <p key={field.id} className="text-sm text-gray-600">
                          <strong>{field.label}:</strong> {value === "true" ? "Oui" : "Non"}
                        </p>
                      );
                    }

                    return (
                      <p key={field.id} className="text-sm text-gray-600">
                        <strong>{field.label}:</strong> {value}
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
