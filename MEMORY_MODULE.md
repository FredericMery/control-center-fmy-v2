# 📚 Memory Module - Complete Documentation

## Overview

A comprehensive memory/knowledge management system with 10 predefined templates and full CRUD functionality. Built with Next.js, Zustand, Supabase, and TailwindCSS.

## Features

✅ **10 Predefined Templates**
- 🍷 Wines - Wine collection with ratings and notes
- 🥃 Spirits - Whiskey, rum, vodka, gin collection
- 🍽️ Restaurants - Places visited with reviews
- 📍 Favorite Places - Locations worth revisiting
- 📚 Books - Reading list with status tracking
- 🎬 Movies - Films watched or to watch
- 🚗 Cars - Cars admired or owned
- 👤 Contacts - Important people and info
- 💡 Ideas - Creative ideas and inspiration
- 🎓 Learnings - Skills, lessons, and knowledge

✅ **Core Functionality**
- Dynamic field creation per section
- Full CRUD operations on items and fields
- Real-time updates with Supabase subscriptions
- Search across items and field values
- Computed Google search links
- Row-level security for all tables
- Performance indexes for large datasets

✅ **UI/UX**
- Minimal dark theme (black/gray)
- Rounded cards with subtle hover effects
- Mobile-first responsive design
- Clean typography with light font weights
- Expandable item cards with inline editing

## Architecture

### File Structure

```
lib/
├── memoryTemplates.ts          # 10 templates + types
└── memoryFieldCatalog.ts       # (legacy, can be deprecated)

store/
└── memoryStore.ts              # Zustand store with full CRUD

app/
├── dashboard/memoire/
│   ├── page.tsx                # Main sections grid
│   ├── [slug]/page.tsx         # Section detail + items
│   └── debug/page.tsx          # Debug utilities
│
└── api/memory/
    ├── init-templates/route.ts # Initialize templates
    ├── search/route.ts         # Search across items
    └── bulk/route.ts           # Bulk operations

components/memory/
├── MemoryItemForm.tsx          # Add new item
├── MemoryItemCard.tsx          # Display item + edit
└── MemorySectionCard.tsx       # (optional) Section card

types/
└── database.ts                 # TypeScript types for Supabase

migrations/
└── memory-schema.sql           # Database schema + RLS + indexes
```

### Database Schema

**memory_sections**
- `id` UUID (primary key)
- `user_id` UUID (foreign key to auth.users)
- `template_id` TEXT (link to MEMORY_TEMPLATES)
- `section_name` TEXT
- `description` TEXT
- `is_custom` BOOLEAN
- `items_count` INTEGER
- `created_at`, `updated_at` TIMESTAMP

**memory_fields**
- `id` UUID (primary key)
- `section_id` UUID (foreign key)
- `field_label` TEXT
- `field_type` TEXT (text, textarea, number, date, url, etc.)
- `field_order` INTEGER
- `is_required` BOOLEAN
- `is_searchable` BOOLEAN
- `options` TEXT[] (for select fields)
- `created_at` TIMESTAMP

**memory_items**
- `id` UUID (primary key)
- `section_id` UUID (foreign key)
- `item_title` TEXT
- `archived` BOOLEAN
- `created_at`, `updated_at` TIMESTAMP

**memory_item_values**
- `id` UUID (primary key)
- `item_id` UUID (foreign key)
- `field_id` UUID (foreign key)
- `field_value` TEXT
- `created_at`, `updated_at` TIMESTAMP
- UNIQUE(item_id, field_id)

### State Management (Zustand)

```typescript
interface MemoryState {
  // Sections
  sections: MemorySection[];
  fetchSections();
  createSection(templateId, name?);
  deleteSection(sectionId);
  updateSection(sectionId, updates);

  // Fields
  fields: MemoryField[];
  getFieldsBySectionId(sectionId);
  addField(sectionId, field);
  deleteField(fieldId);

  // Items
  items: MemoryItem[];
  fetchItemsBySectionId(sectionId);
  createItem(sectionId, title);
  deleteItem(itemId);
  updateItem(itemId, updates);

  // Item Values
  itemValues: MemoryItemValue[];
  getValuesByItemId(itemId);
  setItemValue(itemId, fieldId, value);
  deleteItemValue(valueId);

  // Search & Helpers
  searchItems(sectionId, query);
  getItemWithValues(itemId);

  // Real-time
  subscribeToSection(sectionId, callback);
  unsubscribeFromSection(sectionId);
}
```

## Deployment Steps

### 1. Deploy Database Schema

```bash
# Option A: Via Supabase UI
# - Go to SQL Editor
# - Paste content from migrations/memory-schema.sql
# - Click Run

# Option B: Via Script (if Supabase RPC available)
npm run deploy:memory
```

### 2. Test Template Initialization

```bash
# POST http://localhost:3000/api/memory/init-templates
# Body: { "userId": "user-uuid" }
```

### 3. Verify in Dashboard

Visit: http://localhost:3000/dashboard/memoire

Should show:
- "New Collection" button
- 10 template cards when clicked
- Ability to create new sections

## API Routes

### POST /api/memory/init-templates

Initialize all 10 predefined templates for a user.

**Request:**
```json
{ "userId": "uuid" }
```

**Response:**
```json
{
  "message": "Templates initialized successfully",
  "sections": [...]
}
```

### GET /api/memory/search

Search items and generate Google search links.

**Query Params:**
- `sectionId` (required)
- `query` (required)

**Response:**
```json
{
  "section": {...},
  "results": [
    {
      "id": "uuid",
      "title": "item title",
      "googleSearchUrl": "https://google.com/search?q=..."
    }
  ],
  "count": 5
}
```

### POST/DELETE /api/memory/bulk

Bulk operations for items and sections.

**POST Body:**
```json
{
  "type": "values",
  "updates": [
    { "id": "uuid", "value": "new value" }
  ]
}
```

**DELETE Body:**
```json
{
  "type": "items",
  "ids": ["uuid1", "uuid2"]
}
```

## Usage Example

### Creating a Memory Section

```typescript
import { useMemoryStore } from '@/store/memoryStore';

export default function MyComponent() {
  const { createSection } = useMemoryStore();

  const handleCreate = async () => {
    // Create from template
    await createSection('wines', 'My Wine Collection');
  };

  return <button onClick={handleCreate}>Create</button>;
}
```

### Adding an Item

```typescript
const { createItem, getFieldsBySectionId } = useMemoryStore();

const item = await createItem(sectionId, 'Château Margaux 2015');

// Get fields to fill values
const fields = getFieldsBySectionId(sectionId);
```

### Setting Field Values

```typescript
const { setItemValue } = useMemoryStore();

await setItemValue(itemId, fieldId, '95 points');
await setItemValue(itemId, fieldId, 'Excellent Bordeaux blend');
```

### Real-time Subscriptions

```typescript
const { subscribeToSection } = useMemoryStore();

useEffect(() => {
  subscribeToSection(sectionId, () => {
    // Refetch items when section changes
    fetchItemsBySectionId(sectionId);
  });
}, [sectionId]);
```

## Styling & Customization

### Color Tags (Optional Enhancement)

```typescript
// In MEMORY_TEMPLATES
export interface SectionTemplate {
  color_tag: string; // 'red', 'blue', 'green', etc.
}

// Usage in UI
<div className={`bg-${template.color_tag}-900`}>
```

### Field Types

Supported field types in `MemoryField.field_type`:
- `text` - Single line text
- `textarea` - Multi-line text
- `number` - Numeric value
- `date` - Date picker
- `url` - URL field
- `email` - Email field
- `phone` - Phone number
- `select` - Dropdown (uses `options` field)
- `tags` - Multiple tags
- `location` - Location/address
- `rating` - 1-5 stars

## Performance Considerations

1. **Lazy Loading** - Items fetched on section view
2. **Indexed Queries** - Foreign keys indexed for fast lookups
3. **RLS Policies** - Row-level security prevents unauthorized access
4. **Real-time** - Uses Supabase subscriptions for updates
5. **Bulk Operations** - API endpoint for batch updates

## Security

- **Row-Level Security** on all 4 tables
- **User Isolation** - Users can only see their own data
- **Service Role** - Init templates requires service role auth
- **Field Validation** - Client-side + Supabase constraints

## Troubleshooting

### Templates Not Showing

1. ✅ Check user is authenticated
2. ✅ Verify database tables exist
3. ✅ Run init-templates API
4. ✅ Check browser console for errors

### Items Not Saving

1. ✅ Verify RLS policies are enabled
2. ✅ Check field_id and item_id are valid UUIDs
3. ✅ Check memory_item_values unique constraint
4. ✅ Review Supabase logs for constraint violations

### Real-time Updates Not Working

1. ✅ Check Supabase real-time is enabled
2. ✅ Verify subscriptions are created
3. ✅ Check network tab for WebSocket connections
4. ✅ Unsubscribe on component unmount

## Future Enhancements

- [ ] Import/export to CSV or JSON
- [ ] Images per item (Supabase storage)
- [ ] Categories/tags for items
- [ ] Advanced search with filters
- [ ] Duplicate item detection
- [ ] Item sharing capabilities
- [ ] Mobile app version
- [ ] Voice input for quick notes
- [ ] AI-powered summaries
- [ ] Related items suggestions

---

**Built with:** Next.js 16 • TypeScript • Zustand • Supabase • TailwindCSS

**Created:** 2024
