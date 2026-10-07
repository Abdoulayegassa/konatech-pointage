# Audit de Konatech Pointage — Parties 1 à 4.17

Date de l’audit : 29 juillet 2026.

Périmètre de ce document :

- architecture globale ;
- inventaire complet des pages ;
- inventaire complet des modules ;
- inventaire des moteurs 4.1 à 4.17 inclus.

Ce document décrit uniquement les éléments trouvés dans le dépôt. Les valeurs
des fichiers d’environnement réels ne sont pas reproduites.

# 1. Architecture globale

## 1.1 Vue d’ensemble

Konatech Pointage est un monorepo JavaScript et TypeScript géré avec `pnpm`.
Le workspace contient deux applications :

- `apps/frontend` : interface Next.js ;
- `apps/backend` : API NestJS et accès PostgreSQL via Prisma.

Arborescence principale :

```text
konatech-pointage/
├── apps/
│   ├── backend/
│   └── frontend/
├── docker/
│   ├── backend.Dockerfile
│   └── frontend.Dockerfile
├── docs/
├── scripts/
├── .env.production.example
├── docker-compose.yml
├── eslint.config.mjs
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

Le fichier `pnpm-workspace.yaml` inclut `apps/*`. Aucun dossier `packages/` et
aucun package partagé indépendant ne sont présents.

Le `package.json` racine déclare :

- le nom `konatech-attendance` ;
- la version `0.1.0` ;
- `pnpm@10.26.0` ;
- Node.js `>=20.9.0 <23` ;
- pnpm `>=10.0.0`.

## 1.2 Scripts du monorepo

Les scripts racine couvrent :

| Script | Comportement |
|---|---|
| `dev` | Lance `scripts/dev.mjs` pour l’environnement de développement |
| `build` | Construit successivement le backend et le frontend |
| `build:backend` | Lance le build NestJS |
| `build:frontend` | Lance le build Next.js |
| `typecheck` | Vérifie les deux applications |
| `lint` | Exécute ESLint sur le dépôt |
| `format:check` | Vérifie le format Prettier |
| `test` | Exécute les tests backend |
| `test:proxy` | Exécute `scripts/validate-proxy.mjs` |
| `check` | Enchaîne lint, typecheck et build |
| `validate` | Enchaîne format, Prisma, types, lint, tests, builds et proxy |
| `db:up` | Démarre Docker Compose |
| `db:down` | Arrête Docker Compose |
| `db:status` | Affiche l’état Docker Compose |
| `prisma:generate` | Génère le client Prisma |
| `prisma:status` | Affiche l’état des migrations |
| `prisma:migrate` | Lance `prisma migrate dev` |
| `prisma:migrate:deploy` | Déploie les migrations |
| `prisma:seed` | Exécute le seed |

## 1.3 Architecture frontend

### 1.3.1 Technologies

Le frontend utilise :

- Next.js `15.5.18` ;
- React `19` ;
- React DOM `19` ;
- TypeScript ;
- App Router ;
- Tailwind CSS `3.4.17` ;
- PostCSS ;
- Autoprefixer ;
- `class-variance-authority` ;
- `clsx` ;
- `tailwind-merge` ;
- `qrcode`.

Les composants UI de base sont locaux. Aucun package npm `shadcn` n’est
déclaré ; la structure `components/ui` contient les composants réutilisables.

### 1.3.2 Arborescence frontend

```text
apps/frontend/
├── app/
│   ├── api/
│   ├── attendance-entry/
│   ├── attendance-history/
│   ├── calendar/
│   ├── employees/
│   ├── exports/
│   ├── login/
│   ├── my-attendance/
│   ├── sanctions/
│   ├── schedules/
│   ├── error.tsx
│   ├── globals.css
│   ├── layout.tsx
│   ├── loading.tsx
│   └── page.tsx
├── components/
│   ├── admin/
│   ├── attendance/
│   ├── attendance-history/
│   ├── auth/
│   ├── calendar/
│   ├── dashboard/
│   ├── employees/
│   ├── layout/
│   ├── sanctions/
│   ├── schedules/
│   └── ui/
├── lib/
│   ├── api-route.ts
│   ├── api.ts
│   ├── auth-session.ts
│   ├── auth.ts
│   ├── client-error.ts
│   ├── redirect.ts
│   └── utils.ts
├── public/
├── middleware.ts
├── next.config.ts
└── tailwind.config.ts
```

### 1.3.3 Layout racine

`apps/frontend/app/layout.tsx` :

- définit la langue HTML sur `fr` ;
- définit le titre `Konatech Pointage` ;
- définit la description de la plateforme ;
- référence l’icône SVG, le favicon ICO, l’icône PNG 512 × 512 et l’icône
  Apple 180 × 180 ;
- importe `globals.css` ;
- force le rendu dynamique.

Aucun autre fichier `layout.tsx` n’est présent sous les routes applicatives.
Les interfaces administrateur, employé et borne sont donc différenciées par les
pages et composants, pas par des layouts App Router imbriqués.

### 1.3.4 Rendu et composants

Les pages de données sont principalement des Server Components. Elles :

- lisent le cookie de session côté serveur ;
- récupèrent l’utilisateur courant ;
- appliquent les redirections de rôle ;
- appellent l’API backend ;
- transmettent les données initiales aux composants interactifs.

Les composants marqués `use client` gèrent notamment :

- formulaires ;
- filtres ;
- créations et modifications ;
- caméra ;
- géolocalisation ;
- clavier PIN ;
- téléchargement ;
- transitions du parcours de pointage.

### 1.3.5 Couche d’accès API

`apps/frontend/lib/api.ts` contient :

- les types frontend des réponses backend ;
- la résolution des URLs ;
- le client HTTP serveur ;
- les fonctions de chargement des dashboards, employés, plannings,
  pointages, sanctions et calendriers.

Les contrats TypeScript frontend sont définis localement. Aucun package de
contrats partagé avec le backend n’est présent.

### 1.3.6 Routes API Next.js

Les routes sous `apps/frontend/app/api` jouent le rôle de proxy entre le
navigateur et NestJS.

Flux :

```text
Navigateur
↓
/api/* de Next.js
↓ lecture du cookie HTTP-only
↓ ajout de Authorization: Bearer <JWT>
Backend /api/v1/*
↓
Réponse relayée au navigateur
```

Le proxy :

- sélectionne la session normale ou la session de borne ;
- ajoute l’en-tête `Authorization` ;
- ajoute `Content-Type: application/json` lorsque nécessaire ;
- relaie les codes HTTP ;
- extrait les messages d’erreur backend ;
- relaie les métadonnées de challenge de sécurité lorsqu’elles existent ;
- efface la session de borne sur certaines réponses 401 ;
- prend en charge les réponses JSON ;
- prend en charge les téléchargements en conservant `Content-Type` et
  `Content-Disposition`.

Routes proxy présentes :

```text
/api/auth/login
/api/auth/logout
/api/auth/attendance-entry-session
/api/health
/api/employees
/api/employees/[id]
/api/employees/[id]/status
/api/schedules
/api/schedules/[id]
/api/schedules/[id]/status
/api/calendar/month
/api/calendar/holidays
/api/calendar/holidays/[id]
/api/sanctions/rules/[id]
/api/sanctions/attendance/[attendanceId]
/api/attendance/me/check-in
/api/attendance/me/check-out
/api/attendance/exports/monthly
```

### 1.3.7 Sessions frontend

Deux cookies sont définis dans `auth-session.ts` :

- `konatech_session` : session applicative normale ;
- `konatech_attendance_entry_session` : session de borne.

Options :

- HTTP-only ;
- SameSite `lax` ;
- Secure en production ;
- chemin `/` ;
- durée issue de la durée du JWT.

La connexion normale efface une éventuelle session de borne. La déconnexion
efface les deux cookies. Le mode borne ne doit pas utiliser la session normale
comme repli.

### 1.3.8 Middleware frontend

`apps/frontend/middleware.ts` vérifie la présence de
`konatech_session` pour :

- `/` ;
- `/my-attendance` ;
- `/employees` ;
- `/schedules`.

Sans cookie, la requête est redirigée vers `/login`.

Les pages `/attendance-history`, `/calendar`, `/exports` et `/sanctions` ne
figurent pas dans le matcher. Elles appellent toutefois `requireCurrentUser()`
et contrôlent le rôle ADMIN dans leur Server Component.

### 1.3.9 Configuration frontend

Variables utilisées :

- `NEXT_PUBLIC_APP_URL` : URL publique du frontend et URL du QR ;
- `NEXT_PUBLIC_API_BASE_URL` : URL publique de l’API ;
- `API_BASE_URL` : URL serveur de l’API.

`next.config.ts` :

- active `reactStrictMode` ;
- ignore les erreurs ESLint pendant le build Next.js.

## 1.4 Architecture backend

### 1.4.1 Technologies

Le backend utilise :

- NestJS `11` ;
- TypeScript ;
- Prisma `6` ;
- PostgreSQL ;
- `class-validator` ;
- `class-transformer` ;
- Joi ;
- Helmet ;
- NestJS Throttler ;
- body-parser ;
- Puppeteer ;
- RxJS.

### 1.4.2 Arborescence backend

```text
apps/backend/
├── prisma/
│   ├── migrations/
│   ├── schema.prisma
│   └── seed.ts
├── scripts/
│   ├── backfill-attendance-schedule-snapshots.ts
│   ├── backfill-employee-pin-code-hashes.ts
│   └── create-initial-admin.ts
├── src/
│   ├── common/
│   │   ├── audit/
│   │   ├── prisma/
│   │   ├── security/
│   │   ├── time/
│   │   ├── utils/
│   │   └── validation/
│   ├── modules/
│   │   ├── attendance/
│   │   ├── auth/
│   │   ├── calendar/
│   │   ├── dashboard/
│   │   ├── employees/
│   │   ├── health/
│   │   ├── sanctions/
│   │   └── schedules/
│   ├── app.module.ts
│   └── main.ts
└── test/
```

### 1.4.3 Modules enregistrés

`AppModule` importe :

- `ConfigModule` ;
- `ThrottlerModule` ;
- `AuditLogModule` ;
- `PrismaModule` ;
- `AuthModule` ;
- `HealthModule` ;
- `DashboardModule` ;
- `EmployeesModule` ;
- `CalendarModule` ;
- `AttendanceModule` ;
- `SanctionsModule` ;
- `SchedulesModule`.

### 1.4.4 Bootstrap HTTP

`main.ts` :

- crée l’application NestJS ;
- désactive le body parser automatique ;
- configure `trust proxy` ;
- applique Helmet ;
- applique les body parsers JSON et URL-encoded avec limite configurable ;
- ajoute le préfixe global `/api/v1` ;
- active CORS pour `FRONTEND_URL` avec credentials ;
- applique un `ValidationPipe` global ;
- démarre sur `PORT`.

Le `ValidationPipe` :

- supprime les champs non déclarés ;
- refuse les champs non déclarés ;
- transforme les payloads ;
- active la conversion implicite.

### 1.4.5 Guards globaux

Trois guards transversaux sont enregistrés :

- `AppThrottlerGuard` ;
- `JwtAuthGuard` ;
- `RolesGuard`.

`JwtAuthGuard` :

- ignore les handlers/classes marqués `@Public()` ;
- exige `Authorization: Bearer <token>` ;
- valide le JWT ;
- recharge l’employé depuis la base ;
- refuse un compte devenu inactif ;
- attache l’utilisateur à la requête.

`RolesGuard` :

- lit les métadonnées `@Roles()` ;
- compare `user.accessRole` aux rôles autorisés ;
- renvoie HTTP 403 en cas de rôle insuffisant.

### 1.4.6 Limitation du débit

Le backend configure :

- une limite globale configurable ;
- une limite `login` configurable pour `POST /auth/login` ;
- une limite PIN de 5 requêtes par minute ;
- une limite PIN de 10 requêtes sur 10 minutes.

### 1.4.7 Couche commune

`common/prisma` :

- service Prisma ;
- module global ;
- sélections réutilisables excluant les secrets.

`common/security` :

- JWT HS256 ;
- mots de passe ;
- PIN ;
- throttling.

`common/time` :

- abstraction de l’horloge applicative.

`common/utils` :

- normalisation des dates ;
- limites mensuelles ;
- résolution des jours de planning ;
- calcul des sorties ;
- snapshots de planning.

`common/audit` :

- logger structuré des actions administratives.

## 1.5 Architecture Prisma

Le schéma utilise PostgreSQL et le générateur `prisma-client-js`.

Modèles présents :

- `Employee` ;
- `Schedule` ;
- `Attendance` ;
- `CalendarEntry` ;
- `SanctionRule`.

Enums présents :

- `AttendanceStatus` ;
- `AccessRole` ;
- `AttendanceVerificationMethod` ;
- `AttendanceVerificationLevel` ;
- `CalendarEntryType` ;
- `SanctionRuleType` ;
- `SanctionPeriod`.

Relations principales :

```text
Schedule 1 ─── n Employee
Employee 1 ─── n Attendance
Employee 1 ─── n CalendarEntry
```

Comportements de suppression :

- suppression d’un planning : `scheduleId` de l’employé devient `NULL` ;
- suppression d’un employé : ses pointages sont supprimés en cascade ;
- suppression d’un employé : `employeeId` de ses entrées calendrier devient
  `NULL`.

Le dépôt contient 18 migrations. Elles couvrent :

- initialisation ;
- authentification ;
- évolution des statuts ;
- planning ;
- GPS/photo ;
- sécurité de sortie ;
- résultats de sortie ;
- PIN ;
- identifiant employé ;
- hash des PIN ;
- travail hors planning ;
- snapshots ;
- calendrier RH ;
- jours non ouvrés ;
- sanctions configurables.

Scripts de données :

- seed Prisma ;
- création de l’administrateur initial ;
- backfill des hashes PIN ;
- backfill des snapshots de planning.

## 1.6 Architecture des rapports

Le rapport mensuel est séparé entre collecte et rendu :

```text
AttendanceController
↓
MonthlyAttendanceExportService
↓
Modèle MonthlyAttendanceExportReport
├── MonthlyAttendanceCsvExporterService
└── MonthlyAttendancePdfExporterService
    ├── MonthlyAttendancePuppeteerPdfRendererService
    └── moteur PDF historique
```

Le service d’assemblage collecte les données sans dépendre du format final.

Formats présents :

- CSV ;
- PDF.

Modes PDF :

- `premium` ;
- `puppeteer` ;
- `legacy`.

Le fallback vers le moteur historique dépend de
`ATTENDANCE_PDF_ALLOW_LEGACY_FALLBACK`.

## 1.7 Docker

### 1.7.1 PostgreSQL

Le service `postgres` utilise :

- `postgres:16-alpine` ;
- un volume `postgres-data` ;
- un port hôte par défaut 5433 ;
- `pg_isready` comme healthcheck ;
- un redémarrage `unless-stopped`.

### 1.7.2 Backend

Le service `backend` :

- appartient au profil `app` ;
- dépend d’un PostgreSQL sain ;
- écoute sur 4000 dans le conteneur ;
- reçoit les variables de base, JWT, CORS, throttling, sécurité, Cloudinary et
  PDF ;
- expose par défaut le port hôte 4000 ;
- utilise `/api/v1/health` pour son healthcheck.

Le Dockerfile backend :

- utilise Node.js 22 Bookworm Slim ;
- installe les dépendances avec le lockfile ;
- génère Prisma ;
- construit NestJS ;
- installe Chromium et des polices ;
- exécute `prisma migrate deploy` avant `node dist/main.js`.

### 1.7.3 Frontend

Le service `frontend` :

- appartient au profil `app` ;
- dépend d’un backend sain ;
- écoute sur 3000 ;
- reçoit les URLs publiques et serveur ;
- utilise `/api/health` pour son healthcheck.

Le Dockerfile frontend :

- utilise Node.js 22 Bookworm Slim ;
- installe les dépendances ;
- construit Next.js ;
- démarre avec `next start`.

## 1.8 Environnements

Fichiers trouvés :

- `.env.production.example` ;
- `apps/backend/.env` ;
- `apps/backend/.env.example` ;
- `apps/backend/.env.test` ;
- `apps/frontend/.env.example` ;
- `apps/frontend/.env.local`.

Ordre de chargement backend :

1. `.env.{NODE_ENV}.local` ;
2. `.env.{NODE_ENV}` ;
3. `.env.local` ;
4. `.env`.

Variables backend :

- `NODE_ENV` ;
- `PORT` ;
- `FRONTEND_URL` ;
- `JWT_SECRET` ;
- `JWT_EXPIRES_IN` ;
- `DATABASE_URL` ;
- `JSON_BODY_LIMIT` ;
- `RATE_LIMIT_TTL_MS` ;
- `RATE_LIMIT_MAX` ;
- `LOGIN_RATE_LIMIT_TTL_MS` ;
- `LOGIN_RATE_LIMIT_MAX` ;
- `TRUST_PROXY_HOPS` ;
- variables GPS ;
- variables Cloudinary ;
- variables PDF.

Contrôles de configuration présents :

- latitude et longitude configurées ensemble ;
- coordonnées requises lorsque la sécurité est activée ;
- rayon d’avertissement au moins égal au rayon de confiance ;
- credentials Cloudinary configurés ensemble ;
- secret JWT de production ne ressemblant pas à une valeur locale/test ;
- URL frontend HTTPS en production ;
- localhost, IP privée et certains tunnels temporaires refusés en production.

## 1.9 Tests existants

Les tests présents couvrent notamment :

- santé ;
- login ;
- PIN ;
- migration des PIN ;
- brute force ;
- utilisateur courant ;
- rôles ;
- employés ;
- plannings ;
- pointage ;
- dates futures ;
- doublons ;
- GPS ;
- précision ;
- rayon ;
- commentaire hors bureau ;
- selfie ;
- sorties ;
- heures supplémentaires ;
- jours non ouvrés ;
- snapshots ;
- calendrier ;
- absences ;
- sanctions ;
- exports CSV/PDF ;
- configuration d’environnement ;
- moteur Puppeteer ;
- proxy frontend.

Aucun test de composant frontend ou test navigateur n’a été trouvé.

# 2. Inventaire complet des pages

Dix pages utilisateur `page.tsx` sont présentes.

## 2.1 `/login` — Connexion

### Description

Écran d’authentification par email et mot de passe.

### Rôle

Créer la session applicative normale.

### Accessible par

- utilisateur non authentifié ;
- ADMIN ;
- EMPLOYEE.

Un utilisateur déjà authentifié est redirigé selon son rôle d’accès.

### État

Utilisée.

### Contenu

- logo Konatech ;
- présentation de la plateforme ;
- formulaire email ;
- formulaire mot de passe ;
- bouton de connexion ;
- messages d’erreur ;
- comptes de démonstration lorsque `NODE_ENV` n’est pas `production`.

Le titre visible du formulaire est « Connexion administrateur ». Le backend et
la logique de redirection acceptent néanmoins aussi les comptes EMPLOYEE.

### Validations

- email valide ;
- mot de passe d’au moins 8 caractères au niveau DTO ;
- compte existant ;
- compte actif ;
- mot de passe valide.

### API

```text
POST /api/auth/login
↓
POST /api/v1/auth/login
```

### Résultat

- effacement de la session de borne ;
- création de `konatech_session` ;
- ADMIN vers `/` ;
- EMPLOYEE vers `/my-attendance`.

### Parcours

```text
/login
↓ email et mot de passe
↓ validation
├── erreur : message dans le formulaire
└── succès
    ├── ADMIN → /
    └── EMPLOYEE → /my-attendance
```

## 2.2 `/` — Tableau de bord administrateur

### Description

Vue opérationnelle quotidienne de l’administration.

### Rôle

Centraliser les indicateurs et donner accès aux modules administratifs.

### Accessible par

ADMIN uniquement.

### Restrictions

- sans session valide : `/login` ;
- EMPLOYEE : `/my-attendance`.

### État

Utilisée.

### Données chargées

- utilisateur courant ;
- dashboard backend ;
- URL publique de la borne.

### Contenu

Session :

- nom ;
- rôle ;
- département ;
- date de synchronisation.

KPI :

- présents planifiés ;
- travail sur jour non ouvré ;
- retards ;
- absences ;
- départs anticipés.

Sections :

- alertes quotidiennes ;
- actions rapides ;
- QR de borne ;
- activité récente ;
- analyses mensuelles.

### API

`GET /api/v1/dashboard/overview`.

### Parcours

```text
/
├── /attendance-history
├── /exports
├── /employees
├── /schedules
├── /calendar
├── /sanctions
└── /attendance-entry
```

## 2.3 `/attendance-entry` — Borne fixe

### Description

Point d’entrée public destiné au QR et aux terminaux partagés.

### Rôle

Identifier rapidement un employé par PIN puis lui permettre de pointer.

### Accessible par

- public pour le clavier PIN ;
- EMPLOYEE identifié pour le pointage.

### État

Utilisée.

### Écran sans session

- logo ;
- quatre emplacements PIN ;
- clavier 0–9 ;
- suppression ;
- validation ;
- message de succès ou d’erreur.

### Écran avec session

Le serveur charge :

- utilisateur courant ;
- pointage du jour ;
- historique du mois.

Si le token appartient à un utilisateur qui n’est pas EMPLOYEE, la session est
traitée comme obsolète et l’écran revient au PIN.

### APIs

- `POST /api/auth/attendance-entry-session` ;
- `POST /api/v1/auth/attendance-entry/login` ;
- `GET /api/v1/auth/me` ;
- `GET /api/v1/attendance/me/today` ;
- `GET /api/v1/attendance/me/history` ;
- `POST /api/attendance/me/check-in` ;
- `POST /api/attendance/me/check-out`.

### Parcours

```text
QR ou URL directe
↓
/attendance-entry
↓
PIN
├── invalide : message
├── limite atteinte : HTTP 429
└── valide
    ↓ identification
    ↓ action disponible
    ↓ parcours de pointage
    ↓ succès
    ↓ fin de session de borne
```

## 2.4 `/my-attendance` — Espace employé

### Description

Espace personnel de pointage et consultation.

### Rôle

Permettre à l’employé de pointer et consulter ses indicateurs.

### Accessible par

EMPLOYEE uniquement.

### Restrictions

- ADMIN : `/` ;
- session absente ou invalide : `/login`.

### État

Utilisée.

### Contenu

- logo ;
- déconnexion ;
- prénom ;
- horloge en direct ;
- état de la sécurité GPS ;
- heure d’entrée ;
- heure de sortie ;
- action disponible ;
- absences mensuelles ;
- heures travaillées ;
- départs anticipés ;
- heures supplémentaires ;
- huit derniers pointages.

### États

- « Prêt pour le pointage » si entrée possible ;
- « Sortie disponible » si sortie possible ;
- « Pointage à jour » si aucune action n’est possible.

### APIs

- `GET /api/v1/attendance/me/today` ;
- `GET /api/v1/attendance/me/history` ;
- proxy entrée/sortie.

### Parcours

```text
/my-attendance
↓ état du jour
├── canCheckIn : parcours Entrée
├── canCheckOut : parcours Sortie
└── aucune action : consultation
```

## 2.5 `/attendance-history` — Historique RH

### Description

Espace administrateur de consultation des pointages mensuels.

### Rôle

Analyser les présences et anomalies de l’ensemble des employés.

### Accessible par

ADMIN uniquement.

### État

Utilisée.

### Données

- pointages du mois courant ;
- liste des employés ;
- départements dérivés des valeurs Employee.

### Interface

- filtres ;
- tableau des pointages ;
- sélection d’une ligne ;
- panneau de détail.

### Détail disponible

Selon l’enregistrement :

- employé ;
- identifiant ;
- département ;
- date ;
- planning ;
- entrée ;
- sortie ;
- statut ;
- retard ;
- absence ;
- départ anticipé ;
- heures supplémentaires ;
- commentaire ;
- GPS d’entrée ;
- GPS de sortie ;
- méthode et niveau de vérification ;
- photo d’entrée ;
- photo de sortie ;
- sanction calculée.

### APIs

- `GET /api/v1/attendance/history?month=YYYY-MM` ;
- `GET /api/v1/employees` ;
- `GET /api/sanctions/attendance/:attendanceId`.

### Parcours

```text
/attendance-history
↓ chargement du mois
↓ filtres
↓ sélection d’un pointage
↓ panneau de détail
↓ chargement de la sanction associée
```

## 2.6 `/employees` — Gestion des employés

### Description

Interface de gestion des collaborateurs et de leurs accès.

### Rôle

Créer et administrer les comptes.

### Accessible par

ADMIN uniquement.

### État

Utilisée.

### Vue

- liste des employés ;
- total ;
- nombre de comptes ADMIN ;
- rôle d’accès ;
- fonction ;
- département ;
- planning ;
- statut ;
- indication `pinConfigured`.

### Création

Champs :

- PIN ;
- prénom ;
- nom ;
- email ;
- rôle fonctionnel ;
- rôle d’accès ;
- mot de passe ;
- département ;
- statut ;
- planning.

### Modification

Les mêmes propriétés peuvent être mises à jour. Le mot de passe est facultatif
en modification. Une chaîne vide de département ou planning peut être
transformée en `NULL`.

### Règles

- email unique ;
- identifiant employé généré ;
- mot de passe hashé ;
- PIN hashé ;
- PIN requis pour un nouvel EMPLOYEE ;
- PIN supprimé pour ADMIN ;
- planning existant s’il est fourni ;
- PIN et hashes exclus des réponses.

### APIs frontend

- `GET /api/employees` ;
- `POST /api/employees` ;
- `GET /api/employees/:id` ;
- `PATCH /api/employees/:id` ;
- `PATCH /api/employees/:id/status`.

Le backend possède aussi des endpoints spécialisés pour le rôle, le
département et le planning.

### Parcours

```text
/employees
├── créer
│   ↓ validation
│   ↓ génération EMP-AAAA-NNN
│   ↓ hash mot de passe/PIN
│   └── ajout dans la liste
├── modifier
│   └── mise à jour de la liste
└── activer/désactiver
    └── mise à jour du statut
```

## 2.7 `/schedules` — Gestion des plannings

### Description

Interface de gestion des horaires.

### Rôle

Définir les heures, jours travaillés et marges de retard.

### Accessible par

ADMIN uniquement.

### État

Utilisée.

### Vue

- nombre de plannings ;
- nombre total d’affectations ;
- nom ;
- horaires ;
- marge ;
- jours ;
- statut ;
- employés affectés.

### Création et modification

Champs :

- nom ;
- heure de début ;
- heure de fin ;
- marge de retard ;
- jours travaillés ;
- statut.

### Validations

- heures `HH:mm` ;
- fin strictement postérieure au début ;
- marge entre 0 et 180 minutes ;
- au moins un jour ;
- jours uniques ;
- nom unique.

### APIs

- `GET /api/schedules` ;
- `POST /api/schedules` ;
- `GET /api/schedules/:id` ;
- `PATCH /api/schedules/:id` ;
- `PATCH /api/schedules/:id/status`.

## 2.8 `/calendar` — Calendrier RH

### Description

Vue mensuelle des jours ouvrés et non ouvrés.

### Rôle

Gérer les jours fériés utilisés dans les calculs RH.

### Accessible par

ADMIN uniquement.

### État

Utilisée pour les jours fériés.

### Paramètre

`month=YYYY-MM`. Une valeur absente ou invalide est remplacée par le mois
courant.

### Contenu

- sélecteur du mois ;
- synthèse des jours ouvrés ;
- total des week-ends ;
- total des jours fériés publics ;
- total des jours fériés d’entreprise ;
- grille mensuelle ;
- badges ;
- légende ;
- tiroir de détail.

### Actions

- créer un jour férié ;
- modifier un jour férié ;
- supprimer un jour férié.

### Types actifs dans les DTO

- `PUBLIC_HOLIDAY` ;
- `COMPANY_HOLIDAY`.

`LEAVE` et `EXTERNAL_MISSION` existent dans l’enum Prisma mais ne sont pas
acceptés par les DTO de cette page.

### APIs

- `GET /api/calendar/month` ;
- `GET /api/calendar/holidays` ;
- `POST /api/calendar/holidays` ;
- `PATCH /api/calendar/holidays/:id` ;
- `DELETE /api/calendar/holidays/:id`.

### État d’erreur

Une carte d’erreur remplace le workspace si le chargement du calendrier échoue.

## 2.9 `/sanctions` — Sanctions RH

### Description

Page d’analyse mensuelle et de configuration des règles.

### Rôle

Afficher les sanctions calculées et modifier les règles persistées.

### Accessible par

ADMIN uniquement.

### État

Utilisée.

### Paramètres

- `month=YYYY-MM` ;
- `tab=monthly|rules`.

### Onglet mensuel

Affiche :

- sanctions appliquées ;
- tolérances ;
- employés concernés ;
- retards mineurs ;
- retards majeurs ;
- montant total ;
- résultats par pointage.

Chaque résultat contient :

- employé ;
- identifiant ;
- département ;
- date ;
- règle ;
- statut ;
- montant ;
- motif.

### Onglet règles

Permet de modifier :

- activation ;
- nom ;
- description ;
- seuil minimal ;
- seuil maximal ;
- tolérance mensuelle ;
- montant FCFA ;
- priorité.

### Portée active

Le moteur exécute les règles :

- `MINOR_LATENESS` ;
- `MAJOR_LATENESS`.

Les autres types peuvent être présents dans la base ou l’enum, mais ne sont pas
convertis en règles exécutables par le service actuel.

### APIs

- `GET /api/v1/sanctions/monthly` ;
- `GET /api/v1/sanctions/rules` ;
- `PATCH /api/sanctions/rules/:id`.

## 2.10 `/exports` — Rapports mensuels

### Description

Page de téléchargement des rapports de présence.

### Rôle

Générer un export équipe ou individuel.

### Accessible par

ADMIN uniquement.

### État

Utilisée.

### Filtres

- mois ;
- année ;
- format ;
- employé facultatif.

### Formats

- CSV ;
- PDF.

### Modes

Sans employé :

- rapport consolidé équipe.

Avec employé :

- rapport individuel détaillé.

### API

```text
GET /api/attendance/exports/monthly
↓
GET /api/v1/attendance/exports/monthly
```

Le proxy conserve les en-têtes de type et de téléchargement.

## 2.11 Pages techniques de chargement et d’erreur

Écrans de chargement présents :

- application générale ;
- borne ;
- espace employé ;
- employés ;
- plannings ;
- calendrier ;
- sanctions.

Error Boundaries présents :

- application générale ;
- borne ;
- espace employé ;
- employés ;
- plannings ;
- calendrier.

Ils affichent un message et, selon le composant, une action de nouvelle
tentative.

## 2.12 Pages non trouvées

- page Super Admin : non trouvée dans le code ;
- page Manager : non trouvée dans le code ;
- page Départements : non trouvée dans le code ;
- page Sites : non trouvée dans le code ;
- page Paramètres : non trouvée dans le code ;
- page Notifications : non trouvée dans le code ;
- page Congés : non trouvée dans le code ;
- page Missions : non trouvée dans le code ;
- page Audit : non trouvée dans le code ;
- page profil distincte : non trouvée dans le code ;
- `not-found.tsx` personnalisé : non trouvé dans le code.

# 3. Inventaire complet des modules

## 3.1 Authentification

### Description

Authentification des comptes et des employés utilisant la borne.

### Fonctionnalités

- email et mot de passe ;
- PIN ;
- JWT ;
- utilisateur courant ;
- contrôle de compte actif ;
- cookies HTTP-only ;
- session de borne séparée ;
- limitation du débit.

### État

Implémenté.

Refresh token : non trouvé dans le code.

## 3.2 Employés

### Description

Gestion des collaborateurs et de leurs comptes.

### Fonctionnalités

- liste ;
- détail ;
- création ;
- modification ;
- activation/désactivation ;
- rôle fonctionnel ;
- rôle d’accès ;
- département ;
- planning ;
- PIN ;
- mot de passe ;
- identifiant automatique.

### État

Implémenté sans suppression physique.

## 3.3 Départements

### Description

Valeur textuelle facultative rattachée à Employee.

### Fonctionnalités

- saisie à la création ;
- modification ;
- endpoint d’affectation ;
- filtre d’historique ;
- affichage dashboard ;
- affichage rapports ;
- regroupement visuel.

### État

Partiel.

Aucun modèle `Department`, contrôleur, service CRUD ou page dédiée n’est
présent.

## 3.4 Sites

Non trouvé dans le code.

Les coordonnées de l’entreprise sont des variables globales. Aucun modèle,
service, page ou relation multisite n’est présent.

## 3.5 Plannings

### Description

Gestion des horaires théoriques.

### Fonctionnalités

- liste ;
- détail ;
- création ;
- modification ;
- activation/désactivation ;
- heures ;
- jours ;
- marge de retard ;
- employés affectés ;
- snapshots historiques.

### État

Implémenté.

Suppression physique : non trouvée dans le code.

## 3.6 Pointage

### Description

Module principal de présence.

### Fonctionnalités

- entrée ;
- sortie ;
- actions administratives ;
- actions personnelles ;
- état quotidien ;
- historique ;
- résumé ;
- retard ;
- absence ;
- sortie anticipée ;
- sortie tardive ;
- heures supplémentaires ;
- travail hors planning ;
- travail jour non ouvré ;
- notes ;
- snapshot ;
- GPS ;
- photo.

### État

Implémenté.

## 3.7 Borne de pointage

### Description

Mode terminal partagé.

### Fonctionnalités

- URL fixe ;
- accès public initial ;
- identification PIN ;
- token court ;
- affichage de l’employé ;
- action entrée/sortie ;
- fin de session.

### État

Implémenté.

## 3.8 QR

### Description

Accès rapide à l’URL de borne.

### Fonctionnalités

- génération du QR ;
- URL publique configurable ;
- affichage dashboard ;
- affiche PDF produite côté navigateur.

### État

Implémenté.

Le QR ne contient ni identifiant employé ni action.

## 3.9 PIN

### Description

Identification à quatre chiffres.

### Fonctionnalités

- validation du format ;
- rejet de certains codes faibles ;
- contrôle d’unicité ;
- hash ;
- comparaison sécurisée ;
- migration des anciens PIN en clair ;
- limitation brute force ;
- accès limité aux EMPLOYEE actifs.

### État

Implémenté.

## 3.10 Sécurité GPS

### Description

Validation géographique conditionnelle.

### Fonctionnalités

- capture navigateur ;
- latitude/longitude ;
- précision ;
- distance ;
- rayons configurables ;
- précision maximale ;
- justification hors bureau ;
- métadonnées entrée/sortie.

### État

Implémenté et conditionnel.

## 3.11 Sécurité photo

### Description

Selfie de vérification.

### Fonctionnalités

- caméra frontale ;
- capture 720 × 720 ;
- JPEG ;
- validation Data URL ;
- upload Cloudinary ;
- URL sécurisée ;
- identifiant public ;
- preuves distinctes entrée/sortie.

### État

Implémenté.

Le selfie est obligatoire pour les endpoints personnels.

## 3.12 Historique

### Description

Consultation mensuelle des pointages.

### Fonctionnalités

- historique global ADMIN ;
- historique personnel EMPLOYEE ;
- filtres ;
- tableau ;
- détail ;
- planning ;
- GPS/photo ;
- sanction.

### État

Implémenté.

## 3.13 Dashboard

### Description

Agrégation quotidienne et mensuelle.

### Fonctionnalités

- effectif ;
- présence ;
- retards ;
- absences ;
- travail jour non ouvré ;
- départs anticipés ;
- heures supplémentaires ;
- activité récente ;
- GPS/photo ;
- classements mensuels.

### État

Implémenté.

Les compteurs de tentatives bloquées sont exposés avec des valeurs `null`, car
les tentatives refusées ne sont pas persistées par le flux inspecté.

## 3.14 Calendrier RH

### Description

Classification des jours et gestion des jours fériés.

### Fonctionnalités

- jours ouvrés ;
- week-ends ;
- jours fériés publics ;
- jours fériés d’entreprise ;
- synthèse mensuelle ;
- création ;
- modification ;
- suppression ;
- exclusion des absences.

### État

Implémenté pour les jours fériés.

## 3.15 Congés

### Description

Type `LEAVE` présent dans Prisma.

### Fonctionnalités trouvées

- enum calendrier ;
- enum sanction ;
- relation CalendarEntry vers Employee compatible avec une entrée individuelle.

### État

Partiel.

DTO, contrôleur spécialisé, page et parcours de congé : non trouvés dans le
code.

## 3.16 Missions externes

### Description

Type `EXTERNAL_MISSION` présent dans les enums.

### Fonctionnalités trouvées

- enum calendrier ;
- enum sanction ;
- suggestion de commentaire de pointage.

### État

Partiel.

Workflow métier complet : non trouvé dans le code.

## 3.17 Sanctions

### Description

Calcul disciplinaire mensuel.

### Fonctionnalités

- règles persistées ;
- configuration intégrée de repli ;
- activation ;
- seuil minimal ;
- seuil maximal ;
- bornes inclusives/exclusives ;
- tolérance mensuelle ;
- montant FCFA ;
- priorité ;
- résultat mensuel ;
- résultat ponctuel ;
- édition dans l’interface.

### État

Implémenté pour les retards mineurs et majeurs. Partiel pour les autres types
de l’enum.

## 3.18 Rapports

### Description

Production des rapports mensuels.

### Fonctionnalités

- rapport équipe ;
- rapport individuel ;
- CSV ;
- PDF ;
- filtre mois/année ;
- filtre employé ;
- présences ;
- absences ;
- retards ;
- heures ;
- sorties ;
- sécurité ;
- sanctions ;
- trace du téléchargement.

### État

Implémenté.

XLS/XLSX : non trouvé dans le code.

## 3.19 Audit

### Description

Journalisation structurée des actions administratives.

### Fonctionnalités

Actions journalisées :

- employés ;
- affectations ;
- plannings ;
- calendrier ;
- pointages administratifs ;
- exports.

Données :

- timestamp ;
- acteur ;
- email ;
- rôle ;
- action ;
- ressource ;
- identifiant ;
- métadonnées.

### État

Partiel.

Les événements sont envoyés au logger NestJS. Table et page d’audit : non
trouvées dans le code.

## 3.20 Santé

### Description

Endpoint de disponibilité.

### Fonctionnalités

Retourne :

- statut `ok` ;
- nom du service ;
- timestamp.

### État

Implémenté.

## 3.21 Notifications

Non trouvées dans le code.

## 3.22 Paramètres

### Description

Configuration technique par environnement.

### Fonctionnalités

- URLs ;
- JWT ;
- body limit ;
- rate limiting ;
- proxy ;
- GPS ;
- Cloudinary ;
- PDF.

### État

Partiel.

Modèle et écran Paramètres : non trouvés dans le code.

## 3.23 PWA

Non trouvée dans le code.

Aucun manifest web, service worker, cache offline ou gestionnaire
d’installation n’est présent.

## 3.24 Packages partagés

Non trouvés dans le code.

# 4. Inventaire des moteurs

## 4.1 Authentication Engine

### Responsabilité

Authentifier par mot de passe ou PIN et produire une identité utilisable.

### Entrées

- `LoginDto` avec email et mot de passe ;
- `AttendanceEntryLoginDto` avec PIN ;
- données Employee ;
- secret et durées JWT.

### Traitement par mot de passe

1. recherche de l’employé par email ;
2. sélection des données publiques et du hash ;
3. contrôle du compte actif ;
4. vérification du mot de passe ;
5. construction du JWT ;
6. retrait des secrets de la réponse.

### Traitement par PIN

1. normalisation du PIN ;
2. sélection des EMPLOYEE actifs ayant un hash ou un PIN historique ;
3. vérification de chaque hash ;
4. repli sur le PIN historique en clair ;
5. migration immédiate du PIN historique vers un hash ;
6. création d’un JWT de borne.

### Sorties

- `accessToken` ;
- `tokenType: Bearer` ;
- `expiresIn` ;
- utilisateur public.

### Dépendances

- PrismaService ;
- ConfigService ;
- utilitaires de mot de passe et PIN ;
- utilitaires JWT.

### Erreurs

- identifiants invalides ;
- compte inactif ;
- PIN invalide ;
- token invalide ou expiré.

## 4.2 JWT Engine

### Responsabilité

Signer et vérifier les JWT.

### Entrées

- `sub` ;
- `email` ;
- secret ;
- durée en secondes ou avec suffixe `s`, `m`, `h`, `d`.

### Traitement

- création d’un header `{alg: HS256, typ: JWT}` ;
- ajout de `iat` et `exp` ;
- encodage Base64URL ;
- signature HMAC SHA-256 ;
- comparaison de signature en temps constant ;
- décodage et validation du payload ;
- contrôle de l’expiration.

### Sorties

- chaîne JWT ;
- payload vérifié.

### Dépendances

Module Node.js `crypto`.

## 4.3 Session Cookie Engine

### Responsabilité

Stocker les JWT dans les cookies frontend.

### Entrées

- token ;
- durée ;
- mode normal ou borne.

### Sorties

- `konatech_session` ;
- `konatech_attendance_entry_session`.

### Propriétés

- HTTP-only ;
- SameSite `lax` ;
- Secure en production ;
- chemin `/` ;
- max-age calculé.

### Règles

- le mode borne utilise uniquement le cookie de borne ;
- la connexion normale efface la session de borne ;
- la déconnexion efface les deux sessions.

## 4.4 Permission Engine

### Responsabilité

Autoriser les endpoints selon le rôle d’accès.

### Entrées

- utilisateur authentifié ;
- métadonnées `@Roles`.

### Traitement

- lecture des rôles autorisés sur le handler ou le contrôleur ;
- comparaison avec `user.accessRole`.

### Sorties

- accès accordé ;
- HTTP 403.

### Rôles

- ADMIN ;
- EMPLOYEE.

Le champ texte `Employee.role` n’est pas utilisé par ce moteur.

### Dépendances

- Reflector ;
- JwtAuthGuard ;
- RolesGuard ;
- enum Prisma `AccessRole`.

## 4.5 Rate-Limiting Engine

### Responsabilité

Limiter le nombre de requêtes.

### Entrées

- chemin ;
- méthode ;
- configuration de fenêtre et limite.

### Profils

- limite globale configurable ;
- login email/mot de passe configurable ;
- PIN court : 5 requêtes par minute ;
- PIN long : 10 requêtes sur 10 minutes.

### Sorties

- requête acceptée ;
- HTTP 429.

### Dépendances

- NestJS Throttler ;
- AppThrottlerGuard ;
- ConfigService.

## 4.6 Employee Identifier Engine

### Responsabilité

Générer l’identifiant métier d’un nouvel employé.

### Entrées

- année UTC ;
- identifiants déjà présents.

### Traitement

1. création du préfixe `EMP-AAAA-` ;
2. recherche des employés partageant ce préfixe ;
3. extraction des suffixes numériques ;
4. recherche du maximum ;
5. incrément ;
6. remplissage sur trois chiffres.

### Sortie

Identifiant de forme `EMP-AAAA-NNN`.

### Contrôle de concurrence

La création utilise une transaction et peut retenter jusqu’à trois fois si la
contrainte unique de l’identifiant provoque un conflit.

### Dépendances

Prisma TransactionClient.

## 4.7 Password Engine

### Responsabilité

Hasher et vérifier les secrets.

### Entrées

- mot de passe ou PIN en clair ;
- hash existant.

### Sorties

- hash ;
- booléen de vérification.

### Utilisations

- création/modification d’employé ;
- login ;
- PIN de borne ;
- migration des PIN ;
- contrôle d’unicité logique des PIN hashés.

### Dépendances

Utilitaires de `common/security/password.util.ts`.

## 4.8 PIN Engine

### Responsabilité

Identifier un EMPLOYEE sur la borne.

### Entrées

PIN contenant exactement quatre chiffres.

### Contrôles de gestion

- format à quatre chiffres ;
- rejet des valeurs interdites lors de la gestion d’un employé ;
- PIN requis pour un EMPLOYEE nouvellement créé ;
- PIN non conservé pour ADMIN ;
- contrôle d’unicité ;
- compte actif.

### Traitement de connexion

- comparaison avec les hashes ;
- compatibilité avec les anciens PIN en clair ;
- migration de l’ancien PIN en clair après succès ;
- token de durée spécifique à la borne.

### Sorties

- LoginResponse ;
- session de borne.

### Dépendances

- AuthService ;
- EmployeesService ;
- Prisma ;
- password utilities ;
- validation PIN ;
- rate limiting.

## 4.9 Attendance Entry URL Engine

### Responsabilité

Construire l’URL fixe de pointage.

### Entrée

`FRONTEND_URL`.

### Traitement

- suppression éventuelle du slash final ;
- ajout de `/attendance-entry`.

### Sortie

URL de borne.

### Utilisations

- endpoint public `GET /attendance/entry` ;
- redirection HTTP 302 ;
- QR et actions rapides frontend.

### Dépendances

ConfigService.

## 4.10 Attendance State Engine

### Responsabilité

Construire l’état quotidien personnel.

### Entrées

- employeeId ;
- date de référence ;
- employé et planning ;
- pointage du jour ;
- calendrier ;
- historique mensuel.

### Traitement

- normalisation de la date ;
- chargement de l’employé ;
- recherche du pointage unique ;
- calcul du compte mensuel d’absences ;
- détermination du caractère attendu du jour ;
- récupération de la politique de sécurité.

### Sorties

- `date` ;
- `expectedToday` ;
- `canCheckIn` ;
- `canCheckOut` ;
- `monthlyAbsenceCount` ;
- `securityPolicy` ;
- `attendance` ;
- `employee`.

### Règles

- aucune entrée : `canCheckIn = true` ;
- entrée sans sortie : `canCheckOut = true` ;
- entrée et sortie : aucune action ;
- jour attendu seulement si planning actif, jour planifié et non férié.

### Dépendances

- Prisma ;
- CalendarService ;
- AttendanceSecurityService ;
- utilitaires de dates.

## 4.11 Check-In Engine

### Responsabilité

Enregistrer l’entrée d’un employé.

### Entrées

- employeeId ;
- `occurredAt` facultatif ;
- notes facultatives ;
- preuve de sécurité facultative dans le DTO ;
- option `enforceSecurity`.

### Contrôles

- employé existant et actif ;
- date ISO valide ;
- date non future ;
- aucune entrée existante ;
- aucune sortie préexistante ;
- contrainte unique employé/date ;
- sécurité lorsque `enforceSecurity` est vrai.

### Calculs

- date de présence normalisée en UTC ;
- jour non ouvré ;
- minutes de retard ;
- statut initial ;
- sortie théorique ;
- snapshot de planning ;
- absences mensuelles ;
- métadonnées de sécurité.

### Création ou mise à jour

Si un enregistrement du jour existe sans entrée et sans sortie, il est mis à
jour. Sinon, un nouvel Attendance est créé.

La mise à jour utilise une condition atomique sur `clockInAt` et `clockOutAt`.

### Sortie

Attendance avec données publiques de l’employé.

### Statuts initiaux

- jour non ouvré : `NON_WORKING_DAY_WORK` ;
- retard : `LATE` ;
- entrée normale avant sortie : `INCOMPLETE` ;
- jour sans planning actif : `INCOMPLETE`.

### Dépendances

- Prisma ;
- CalendarService ;
- AttendanceSecurityService ;
- snapshots ;
- utilitaires de dates.

## 4.12 Check-Out Engine

### Responsabilité

Enregistrer la sortie et finaliser les résultats de la journée.

### Entrées

- employeeId ;
- `occurredAt` facultatif ;
- notes facultatives ;
- preuve de sécurité ;
- option `enforceSecurity`.

### Contrôles

- date valide et non future ;
- entrée existante ;
- sortie absente ;
- sortie non antérieure à l’entrée ;
- sécurité lorsque demandée.

### Traitement

1. recherche du pointage du jour ;
2. évaluation de la sécurité ;
3. résolution du planning via snapshot ou planning courant ;
4. contrôle du jour non ouvré ;
5. détermination du travail hors planning ;
6. résolution de la sortie théorique ;
7. calcul du résultat de sortie ;
8. recalcul du compte d’absences ;
9. mise à jour atomique si `clockOutAt` est toujours nul.

### Sorties calculées

- `clockOutAt` ;
- `outsideScheduleWork` ;
- `scheduledExitTime` ;
- `earlyExit` ;
- `earlyExitMinutes` ;
- `lateExit` ;
- `overtimeHours` ;
- `overtimeMinutes` ;
- `absenceCount` ;
- statut final ;
- métadonnées de sécurité.

### Statuts finaux

- jour non ouvré : `NON_WORKING_DAY_WORK` ;
- travail hors planning : `PRESENT` ;
- journée planifiée avec retard : `LATE` ;
- journée planifiée sans retard : `PRESENT`.

### Dépendances

- Prisma ;
- CalendarService ;
- AttendanceSecurityService ;
- résolution de snapshot ;
- utilitaires de sortie.

## 4.13 Lateness Engine

### Responsabilité

Calculer les minutes de retard.

### Entrées

- heure de début du planning ;
- date/heure réelle ;
- marge de retard.

### Calcul

```text
delta = heure réelle - heure planifiée - marge
minutesLate = max(0, arrondi(delta en minutes))
```

Le calcul utilise les heures UTC de la date de pointage.

### Cas

- `minutesLate > 0` : statut `LATE` ;
- sinon : zéro minute ;
- jour non ouvré : zéro ;
- planning absent/inactif : zéro ;
- jour non prévu : zéro.

### Sorties

- minutes de retard ;
- statut initial associé.

### Dépendances

AttendanceService et utilitaires de planning.

## 4.14 Check-Out Outcome Engine

### Responsabilité

Classifier une sortie par rapport à l’heure théorique.

### Entrées

- heure d’entrée ;
- heure de sortie ;
- heure théorique de sortie ;
- indicateur de travail hors planning.

### Sorties

- heure théorique résolue ;
- départ anticipé ;
- minutes de départ anticipé ;
- sortie tardive ;
- heures supplémentaires ;
- minutes supplémentaires.

### Cas planifié

- avant l’heure théorique : départ anticipé ;
- à l’heure théorique : sortie normale ;
- après l’heure théorique : sortie tardive et heures supplémentaires.

### Cas hors planning

L’utilitaire dédié calcule le résultat à partir de la durée entre entrée et
sortie, sans heure théorique de planning.

### Dépendances

- `attendance-checkout.util.ts` ;
- AttendanceService.

## 4.15 Non-Working-Day Engine

### Responsabilité

Traiter les week-ends et jours fériés dans les calculs de présence.

### Entrées

- date ;
- calendrier ;
- planning ;
- pointage.

### Classification non travaillée

- week-end ;
- jour férié public actif ;
- jour férié d’entreprise actif.

### Effets sur l’entrée

- statut `NON_WORKING_DAY_WORK` ;
- aucune minute de retard ;
- aucune sortie théorique.

### Effets sur la sortie

- `outsideScheduleWork = true` ;
- statut conservé comme `NON_WORKING_DAY_WORK` ;
- pas de départ anticipé par rapport à un horaire théorique absent ;
- durée travaillée calculée comme travail hors planning.

### Effets sur les absences

Les jours non ouvrés sont exclus :

- du comptage quotidien ;
- de la génération d’absences ;
- des jours ouvrés des rapports.

### Dépendances

- CalendarService ;
- AttendanceService ;
- AttendanceMonthlyMetricsService ;
- rapport mensuel.

## 4.16 Schedule Engine

### Responsabilité

Créer, consulter et modifier les plannings.

### Entrées

- nom ;
- heure de début ;
- heure de fin ;
- marge ;
- statut ;
- jours travaillés.

### Validations DTO

- nom texte, maximum 80 caractères ;
- heures `HH:mm` ;
- marge entière entre 0 et 180 ;
- statut booléen ;
- tableau de jours ;
- au moins un jour ;
- jours uniques ;
- jours dans la liste lundi à dimanche.

### Validation métier

L’heure de fin doit être strictement postérieure à l’heure de début dans la
même journée.

### Sorties

- planning ;
- liste des employés affectés.

### Opérations

- liste ;
- détail ;
- création ;
- modification ;
- activation/désactivation.

### Contraintes

- nom unique ;
- planning existant requis lors d’une affectation.

### Dépendances

- Prisma ;
- Schedule DTOs ;
- sélections Prisma communes.

## 4.17 Schedule Snapshot Engine

### Responsabilité

Préserver le planning applicable au moment de l’entrée.

### Entrées

- planning affecté à l’employé ;
- date et heure du pointage.

### Données stockées sur Attendance

- `scheduleIdSnapshot` ;
- `scheduleNameSnapshot` ;
- `scheduleStartTimeSnapshot` ;
- `scheduleEndTimeSnapshot` ;
- `scheduleWorkDaysSnapshot` ;
- `scheduleLatenessMarginSnapshot` ;
- `scheduleCapturedAt`.

### Moment de capture

Le snapshot est construit lors du check-in.

### Utilisation à la sortie

Le moteur résout d’abord le planning historique à partir des champs snapshot.
Il l’utilise pour :

- déterminer le jour planifié ;
- résoudre l’heure théorique de sortie ;
- calculer le départ anticipé ;
- calculer les heures supplémentaires.

### Compatibilité historique

Si un ancien Attendance ne possède pas de snapshot, le moteur utilise le
planning actuel de l’employé comme repli.

### Utilisation dans les rapports

Les exports utilisent les informations de snapshot lorsqu’elles existent afin
de conserver les libellés et horaires historiques.

### Dépendances

- `attendance-schedule-snapshot.util.ts` ;
- AttendanceService ;
- AttendanceMonthlyMetricsService ;
- services d’export.
