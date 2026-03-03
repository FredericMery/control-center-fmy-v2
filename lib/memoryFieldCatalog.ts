export type MemoryItemType =
  | "title"
  | "photo"
  | "rating"
  | "long_text"
  | "short_text"
  | "location"
  | "date"
  | "time"
  | "number"
  | "url"
  | "phone"
  | "email"
  | "tags"
  | "checkbox"
  | "mood";

export type MemoryItemDefinition = {
  type: MemoryItemType;
  name: string;
  defaultLabel: string;
  description: string;
};

export const MEMORY_ITEM_CATALOG: MemoryItemDefinition[] = [
  {
    type: "title",
    name: "Titre",
    defaultLabel: "Titre",
    description: "Nom principal de la fiche",
  },
  {
    type: "photo",
    name: "Photo",
    defaultLabel: "Photo",
    description: "Ajouter une image",
  },
  {
    type: "rating",
    name: "Note",
    defaultLabel: "Note",
    description: "Évaluation de 1 à 5",
  },
  {
    type: "long_text",
    name: "Texte libre",
    defaultLabel: "Description",
    description: "Zone de texte longue",
  },
  {
    type: "short_text",
    name: "Texte court",
    defaultLabel: "Résumé",
    description: "Petit champ texte",
  },
  {
    type: "location",
    name: "Géolocalisation",
    defaultLabel: "Position",
    description: "Coordonnées GPS ou adresse",
  },
  {
    type: "date",
    name: "Date",
    defaultLabel: "Date",
    description: "Date de l'événement",
  },
  {
    type: "time",
    name: "Heure",
    defaultLabel: "Heure",
    description: "Heure associée",
  },
  {
    type: "number",
    name: "Nombre",
    defaultLabel: "Valeur",
    description: "Valeur numérique",
  },
  {
    type: "url",
    name: "Lien",
    defaultLabel: "Lien utile",
    description: "URL à conserver",
  },
  {
    type: "phone",
    name: "Téléphone",
    defaultLabel: "Téléphone",
    description: "Contact téléphonique",
  },
  {
    type: "email",
    name: "Email",
    defaultLabel: "Email",
    description: "Contact email",
  },
  {
    type: "tags",
    name: "Tags",
    defaultLabel: "Tags",
    description: "Mots-clés séparés par virgules",
  },
  {
    type: "checkbox",
    name: "Oui / Non",
    defaultLabel: "Validé",
    description: "Case à cocher",
  },
  {
    type: "mood",
    name: "Humeur",
    defaultLabel: "Humeur",
    description: "Sélection d'émotion",
  },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "_");

export const buildFieldKey = (
  type: MemoryItemType,
  label: string,
  index: number
) => `${type}__${slugify(label) || type}_${index + 1}`;

export const parseFieldType = (fieldKey: string): MemoryItemType | "legacy_text" => {
  const [prefix] = fieldKey.split("__");
  const exists = MEMORY_ITEM_CATALOG.some((item) => item.type === prefix);
  return exists ? (prefix as MemoryItemType) : "legacy_text";
};
