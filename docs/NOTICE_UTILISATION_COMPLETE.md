# Notice d'utilisation complete - Control Center

Version: 11 mars 2026
Application: Control Center (tasks, memoire, expenses, notifications)

## 1. Objectif de l'application

Control Center est un cockpit personnel/professionnel qui centralise:

- La gestion des taches (pro/perso)
- La memoire (fiches structurees, scan intelligent, ajout manuel)
- Les depenses (capture et suivi)
- Les notifications
- Les parametres de compte, modules et abonnement

L'objectif est de reduire la friction de saisie, tout en gardant une structure claire de vos informations.

## 2. Connexion et session

### 2.1 Connexion

1. Ouvrir l'application.
2. Saisir email + mot de passe.
3. Se connecter.

### 2.2 Session

- La session peut etre conservee pour un usage quotidien.
- En cas de deconnexion forcee, reconnectez-vous pour recharger les donnees privees.

## 3. Tableau de bord

Le dashboard affiche un resume rapide:

- Taches pro a lancer
- Taches perso a lancer
- Taches cloturees aujourd'hui
- Memoires actives
- Appels API Vision du mois

Depuis ce tableau, vous accedez rapidement aux modules:

- Taches
- Memoire
- Depenses
- Parametres

## 4. Module Taches

### 4.1 Creation

- Choisissez le contexte (pro/perso).
- Creez une tache et son statut initial.

### 4.2 Statuts

- A faire
- En cours
- En attente
- Termine

### 4.3 Transfert

Vous pouvez transferer une tache (email/contact), selon votre configuration.

## 5. Module Memoire

Le module Memoire supporte 2 modes principaux:

- Scan intelligent (photo -> extraction -> pre-remplissage)
- Ajout a la volee (creation manuelle rapide)

### 5.1 Types de memoire

Un type de memoire definit:

- Son nom
- Sa description
- Sa liste de champs
- Le format de chaque champ (texte, select, note, date, etc.)

Types disponibles:

- Types templates
- Types personnalises
- Types communautaires (visibles globalement)

### 5.2 Ajout d'une memoire a la volee

Parcours:

1. Choisir le type de memoire
2. Saisir le titre de fiche
3. Remplir les champs
4. Sauvegarder
5. Suivre la barre d'avancement

Important:

- Si le type est configure "avec photo obligatoire", la sauvegarde est bloquee sans photo.

### 5.3 Scan intelligent

Parcours:

1. Choisir le type de memoire cible
2. Saisir le code de validation IA
3. Importer/photographier le document
4. Lancer le scan
5. Verifier et corriger les champs proposes
6. Sauvegarder la fiche

### 5.4 Types communautaires vs individuels

- Type communautaire: visible par tous les utilisateurs.
- Type individuel: visible uniquement pour son createur.

Quand vous utilisez un type communautaire pour creer une fiche, l'application prepare automatiquement une section utilisable pour votre compte si necessaire.

### 5.5 Liste des fiches

Vous pouvez:

- Rechercher
- Filtrer
- Noter
- Editer
- Supprimer

## 6. Parametres - Zone Memoire

### 6.1 Ajouter et configurer un type de memoire

1. Ouvrir Parametres > Zone Memoire.
2. Cliquer "Ajouter et configurer un type de memoire".
3. Definir:
   - Nom
   - Description
   - Type communautaire ou individuel
   - Option "avec photo obligatoire"
4. Ajouter les champs:
   - Nom
   - Format
   - Options (si select/tags)
   - Requis / searchable
5. Sauvegarder et suivre la barre de progression.

### 6.2 Ajouter un champ a un type existant

1. Selectionner un type.
2. Cliquer "Ajouter un champ".
3. Definir le champ.
4. Sauvegarder.

## 7. Module Depenses

Fonctions principales:

- Capture de facture
- Extraction des informations
- Historique des depenses

## 8. Notifications

Vous pouvez configurer:

- Resume quotidien
- Rappels
- Push mobile

## 9. Donnees et securite

- Les acces sont controles via authentification.
- Les donnees memoire sont segmentees par utilisateur.
- Les types communautaires permettent le partage de structure, pas la confusion des donnees privees.

## 10. Bonnes pratiques

- Creez des types simples avec peu de champs au depart.
- Ajoutez des champs progressivement selon l'usage reel.
- Pour les types importants, activez l'option photo obligatoire.
- Nommez clairement les types pour faciliter la recherche.

## 11. Resolution de problemes

### 11.1 Une fiche ne se sauvegarde pas

Verifier:

- Titre renseigne
- Champs requis remplis
- Photo fournie si obligatoire
- Session active

### 11.2 Le scan ne renvoie rien

Verifier:

- Qualite et lisibilite de la photo
- Presence du code de validation
- Connexion reseau

### 11.3 Un type n'apparait pas

Verifier:

- Type individuel: visible uniquement par le createur
- Type communautaire: visible globalement
- Recharger la page apres creation

## 12. Support interne

En cas de besoin, partager:

- Le module concerne
- Les etapes exactes
- Le message d'erreur
- Une capture d'ecran

Fin de la notice.
