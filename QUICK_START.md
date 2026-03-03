# 🚀 Memory Module - Quick Start Guide

## Step 1: Deploy Database Schema (5 minutes)

### Option A: Supabase Dashboard (Recommended)

1. Go to your Supabase project: https://app.supabase.com
2. Navigate to **SQL Editor**
3. Click **New Query**
4. Paste the entire contents of `migrations/memory-schema.sql`
5. Click **Run**
6. Verify success with no errors

### Option B: Using SQL File

```bash
# If you have supabase CLI
supabase db push
```

### Verify Deployment

In Supabase SQL Editor, run:
```sql
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE 'memory_%'
ORDER BY table_name;
```

Should show:
- memory_fields
- memory_items
- memory_item_values
- memory_sections

---

## Step 2: Test in Development

```bash
# Start dev server
npm run dev

# Visit: http://localhost:3000/dashboard/memoire
```

You should see:
- "📚 Mémoire" header
- "+ New Collection" button
- Empty state message

---

## Step 3: Initialize Templates

Two ways to initialize the 10 predefined templates:

### Option A: Using Debug Page

1. Visit: http://localhost:3000/dashboard/memoire/debug
2. Click "Init Templates" button
3. Wait for success message

### Option B: Using API

```bash
# Get your user ID from Supabase Auth
USER_ID="your-uuid-here"

# Initialize templates
curl -X POST http://localhost:3000/api/memory/init-templates \
  -H "Content-Type: application/json" \
  -d "{\"userId\": \"$USER_ID\"}"
```

---

## Step 4: Create Your First Collection

1. Go to http://localhost:3000/dashboard/memoire
2. Click "+ New Collection"
3. Select a template (e.g., "🍷 Wines")
4. Click "Create"
5. Click the new collection card
6. Click "+ Add Item"
7. Enter a title (e.g., "Château Margaux 2015")
8. Create and expand the item to edit fields

---

## Step 5: Deploy to Production

```bash
# Commit changes
git add -A
git commit -m "Add Memory Module initialization"

# Push to GitHub (Vercel will auto-deploy)
git push origin main

# Verify deployment at your Vercel URL
```

---

## 📚 10 Predefined Templates

### 🍷 Wines
Fields: Name, Producer, Region, Vintage, Rating, Tasting Notes, Price, Where to Buy

### 🥃 Spirits
Fields: Name, Type, Origin, ABV %, Rating, Notes, Price

### 🍽️ Restaurants
Fields: Name, City, Location, Cuisine, Rating, Memorable Dish, Website, Visit Date

### 📍 Favorite Places
Fields: Name, City, Location, Category, Rating, Why Special, Visit Date

### 📚 Books
Fields: Title, Author, Genre, Rating, Status, Key Takeaways, ISBN, Finished Date

### 🎬 Movies
Fields: Title, Director, Year, Genre, Rating, Review, IMDb Link

### 🚗 Cars
Fields: Make, Model, Year, Color, Engine, Rating, Notes

### 👤 Contacts
Fields: Full Name, Company, Role, Email, Phone, Location, Notes

### 💡 Ideas
Fields: Title, Category, Description, Status, Impact, Resources, Created Date

### 🎓 Learnings
Fields: Topic, Subject, Key Points, Source, Mastery Level, Date Learned, Practical Use

---

## 🔧 Troubleshooting

### Collections Not Showing

Check the following:

1. **Are you logged in?**
   - Visit /dashboard first
   - Verify user email in top-right corner

2. **Did you run init-templates?**
   - Visit `/dashboard/memoire/debug`
   - Click "Init Templates" button
   - Check for success message

3. **Check browser console**
   - Open DevTools (F12)
   - Look for network errors
   - Check for JavaScript errors

4. **Verify Supabase RLS**
   - Go to Supabase SQL Editor
   - Run:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables 
   WHERE tablename LIKE 'memory_%';
   ```
   - All should show `true` for rowsecurity

### Can't Create Items

1. Verify table exists: `SELECT COUNT(*) FROM memory_items;`
2. Check RLS policies enabled on `memory_items`
3. Verify user_id is correct in section

### Items Not Updating

1. Check unique constraint: `(item_id, field_id)` on values table
2. Verify WebSocket connection (DevTools > Network > WS)
3. Check browser console for errors

---

## 🎓 Next Steps

After successful setup:

1. **Explore Templates** - Create sections from different templates
2. **Add Items** - Create entries and populate fields
3. **Search** - Try the search feature
4. **Expand Cards** - Click items to see all fields
5. **Edit Inline** - Click pencil icon to edit fields

---

## 📞 Need Help?

- **Build Errors?** Check `npm run build` output
- **Database Issues?** Check Supabase logs in Dashboard
- **Real-time Not Working?** Verify Supabase real-time is enabled
- **TypeScript Errors?** Run `npm run type-check`

---

**Memory Module Status:** ✅ Complete & Ready for Use

Created: 2024
