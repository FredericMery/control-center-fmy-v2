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
  wines: {
    id: 'wines',
    name: 'Wines',
    slug: 'wines',
    description: 'Collection of wines tasted or to taste',
    icon: '🍷',
    color_tag: 'red',
    search_template: '${name} ${region} wine',
    fields: [
      { label: 'Wine Name', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Producer', field_type: 'text', is_searchable: true },
      { label: 'Region', field_type: 'text', is_searchable: true },
      { label: 'Vintage Year', field_type: 'number' },
      { label: 'Rating', field_type: 'rating' },
      { label: 'Tasting Notes', field_type: 'textarea', placeholder: 'Flavors, aromas...' },
      { label: 'Price (USD)', field_type: 'number' },
      { label: 'Where to Buy', field_type: 'url' },
    ],
  },

  spirits: {
    id: 'spirits',
    name: 'Spirits',
    slug: 'spirits',
    description: 'Whiskey, rum, vodka, gin collection',
    icon: '🥃',
    color_tag: 'amber',
    search_template: '${name} ${type}',
    fields: [
      { label: 'Spirit Name', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Type', field_type: 'select', options: ['Whiskey', 'Rum', 'Vodka', 'Gin', 'Tequila', 'Brandy', 'Other'] },
      { label: 'Origin Country', field_type: 'text', is_searchable: true },
      { label: 'ABV %', field_type: 'number' },
      { label: 'Rating', field_type: 'rating' },
      { label: 'Notes', field_type: 'textarea' },
      { label: 'Price', field_type: 'number' },
    ],
  },

  restaurants: {
    id: 'restaurants',
    name: 'Restaurants',
    slug: 'restaurants',
    description: 'Restaurants visited or to visit',
    icon: '🍽️',
    color_tag: 'orange',
    search_template: '${name} restaurant ${city}',
    fields: [
      { label: 'Restaurant Name', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'City', field_type: 'text', is_searchable: true },
      { label: 'Location', field_type: 'location' },
      { label: 'Cuisine Type', field_type: 'tags' },
      { label: 'Rating', field_type: 'rating' },
      { label: 'Memorable Dish', field_type: 'text' },
      { label: 'Website', field_type: 'url' },
      { label: 'Visit Date', field_type: 'date' },
    ],
  },

  places: {
    id: 'places',
    name: 'Favorite Places',
    slug: 'favorite-places',
    description: 'Locations worth revisiting',
    icon: '📍',
    color_tag: 'green',
    search_template: '${name} ${city}',
    fields: [
      { label: 'Place Name', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'City/Region', field_type: 'text', is_searchable: true },
      { label: 'Location', field_type: 'location' },
      { label: 'Category', field_type: 'select', options: ['Beach', 'Mountain', 'City', 'Forest', 'Museum', 'Park', 'Other'] },
      { label: 'Rating', field_type: 'rating' },
      { label: 'Why Special', field_type: 'textarea' },
      { label: 'Visit Date', field_type: 'date' },
    ],
  },

  books: {
    id: 'books',
    name: 'Books',
    slug: 'books',
    description: 'Books read or to read',
    icon: '📚',
    color_tag: 'blue',
    search_template: '${title} ${author}',
    fields: [
      { label: 'Title', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Author', field_type: 'text', is_searchable: true },
      { label: 'Genre', field_type: 'tags' },
      { label: 'Rating', field_type: 'rating' },
      { label: 'Reading Status', field_type: 'select', options: ['To Read', 'Reading', 'Finished'] },
      { label: 'Key Takeaways', field_type: 'textarea' },
      { label: 'ISBN', field_type: 'text' },
      { label: 'Finished Date', field_type: 'date' },
    ],
  },

  movies: {
    id: 'movies',
    name: 'Movies',
    slug: 'movies',
    description: 'Films watched or to watch',
    icon: '🎬',
    color_tag: 'purple',
    search_template: '${title} ${director}',
    fields: [
      { label: 'Movie Title', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Director', field_type: 'text', is_searchable: true },
      { label: 'Year', field_type: 'number' },
      { label: 'Genre', field_type: 'tags' },
      { label: 'Rating', field_type: 'rating' },
      { label: 'Review', field_type: 'textarea' },
      { label: 'IMDb Link', field_type: 'url' },
    ],
  },

  cars: {
    id: 'cars',
    name: 'Cars',
    slug: 'cars',
    description: 'Cars admired or owned',
    icon: '🚗',
    color_tag: 'red',
    search_template: '${year} ${make} ${model}',
    fields: [
      { label: 'Make', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Model', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Year', field_type: 'number', is_searchable: true },
      { label: 'Color', field_type: 'text' },
      { label: 'Engine', field_type: 'text' },
      { label: 'Rating', field_type: 'rating' },
      { label: 'Notes', field_type: 'textarea' },
    ],
  },

  contacts: {
    id: 'contacts',
    name: 'Contacts',
    slug: 'contacts',
    description: 'Important people and their info',
    icon: '👤',
    color_tag: 'indigo',
    search_template: '${name}',
    fields: [
      { label: 'Full Name', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Company', field_type: 'text' },
      { label: 'Role', field_type: 'text' },
      { label: 'Email', field_type: 'email' },
      { label: 'Phone', field_type: 'phone' },
      { label: 'Location', field_type: 'location' },
      { label: 'Notes', field_type: 'textarea' },
    ],
  },

  ideas: {
    id: 'ideas',
    name: 'Ideas',
    slug: 'ideas',
    description: 'Creative ideas and inspiration',
    icon: '💡',
    color_tag: 'yellow',
    search_template: '${title}',
    fields: [
      { label: 'Idea Title', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Category', field_type: 'tags' },
      { label: 'Description', field_type: 'textarea', is_required: true },
      { label: 'Status', field_type: 'select', options: ['Brainstorm', 'Planning', 'In Progress', 'Done'] },
      { label: 'Impact', field_type: 'rating' },
      { label: 'Resources', field_type: 'textarea' },
      { label: 'Created Date', field_type: 'date' },
    ],
  },

  learnings: {
    id: 'learnings',
    name: 'Learnings',
    slug: 'learnings',
    description: 'Skills, lessons, and knowledge',
    icon: '🎓',
    color_tag: 'cyan',
    search_template: '${title} ${topic}',
    fields: [
      { label: 'Topic', field_type: 'text', is_required: true, is_searchable: true },
      { label: 'Subject', field_type: 'text', is_searchable: true },
      { label: 'Key Points', field_type: 'textarea', is_required: true },
      { label: 'Source', field_type: 'url' },
      { label: 'Mastery Level', field_type: 'select', options: ['Beginner', 'Intermediate', 'Advanced', 'Expert'] },
      { label: 'Date Learned', field_type: 'date' },
      { label: 'Practical Use', field_type: 'textarea' },
    ],
  },
};

export function getTemplateById(id: string): SectionTemplate | undefined {
  return MEMORY_TEMPLATES[id];
}

export function getAllTemplates(): SectionTemplate[] {
  return Object.values(MEMORY_TEMPLATES);
}
