/**
 * 📚 Predefined Memory Section Templates
 * 10 curated templates with 5-8 fields each
 */

export type FieldType = 
  | 'text' 
  | 'textarea' 
  | 'number' 
  | 'date' 
  | 'url' 
  | 'email' 
  | 'phone' 
  | 'select' 
  | 'tags' 
  | 'location' 
  | 'rating';

export interface FieldTemplate {
  label: string;
  field_type: FieldType;
  placeholder?: string;
  is_required?: boolean;
  is_searchable?: boolean; // Used for Google search query
  options?: string[];
}

export interface SectionTemplate {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color_tag: string;
  fields: FieldTemplate[];
  search_template?: string; // Template for Google search: "${field1} ${field2}"
}

export const MEMORY_TEMPLATES: Record<string, SectionTemplate> = {
  hotels: {
    id: 'hotels',
    name: 'Mes Hotels',
    slug: 'hotels',
    description: 'Hotels verifies a retenir pour les deplacements pro et perso',
    icon: '🏨',
    color_tag: 'teal',
    search_template: '${nom_de_l_hotel} ${ville_pays}',
    fields: [
      { label: 'Nom de l hotel', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Ville / Pays', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Type de sejour', field_type: 'select', is_required: true, options: ['Pro', 'Perso'] },
      { label: 'Adresse', field_type: 'text' },
      { label: 'Budget moyen', field_type: 'select', options: ['€', '€€', '€€€', '€€€€'] },
      { label: 'Points forts', field_type: 'textarea' },
      { label: 'Points faibles', field_type: 'textarea' },
      { label: 'Note personnelle', field_type: 'textarea', is_required: true },
      { label: 'Photo', field_type: 'url', is_required: true },
    ],
  },

  wines: {
    id: 'wines',
    name: 'Mes Vins',
    slug: 'wines',
    description: 'Vos vins préférés avec notes et occasions idéales',
    icon: '🍷',
    color_tag: 'red',
    search_template: '${nom_du_vin} ${domaine_producteur} ${region} ${annee}',
    fields: [
      { label: 'Nom du vin', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Domaine / Producteur', field_type: 'text', is_searchable: true },
      { label: 'Région', field_type: 'text', is_searchable: true },
      { label: 'Année', field_type: 'number', is_searchable: true },
      { label: 'Type', field_type: 'select', options: ['Rouge', 'Blanc', 'Rosé', 'Champagne'] },
      { label: 'Note personnelle', field_type: 'rating' },
      { label: 'Occasion idéale', field_type: 'text' },
      { label: 'Photo', field_type: 'url' },
    ],
  },

  spirits: {
    id: 'spirits',
    name: 'Mes Spiritueux',
    slug: 'spirits',
    description: 'Whisky, rhum, gin et autres spiritueux à retenir',
    icon: '🥃',
    color_tag: 'amber',
    search_template: '${nom} ${marque} ${origine}',
    fields: [
      { label: 'Nom', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Marque', field_type: 'text', is_searchable: true },
      { label: 'Type', field_type: 'select', options: ['Whisky', 'Rhum', 'Gin', 'Vodka', 'Tequila', 'Cognac', 'Autre'] },
      { label: 'Origine', field_type: 'text', is_searchable: true },
      { label: 'Degré d’alcool', field_type: 'number' },
      { label: 'Notes aromatiques', field_type: 'textarea' },
      { label: 'Moment idéal', field_type: 'text' },
      { label: 'Photo', field_type: 'url' },
    ],
  },

  restaurants: {
    id: 'restaurants',
    name: 'Mes Restaurants',
    slug: 'restaurants',
    description: 'Vos meilleures adresses pour manger',
    icon: '🍽️',
    color_tag: 'orange',
    search_template: '${nom} ${ville} google maps',
    fields: [
      { label: 'Nom', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Ville', field_type: 'text', is_searchable: true },
      { label: 'Type de cuisine', field_type: 'tags' },
      { label: 'Budget', field_type: 'select', options: ['€', '€€', '€€€', '€€€€'] },
      { label: 'Plat signature', field_type: 'text' },
      { label: 'Note personnelle', field_type: 'rating' },
      { label: 'Avec qui y aller', field_type: 'text' },
      { label: 'Photo', field_type: 'url' },
    ],
  },

  places: {
    id: 'places',
    name: 'Mes Lieux Préférés',
    slug: 'favorite-places',
    description: 'Lieux marquants à revisiter',
    icon: '📍',
    color_tag: 'green',
    search_template: '${nom_du_lieu} ${ville_pays}',
    fields: [
      { label: 'Nom du lieu', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Ville / Pays', field_type: 'text', is_searchable: true },
      { label: 'Type', field_type: 'select', options: ['Plage', 'Montagne', 'Urbain', 'Nature', 'Culture', 'Autre'] },
      { label: 'Saison idéale', field_type: 'text' },
      { label: 'Pourquoi j’aime', field_type: 'textarea' },
      { label: 'Photo (URL)', field_type: 'url' },
    ],
  },

  books: {
    id: 'books',
    name: 'Mes Livres',
    slug: 'books',
    description: 'Livres inspirants à relire ou recommander',
    icon: '📚',
    color_tag: 'blue',
    search_template: '${titre} ${auteur}',
    fields: [
      { label: 'Titre', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Auteur', field_type: 'text', is_searchable: true },
      { label: 'Genre', field_type: 'tags' },
      { label: 'Année', field_type: 'number' },
      { label: 'Citation favorite', field_type: 'textarea' },
      { label: 'Note personnelle', field_type: 'rating' },
      { label: 'Pourquoi le lire', field_type: 'textarea' },
      { label: 'Photo', field_type: 'url' },
    ],
  },

  movies: {
    id: 'movies',
    name: 'Mes Films & Séries',
    slug: 'movies',
    description: 'Films et séries qui t’ont marqué',
    icon: '🎬',
    color_tag: 'purple',
    search_template: '${titre} ${realisateur}',
    fields: [
      { label: 'Titre', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Réalisateur', field_type: 'text', is_searchable: true },
      { label: 'Acteur principal', field_type: 'text' },
      { label: 'Genre', field_type: 'tags' },
      { label: 'Année', field_type: 'number' },
      { label: 'Note personnelle', field_type: 'rating' },
      { label: 'Émotion ressentie', field_type: 'textarea' },
      { label: 'Affiche / Photo', field_type: 'url' },
    ],
  },

  cars: {
    id: 'cars',
    name: 'Mes Voitures',
    slug: 'cars',
    description: 'Voitures de rêve ou modèles à garder en tête',
    icon: '🚗',
    color_tag: 'red',
    search_template: '${marque} ${modele} ${annee}',
    fields: [
      { label: 'Marque', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Modèle', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Année', field_type: 'number', is_searchable: true },
      { label: 'Motorisation', field_type: 'text' },
      { label: 'Pourquoi je l’aime', field_type: 'textarea' },
      { label: 'Note personnelle', field_type: 'rating' },
      { label: 'Lien image', field_type: 'url' },
    ],
  },

  contacts: {
    id: 'contacts',
    name: 'Contacts Clés',
    slug: 'contacts',
    description: 'Contacts stratégiques pro et perso',
    icon: '👤',
    color_tag: 'indigo',
    search_template: '${nom} ${societe} linkedin',
    fields: [
      { label: 'Nom', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Société', field_type: 'text', is_searchable: true },
      { label: 'Rôle', field_type: 'text' },
      { label: 'Email', field_type: 'email' },
      { label: 'Téléphone', field_type: 'phone' },
      { label: 'Contexte de rencontre', field_type: 'textarea' },
      { label: 'Notes personnelles', field_type: 'textarea' },
      { label: 'Photo', field_type: 'url' },
    ],
  },

  ideas: {
    id: 'ideas',
    name: 'Idées & Concepts',
    slug: 'ideas',
    description: 'Idées à fort potentiel à capturer rapidement',
    icon: '💡',
    color_tag: 'yellow',
    search_template: '${titre} ${categorie}',
    fields: [
      { label: 'Titre', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Catégorie', field_type: 'tags', is_searchable: true },
      { label: 'Description courte', field_type: 'textarea' },
      { label: 'Potentiel business', field_type: 'rating' },
      { label: 'Prochaine action', field_type: 'text' },
      { label: 'Niveau priorité', field_type: 'select', options: ['Basse', 'Moyenne', 'Haute', 'Critique'] },
      { label: 'Photo', field_type: 'url' },
    ],
  },

  learnings: {
    id: 'learnings',
    name: 'Apprentissages Clés',
    slug: 'learnings',
    description: 'Leçons et apprentissages actionnables',
    icon: '🎓',
    color_tag: 'cyan',
    search_template: '${sujet} ${source}',
    fields: [
      { label: 'Sujet', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Source', field_type: 'text', is_searchable: true },
      { label: 'Date', field_type: 'date' },
      { label: 'Résumé', field_type: 'textarea' },
      { label: 'Application concrète', field_type: 'textarea' },
      { label: 'Impact', field_type: 'rating' },
      { label: 'Photo', field_type: 'url' },
    ],
  },
};

export function getTemplateById(id: string): SectionTemplate | undefined {
  return MEMORY_TEMPLATES[id];
}

export function getAllTemplates(): SectionTemplate[] {
  return Object.values(MEMORY_TEMPLATES);
}

/**
 * Build auto internet search query from a template string.
 * Example template: "${nom} ${ville}"
 */
export function buildTemplateSearchQuery(
  templateId: string,
  values: Record<string, string | undefined>
): string {
  const template = MEMORY_TEMPLATES[templateId];
  if (!template?.search_template) return '';

  const query = template.search_template.replace(/\$\{([^}]+)\}/g, (_, key: string) => {
    const value = values[key]?.trim();
    return value || '';
  });

  return query.replace(/\s+/g, ' ').trim();
}

export function buildTemplateSearchUrl(
  templateId: string,
  values: Record<string, string | undefined>
): string {
  const query = buildTemplateSearchQuery(templateId, values);
  return query ? `https://www.google.com/search?q=${encodeURIComponent(query)}` : '';
}
