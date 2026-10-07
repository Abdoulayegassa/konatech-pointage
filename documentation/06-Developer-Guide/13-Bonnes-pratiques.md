# Bonnes pratiques

| Métadonnée         | Valeur           |
| ------------------ | ---------------- |
| Document ID        | DG-013           |
| Titre              | Bonnes pratiques |
| Version            | 1.0              |
| Statut             | Validé           |
| Classification     | Interne          |
| Référence          | Developer Guide  |
| Date de génération | 30 juillet 2026  |

## 1. Présentation

### 1.1 Objectif

Ce chapitre recense les pratiques de développement effectivement appliquées dans le dépôt Konatech Pointage. Il décrit leur matérialisation dans l'organisation du code, la couche de données, le frontend, le backend et les mécanismes de qualité.

Chaque pratique citée correspond à un fichier, une configuration ou un motif répété dans les sources actuelles.

### 1.2 Rôle des pratiques observées

Les pratiques présentes structurent le projet autour de frontières explicites :

- le monorepo sépare les applications frontend et backend ;
- les domaines backend sont assemblés par modules NestJS ;
- les pages, composants et Route Handlers ont des responsabilités distinctes ;
- Prisma centralise le schéma et les accès PostgreSQL ;
- les DTO et la validation globale contrôlent les entrées backend ;
- TypeScript strict, ESLint et Prettier fournissent un cadre commun ;
- les tests backend et le contrôle de proxy vérifient les parcours implémentés ;
- les scripts racine rendent les opérations répétées accessibles depuis le workspace.

## 2. Organisation du code

### 2.1 Pratiques d'organisation

| Pratique observée               | Mise en œuvre réelle                                                                                       | Effet structurel visible                                                |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Séparation des applications     | `apps/frontend` et `apps/backend` possèdent leurs manifestes et configurations                             | Les technologies et cycles de build restent distincts                   |
| Workspace unique                | `pnpm-workspace.yaml` déclare `apps/*`                                                                     | Les dépendances sont installées depuis la racine                        |
| Modules par domaine             | Répertoires `auth`, `employees`, `schedules`, `attendance`, `calendar`, `sanctions`, `dashboard`, `health` | Le code backend est regroupé par responsabilité fonctionnelle           |
| Code transversal isolé          | Répertoire backend `common`                                                                                | Prisma, audit, sécurité, temps, validation et utilitaires sont partagés |
| Composition explicite           | `AppModule` importe chaque module applicatif                                                               | Les dépendances applicatives sont visibles dans un point d'assemblage   |
| Composants par domaine          | Sous-répertoires de `apps/frontend/components`                                                             | Les écrans et composants métier restent regroupés                       |
| UI partagée                     | `components/ui`, `components/layout`, `components/admin`                                                   | Les éléments visuels et structures communes sont réutilisés             |
| Routes conformes à l'App Router | `page.tsx`, `layout.tsx`, `loading.tsx`, `error.tsx`, `route.ts`                                           | La responsabilité des fichiers est identifiable par leur nom            |
| Scripts centralisés             | Scripts racine pour build, validation, Prisma, base et développement                                       | Les commandes des deux applications sont orchestrées depuis la racine   |
| Documentation segmentée         | Répertoires numérotés et chapitres Markdown                                                                | Les ensembles documentaires restent séparés par usage                   |

### 2.2 Séparation des responsabilités backend

Le backend suit un découpage récurrent :

| Couche            | Responsabilité observée                                                              |
| ----------------- | ------------------------------------------------------------------------------------ |
| Module            | Déclare contrôleurs, fournisseurs, imports et exports                                |
| Controller        | Adapte la requête HTTP, applique les rôles, lit les paramètres et appelle le service |
| DTO               | Décrit et valide la charge entrante                                                  |
| Service           | Porte les règles métier et les opérations Prisma                                     |
| PrismaService     | Fournit le client de base partagé                                                    |
| Guard             | Contrôle authentification, rôle ou throttling                                        |
| Utilitaire commun | Regroupe un calcul ou une transformation réutilisée                                  |

Les contrôleurs `EmployeesController`, `SchedulesController`, `CalendarController` et `AttendanceController` délèguent les opérations métier à leur service. Les accès Prisma sont concentrés dans les services.

### 2.3 Modularité backend

Les modules déclarent uniquement les dépendances présentes :

- `CalendarModule` importe l'audit et exporte `CalendarService` ;
- `DashboardModule` importe `CalendarModule` ;
- `AttendanceModule` importe le calendrier et les sanctions ;
- `SanctionsModule`, `AttendanceModule` et `AuthModule` exportent leur service principal lorsque celui-ci est consommé ailleurs ;
- `PrismaModule` et `AuditLogModule` sont globaux pour leurs services transverses ;
- `EmployeesModule` et `SchedulesModule` gardent leur service interne.

Le domaine `attendance`, plus étendu, sépare le traitement principal, la sécurité, la politique, le stockage photo, les métriques mensuelles et les exporteurs.

### 2.4 Découpage frontend/backend

La communication entre les applications passe par HTTP. Le frontend n'importe pas les sources NestJS.

Le chemin observé pour une mutation navigateur est :

1. composant client ;
2. route locale sous `apps/frontend/app/api` ;
3. fonction partagée de `lib/api-route.ts` ;
4. API backend sous `/api/v1` ;
5. contrôleur et service NestJS ;
6. Prisma et PostgreSQL.

Les pages serveur chargent les données avec les fonctions de `lib/api.ts`. Les mutations clientes utilisent les proxies locaux, qui lisent la session côté serveur.

## 3. Gestion des données

### 3.1 Pratiques de persistance

| Pratique observée             | Implémentation                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| Schéma central                | Modèles, relations, énumérations, contraintes et index dans `schema.prisma`            |
| Historique de schéma          | Migrations SQL datées sous `prisma/migrations`                                         |
| Génération explicite          | Scripts `prisma:generate` au niveau racine et backend                                  |
| Migration selon le contexte   | `migrate dev` pour le développement et `migrate deploy` pour les migrations existantes |
| Migration au démarrage Docker | Le conteneur backend exécute `migrate deploy` avant NestJS                             |
| Seed isolé                    | `prisma/seed.ts` et script `prisma:seed` distinct du démarrage                         |
| Client injecté                | `PrismaService` étend `PrismaClient` et est fourni globalement                         |
| Fermeture du client           | `$disconnect()` est appelé à la destruction du module                                  |
| Transactions ciblées          | `$transaction` protège la création d'employé et ses opérations associées               |
| Concurrence du pointage       | Contrainte unique et mises à jour conditionnelles protègent l'entrée/sortie            |
| Erreurs Prisma traduites      | Le code `P2002` est converti en conflit dans plusieurs services                        |

### 3.2 Modèles et contraintes

Le schéma applique directement plusieurs invariants :

- UUID générés pour les identifiants principaux ;
- unicité de l'identifiant employé, de l'e-mail et de plusieurs identifiants métier ;
- unicité composée d'un pointage par employé et par date ;
- relation employé/planning avec `SetNull` à la suppression du planning ;
- relation employé/pointages avec suppression en cascade ;
- index sur les dates, statuts de sécurité, métriques de sortie, absences et règles ;
- champs `createdAt` et `updatedAt` sur les modèles ;
- énumérations pour les rôles, statuts, types de calendrier, vérifications et sanctions.

Les instantanés de planning sont conservés dans `Attendance`. Les calculs ultérieurs privilégient ces valeurs plutôt que le planning modifiable.

### 3.3 DTO et validation

| Pratique observée                 | Mise en œuvre                                                   |
| --------------------------------- | --------------------------------------------------------------- |
| Contrats d'entrée explicites      | 23 fichiers DTO dans les modules backend                        |
| Validation déclarative            | Décorateurs `class-validator` sur les propriétés                |
| Normalisation ciblée              | `class-transformer` convertit certaines chaînes vides en `null` |
| Création et modification séparées | DTO distincts pour les charges complètes et partielles          |
| Paramètres contrôlés              | UUID, dates, mois, longueurs, plages et énumérations validés    |
| Validation globale                | `ValidationPipe` appliqué à toutes les routes                   |
| Propriétés étrangères refusées    | `whitelist` et `forbidNonWhitelisted` actifs                    |
| Conversion                        | Transformation et conversion implicite actives                  |
| Règles partagées                  | Validation du PIN extraite dans `common/validation`             |

La validation métier complète les DTO dans les services, notamment pour les doublons, l'ordre des pointages, les horaires, les chevauchements et les associations existantes.

### 3.4 Typage Prisma

Les sélections partagées utilisent `satisfies Prisma.*Select`. Les types de résultats sont dérivés avec `Prisma.*GetPayload`.

`common/prisma/selects.ts` définit :

- la projection publique d'un employé ;
- la projection d'un planning ;
- l'employé avec planning ;
- le planning avec employés ;
- le pointage avec son employé.

La projection publique n'inclut pas `passwordHash`, `pinCode` ni `pinCodeHash`. Les contrôleurs et services réutilisent ces sélections pour leurs réponses.

### 3.5 Protection des données d'authentification

Les mécanismes réellement appliqués comprennent :

- hachage des mots de passe et PIN avec `scrypt`, sel aléatoire et clé de 64 octets ;
- comparaison avec `timingSafeEqual` ;
- signature JWT HMAC SHA-256 ;
- contrôle de la signature, du contenu et de l'expiration du JWT ;
- secret JWT validé dans la configuration backend ;
- cookies de session `httpOnly`, `sameSite: "lax"` et `secure` en production ;
- session générale et session courte de terminal stockées dans deux cookies distincts ;
- aucun repli de la session terminal vers la session générale.

## 4. Développement Frontend

### 4.1 Pratiques frontend

| Pratique observée    | Mise en œuvre réelle                                                    |
| -------------------- | ----------------------------------------------------------------------- |
| App Router           | Pages et Route Handlers sous `apps/frontend/app`                        |
| Chargement serveur   | Pages asynchrones appelant `lib/api.ts`                                 |
| Protection des pages | `requireCurrentUser`, lecture de session et redirection selon le rôle   |
| Interactivité isolée | Directive `'use client'` sur les composants avec état ou API navigateur |
| Composants métier    | Regroupement dans un dossier portant le nom du domaine                  |
| Composants UI        | Boutons, cartes, badges et squelettes partagés                          |
| État local           | Hooks React utilisés dans les composants clients                        |
| Valeurs dérivées     | `useMemo` sur les listes filtrées et synthèses                          |
| Effets navigateur    | `useEffect` et `useRef` pour horloge, caméra, canvas et panneaux        |
| Contrats HTTP        | Types de réponses et charges regroupés dans `lib/api.ts`                |
| Proxies              | Fonctions communes dans `lib/api-route.ts`                              |
| Erreurs              | Messages de repli, `getClientErrorMessage` et error boundaries          |
| Chargement           | Fichiers `loading.tsx` sur plusieurs routes                             |
| Styles               | Tailwind CSS et fusion de classes avec `cn`                             |

### 4.2 Pages et contrôle d'accès

Les pages administratives suivent un motif répété :

1. chargement de l'utilisateur courant ;
2. redirection des non-administrateurs vers `/my-attendance` ;
3. lecture du jeton serveur ;
4. redirection vers `/login` lorsqu'il est absent ;
5. chargement des données ;
6. transmission des données initiales à un composant métier.

Les pages utilisent `PageShell`, `AdminNav`, `LogoutForm` et les composants UI communs. Plusieurs routes déclarent `dynamic = "force-dynamic"` pour leurs données authentifiées.

### 4.3 Composants et formulaires

Les gestionnaires d'employés, de plannings, de calendrier et de sanctions conservent séparément :

- les données affichées ;
- le mode création ou modification ;
- les valeurs de formulaire ;
- l'état de soumission ;
- l'action en cours ;
- le message de succès ou d'erreur ;
- les filtres et valeurs dérivées.

Les composants vérifient plusieurs contraintes immédiatement avant l'appel. Le backend applique ensuite le contrat DTO et les règles métier.

Les fichiers `employee-manager.helpers.ts` et `schedule-manager.helpers.ts` extraient les valeurs initiales, transformations et métadonnées d'affichage hors des composants principaux.

### 4.4 Hooks

Les hooks React standards sont utilisés directement :

| Hook            | Usage observé                                                    |
| --------------- | ---------------------------------------------------------------- |
| `useState`      | Formulaires, étapes, filtres, sélection et feedback              |
| `useMemo`       | Collections filtrées, statistiques et regroupements              |
| `useEffect`     | Initialisation navigateur, horloge, caméra et cycle des panneaux |
| `useRef`        | Vidéo, canvas et références DOM                                  |
| `useTransition` | Soumission du formulaire de connexion                            |

Aucun dossier de hooks personnalisés n'est présent. Les effets et états restent dans les composants qui les consomment.

### 4.5 Services et appels API

Le frontend ne possède pas de classes de service. La couche d'accès est constituée de fonctions :

- `fetchServerApi` gère l'appel serveur de base ;
- `requestApi<T>` retourne une réponse typée ou `ApiRequestError` ;
- les fonctions `get*Data` assemblent les lectures de page ;
- les helpers `proxyApi*` ajoutent le jeton et conservent les statuts backend ;
- les Route Handlers associent les chemins frontend aux chemins backend ;
- `getClientErrorMessage` uniformise la lecture de l'erreur côté composant.

Les erreurs de configuration des URL sont distinguées des indisponibilités backend. Les cookies sont lus dans les Route Handlers et ne sont pas transmis aux composants sous forme de secret.

### 4.6 UI et états

Les composants UI acceptent `className` et utilisent `cn` pour fusionner les classes Tailwind. Les variantes visuelles sont typées dans les composants concernés.

Les routes possédant un fichier `error.tsx` affichent le message reçu et proposent une nouvelle tentative ou un rechargement. Les routes possédant `loading.tsx` fournissent un état de chargement dédié.

Les états vides et erreurs fonctionnelles utilisent des composants ou panneaux propres à la zone concernée, par exemple `AdminEmptyState`.

## 5. Développement Backend

### 5.1 Pratiques backend

| Pratique observée                 | Mise en œuvre réelle                                   |
| --------------------------------- | ------------------------------------------------------ |
| Architecture modulaire            | Un module NestJS par domaine                           |
| Contrôleurs centrés HTTP          | Routes, corps, paramètres, rôles et audit              |
| Services métier                   | Calculs, validations métier et accès Prisma            |
| Injection de dépendances          | Constructeurs `private readonly`                       |
| Services partagés                 | Exports NestJS uniquement lorsque consommés            |
| Validation globale                | `ValidationPipe` au bootstrap                          |
| Configuration typée à l'exécution | `ConfigModule` global, schéma Joi et `getOrThrow`      |
| Sécurité HTTP                     | Helmet, CORS configuré, limites de corps et throttling |
| Authentification globale          | Guards JWT et rôles enregistrés par `APP_GUARD`        |
| Routes publiques explicites       | Décorateur `@Public`                                   |
| Utilisateur courant               | Décorateur `@CurrentUser`                              |
| Audit administratif               | Événements structurés après plusieurs mutations        |
| Erreurs HTTP                      | Exceptions NestJS correspondant à la condition métier  |

### 5.2 Contrôleurs

Les contrôleurs :

- utilisent les décorateurs de méthode NestJS ;
- appliquent les rôles au niveau classe ou méthode ;
- emploient `ParseUUIDPipe` pour plusieurs identifiants ;
- transmettent les DTO au service ;
- récupèrent l'acteur avec `@CurrentUser` pour les opérations auditées ;
- attendent la réussite métier avant d'émettre l'événement d'audit ;
- retournent le résultat du service sans requête Prisma directe.

`HealthController` constitue le module minimal : il retourne directement un statut statique et ne possède pas de service.

### 5.3 Services

Les services :

- injectent Prisma ou les services de domaine ;
- regroupent les recherches préalables et règles métier ;
- utilisent des méthodes privées pour les calculs et normalisations internes ;
- exécutent des lectures indépendantes avec `Promise.all` dans plusieurs agrégats ;
- utilisent les utilitaires communs pour les dates, sorties et instantanés de planning ;
- traduisent les conditions métier en exceptions HTTP ;
- capturent certaines erreurs Prisma connues ;
- emploient des mises à jour conditionnelles pour les courses d'entrée/sortie.

Le domaine pointage sépare également les exporteurs CSV, PDF, le renderer Puppeteer, le stockage photo, la politique de sécurité et le recalcul mensuel.

### 5.4 Injection de dépendances

NestJS construit les services déclarés dans `providers`. Les dépendances sont reçues par constructeur et conservées avec `private readonly`.

`PrismaService` et `AuditLogService` proviennent de modules globaux. Les dépendances fonctionnelles passent par les imports/exports de modules, par exemple le calendrier consommé par le dashboard et le pointage.

### 5.5 Configuration et démarrage

Le bootstrap :

- désactive le body parser implicite ;
- installe `bodyParser` avec une limite configurée ;
- installe Helmet ;
- configure le nombre de proxies de confiance ;
- configure CORS avec `FRONTEND_URL` et les credentials ;
- ajoute le préfixe `/api/v1` ;
- installe la validation globale ;
- lit le port avec `getOrThrow`.

`AppModule` valide les variables avec Joi, y compris les combinaisons liées à la sécurité de pointage, Cloudinary et aux contraintes de production.

### 5.6 Gestion des erreurs

Les services et guards utilisent :

| Exception                      | Condition observée                          |
| ------------------------------ | ------------------------------------------- |
| `BadRequestException`          | Donnée ou règle métier invalide             |
| `UnauthorizedException`        | Identifiants, en-tête ou jeton invalide     |
| `ForbiddenException`           | Rôle insuffisant                            |
| `NotFoundException`            | Ressource absente                           |
| `ConflictException`            | Doublon ou conflit concurrent               |
| `InternalServerErrorException` | Configuration ou rendu interne indisponible |
| `BadGatewayException`          | Échec du service photo externe              |
| `GatewayTimeoutException`      | Délai externe dépassé                       |

Le throttler ajoute une réponse 429 et journalise les blocages du PIN. Les exports PDF et le stockage photo journalisent leur progression ou échec avec `Logger`.

## 6. Qualité du projet

### 6.1 Typage et format

| Pratique observée         | Configuration                                                |
| ------------------------- | ------------------------------------------------------------ |
| TypeScript strict         | Activé dans les deux applications                            |
| Typage sans émission      | Scripts `typecheck` avec `tsc --noEmit`                      |
| ESLint commun             | Configuration flat à la racine                               |
| Règles Next.js            | Recommended et Core Web Vitals sur le frontend               |
| Variables inutilisées     | Erreur, sauf noms commençant par `_`                         |
| Prettier                  | Quotes simples, point-virgules, virgules finales, largeur 80 |
| Compatibilité lint/format | `eslint-config-prettier` chargé après les règles             |
| Alias frontend            | `@/*` vers la racine de l'application                        |

### 6.2 Validation automatisée

Le script `validate` enchaîne réellement :

1. contrôle Prettier ;
2. génération Prisma ;
3. contrôles TypeScript ;
4. ESLint ;
5. tests backend ;
6. build frontend ;
7. build backend ;
8. validation du proxy frontend/backend.

Des sous-chaînes `validate:backend` et `validate:frontend` isolent les applications.

### 6.3 Tests

Les tests backend sont centralisés sous `apps/backend/test`. La configuration Jest sélectionne les fichiers `*.e2e-spec.ts` et les exécute en série.

Les mécanismes présents couvrent :

- routes HTTP avec Supertest ;
- application NestJS complète ;
- base PostgreSQL de test recréée ;
- migrations et seed ;
- services intégrés obtenus depuis l'application ;
- services isolés avec mocks Jest ;
- configuration, authentification, autorisation, employés, plannings, pointage, calendrier, absences, sanctions, exports et PDF.

Le script `test:proxy` démarre les deux applications sur des ports temporaires, vérifie les healthchecks et contrôle la redirection du terminal.

### 6.4 Configuration et environnements

Les pratiques observées comprennent :

- fichiers `.env.example` distincts pour backend et frontend ;
- exemple de production Compose séparé ;
- validation Joi au démarrage backend ;
- variables frontend publiques préfixées `NEXT_PUBLIC_` ;
- variables serveur gardées sans ce préfixe ;
- URL de production vérifiées par le code frontend et backend ;
- fichiers d'environnement effectifs exclus du contexte Docker ;
- installation Docker avec lockfile figé ;
- migration Prisma exécutée avant le démarrage backend du conteneur.

### 6.5 Observabilité locale

Le dépôt met en œuvre :

- endpoint backend `/api/v1/health` ;
- proxy frontend `/api/health` ;
- healthchecks Docker des trois services ;
- `Logger` NestJS pour bootstrap, audit, throttling, photo et PDF ;
- commande `db:status` ;
- commande `prisma:status` ;
- consultation des logs Docker Compose ;
- tampon des dernières sorties dans `test:proxy`.

## 7. Traçabilité

### 7.1 Organisation

| Pratique              | Fichiers analysés                                                  |
| --------------------- | ------------------------------------------------------------------ |
| Monorepo              | `package.json`, `pnpm-workspace.yaml`, manifestes des applications |
| Modules backend       | `apps/backend/src/app.module.ts`, fichiers `modules/*/*.module.ts` |
| Code transversal      | `apps/backend/src/common/**`                                       |
| App Router            | `apps/frontend/app/**`                                             |
| Composants            | `apps/frontend/components/**`                                      |
| Bibliothèque frontend | `apps/frontend/lib/**`                                             |

### 7.2 Données et sécurité

| Pratique              | Fichiers analysés                                     |
| --------------------- | ----------------------------------------------------- |
| Schéma et contraintes | `apps/backend/prisma/schema.prisma`                   |
| Migrations            | `apps/backend/prisma/migrations/**/migration.sql`     |
| Seed                  | `apps/backend/prisma/seed.ts`, `prisma.config.ts`     |
| Client partagé        | `common/prisma/prisma.module.ts`, `prisma.service.ts` |
| Sélections publiques  | `common/prisma/selects.ts`, `employees.service.ts`    |
| DTO                   | `apps/backend/src/modules/*/dto/*.ts`                 |
| Secrets               | `common/security/password.util.ts`, `jwt.util.ts`     |
| Cookies               | `apps/frontend/lib/auth-session.ts`                   |

### 7.3 Frontend

| Pratique           | Fichiers analysés                                                         |
| ------------------ | ------------------------------------------------------------------------- |
| Pages protégées    | Pages dashboard, employés, plannings, calendrier, historique et sanctions |
| Composants clients | Gestionnaires et espaces sous `components`                                |
| UI partagée        | `components/ui/*`, `components/layout/*`, `components/admin/*`            |
| Hooks              | Composants contenant les imports React correspondants                     |
| API                | `lib/api.ts`, `lib/api-route.ts`, Route Handlers sous `app/api`           |
| Erreurs            | `lib/client-error.ts`, fichiers `error.tsx`                               |
| Chargement         | Fichiers `loading.tsx` présents                                           |

### 7.4 Backend

| Pratique                | Fichiers analysés                                                      |
| ----------------------- | ---------------------------------------------------------------------- |
| Bootstrap               | `apps/backend/src/main.ts`                                             |
| Configuration           | `apps/backend/src/app.module.ts`                                       |
| Controllers et services | `apps/backend/src/modules/**/*.controller.ts`, `**/*.service.ts`       |
| Guards et décorateurs   | `modules/auth/guards/*`, `modules/auth/decorators/*`, throttler commun |
| Audit                   | `common/audit/*`, contrôleurs administratifs                           |
| Utilitaires métier      | `common/utils/*`, `common/time/*`, `common/validation/*`               |

### 7.5 Qualité

| Pratique       | Fichiers analysés                                            |
| -------------- | ------------------------------------------------------------ |
| TypeScript     | `apps/backend/tsconfig*.json`, `apps/frontend/tsconfig.json` |
| ESLint         | `eslint.config.mjs`                                          |
| Prettier       | `.prettierrc.json`, `.prettierignore`                        |
| Scripts        | `package.json`, manifestes des applications                  |
| Tests          | `apps/backend/test/**`, `scripts/validate-proxy.mjs`         |
| Docker         | Dockerfiles, `docker-compose.yml`, `.dockerignore`           |
| Environnements | Fichiers `.env.example`, schéma Joi et résolveurs d'URL      |

## 8. Observations

### 8.1 Cohérence

- Le nom des modules, contrôleurs, services et DTO suit le domaine concerné.
- Les composants React utilisent des exports nommés, tandis que les pages utilisent l'export par défaut de Next.js.
- Les erreurs backend utilisent les exceptions HTTP NestJS.
- Les mutations frontend passent de manière répétée par les Route Handlers.
- Les applications partagent les mêmes outils racine de typage, lint et format.

### 8.2 Homogénéité

- Le triplet module/controller/service apparaît dans tous les domaines backend disposant de logique métier.
- Les pages administratives répètent le même contrôle d'utilisateur, de rôle et de session.
- Les gestionnaires frontend suivent des états comparables pour formulaire, soumission, action et feedback.
- Les DTO de création et de modification utilisent les mêmes familles de décorateurs.
- Les scripts racine invoquent directement les binaires installés dans les applications.

### 8.3 Réutilisation

- Prisma et l'audit sont fournis par des modules globaux.
- Les services de calendrier et sanctions sont exportés pour les modules consommateurs.
- Les sélections Prisma publiques sont partagées.
- Les règles de PIN, dates de pointage et calculs de sortie sont extraits dans `common`.
- Les composants UI, la structure de page et la navigation administrateur sont partagés.
- Les fonctions de session, proxy, erreur et URL sont regroupées dans `lib`.

### 8.4 Maintenabilité observable

- Les migrations gardent l'historique du schéma.
- Le lockfile et les images versionnées encadrent la reproduction des dépendances.
- Les contrats d'entrée sont explicites dans les DTO.
- Les règles métier sont localisées dans les services.
- Les tests intégrés contrôlent les interactions entre calendrier, pointage, sanctions et exports.
- La chaîne `validate` regroupe les contrôles exécutables du dépôt.
- Les types frontend et DTO backend sont maintenus séparément, sans package partagé ni génération de contrat.
- Les hooks restent locaux aux composants, sans couche de hooks personnalisés.
- Les tests frontend de composants ne sont pas présents ; le contrôle frontend automatisé repose sur le typage, le build et le proxy.
