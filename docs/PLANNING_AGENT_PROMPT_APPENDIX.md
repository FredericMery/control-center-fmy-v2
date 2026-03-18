## Bloc a ajouter en fin de prompt

🧠 COMPORTEMENT ATTENDU DE L’AGENT

Avant toute implementation :
1. analyser les tables existantes Supabase
2. proposer un plan d’evolution (avant de coder)
3. justifier chaque creation/modification
4. garantir compatibilite avec l’existant

## Variables d'environnement (IA autonome)

- `RESEND_API_KEY` : envoi email de relance.
- `EMAIL_FROM` (optionnel) : expediteur des relances.
- `CALENDAR_PROPOSALS_CONFIRM_SECRET` : signature HMAC des liens de confirmation.
- `CALENDAR_PROPOSALS_CRON_SECRET` : securisation de l'endpoint cron (hors Vercel cron natif).
- `NEXT_PUBLIC_APP_URL` ou `APP_URL` : base URL pour generer les liens de confirmation.
