# ✅ Configuration des Notifications - Instructions

## 📋 Changements apportés

### 1. **Fichier SQL: `setup-rls-notifications.sql`** (nouveau)
Crée les politiques RLS (Row Level Security) manquantes pour la table `notifications`:
- ✅ Users can SELECT leurs propres notifications
- ✅ Users can UPDATE leurs propres notifications (marquer comme lu)
- ✅ Service role peut INSERT les notifications (pour les API routes)
- ✅ Service role peut SELECT toutes les notifications

### 2. **Fichier: `store/notificationStore.ts`** (amélioré)
- Ajout de gestion d'erreurs avec try/catch
- Messages de log pour debug (⚠️ user non authentifié, ❌ erreurs)
- Validation d'erreur Supabase

### 3. **Fichier: `app/dashboard/notifications/page.tsx`** (amélioré)
- ✅ Attendre que l'authentification soit prête (`!loading && user`)
- ✅ Afficher "Chargement..." pendant l'authentification
- ✅ Afficher "Aucune notification" si la liste est vide

---

## 🚀 Prochaines étapes

### **ÉTAPE 1: Exécuter le script SQL**
Accédez à votre dashboard Supabase et exécutez le contenu de `setup-rls-notifications.sql`:

```
Supabase Dashboard → SQL Editor → Créer une nouvelle query → Coller le contenu du fichier
```

Ou via CLI:
```bash
supabase db push  # Si vous utilisez Supabase CLI
```

### **ÉTAPE 2: Tester localement**
```bash
npm run dev  # Redémarrer le serveur de dev
```

### **ÉTAPE 3: Vérifier dans la console**
1. Aller sur la page `/dashboard/notifications`
2. Ouvrir les DevTools (F12)
3. Vérifier qu'il n'y a pas d'erreurs RLS

---

## 🔍 Comment debugger

### **Si les notifications ne se chargent toujours pas:**

1. **Vérifier la console browser:**
   ```
   ⚠️ fetchNotifications: No user authenticated
   → L'utilisateur n'est pas authentifié
   
   ❌ Error fetching notifications: permission denied
   → Les politiques RLS ne sont pas correctes
   ```

2. **Vérifier Supabase SQL:**
   ```sql
   -- Voir les politiques actives
   SELECT * FROM pg_policies WHERE tablename = 'notifications';
   ```

3. **Tester manuellement:**
   ```sql
   -- Dans Supabase SQL Editor
   SELECT * FROM notifications 
   WHERE user_id = '<votre-user-id>';
   ```

---

## 📊 Architecture des permissions

```
┌─────────────────────────────────────────┐
│        CLIENT (NotificationsPage)       │
│  - Lit les notifications (RLS: SELECT) │
│  - Marque comme lu (RLS: UPDATE)       │
└─────────────────────────────────────────┘
         ↓ (authentifié avec auth.uid())
┌─────────────────────────────────────────┐
│  SUPABASE (Politiques RLS sur table)    │
│  - Chaque user ne voit que SES notifs   │
└─────────────────────────────────────────┘
         ↑ (clé service role)
┌─────────────────────────────────────────┐
│  API ROUTES (daily-summary, trigger)    │
│  - Crée les notifications (INSERT)      │
│  - Lecture les tâches (SELECT)          │
└─────────────────────────────────────────┘
```

---

## ✨ Résumé des fixes

| Problème | Cause | Solution |
|----------|-------|----------|
| Table vide en client | Pas de RLS | ✅ Script SQL ajoute les politiques |
| Chargement prématuré | Pas d'attente auth | ✅ Vérifier `!loading && user` |
| Erreurs RLS non visibles | Pas de logs | ✅ try/catch + console.error |
| Page vide confuse | Pas de feedback | ✅ Afficher "Chargement..." et "Aucune notification" |
