# Journaux et supervision

| Métadonnée | Valeur |
|---|---|
| Document ID | OG-005 |
| Titre | Journaux et supervision |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Operations Guide |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre décrit les journaux, signaux de disponibilité et moyens de diagnostic réellement présents dans Konatech Pointage. Le périmètre comprend les appels explicites au logger NestJS, les sorties console des scripts, les erreurs HTTP, la validation de configuration et de requêtes, les healthchecks Docker Compose et les commandes de vérification du dépôt.

Le dépôt n’associe pas ces signaux à une plateforme externe. Les sorties sont consultables dans le terminal des processus ou par la commande de journaux Docker Compose documentée.

# 2. Journaux disponibles

| Source | Type de journal | Niveau | Emplacement | Source du dépôt |
|---|---|---|---|---|
| Bootstrap NestJS | État de la sécurité de pointage hors production et confirmation du port/préfixe API | `log` | Sortie du processus backend | `apps/backend/src/main.ts` |
| `AdminAudit` | Événements JSON d’actions administratives réussies | `warn` | Sortie du processus backend | `apps/backend/src/common/audit/audit-log.service.ts` |
| `AppThrottlerGuard` | Blocage d’une tentative PIN par limitation de débit | `warn` | Sortie du processus backend | `apps/backend/src/common/security/app-throttler.guard.ts` |
| `AttendancePhotoStorageService` | Nouvelle tentative et échec final d’envoi de photo | `warn`, `error` | Sortie du processus backend | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| `MonthlyAttendancePdfExporterService` | Début, fin, durée, taille, moteur, repli et échec d’un export PDF | `log`, `warn`, `error` | Sortie du processus backend | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Script de création d’administrateur | Création, absence de création lorsque le compte existe et échec | `console.log`, `console.error` | Sortie du script | `apps/backend/scripts/create-initial-admin.ts` |
| Script de backfill des PIN | Nombre d’enregistrements migrés et échec | `console.log`, `console.error` | Sortie du script | `apps/backend/scripts/backfill-employee-pin-code-hashes.ts` |
| Script de backfill des plannings | Nombre d’enregistrements mis à jour/ignorés et échec | `console.log`, `console.error` | Sortie du script | `apps/backend/scripts/backfill-attendance-schedule-snapshots.ts` |
| Seed Prisma | Nombre d’employés, plannings et pointages créés, ou erreur | `console.log`, `console.error` | Sortie du processus de seed | `apps/backend/prisma/seed.ts` |
| Validation proxy | Confirmation du raccordement ou erreur enrichie des dernières sorties backend/frontend | `console.log`, `console.error` | Sortie de `pnpm test:proxy` | `scripts/validate-proxy.mjs` |
| NestJS, Next.js, Prisma CLI et Docker | Sorties natives de démarrage, build, migration, test et conteneurs | Sortie standard et sortie d’erreur des outils | Terminal ou journaux Compose | `package.json`, `apps/backend/package.json`, `apps/frontend/package.json`, `docker-compose.yml`, `README.md` |

Les journaux applicatifs ne sont pas écrits dans un fichier par le code du dépôt. Aucun format global unique n’est imposé : certains messages sont textuels et les événements d’audit ou de photo sont sérialisés en JSON dans un message du logger NestJS.

# 3. Journalisation du backend

## 3.1 Logger NestJS et démarrage

`NestFactory.create()` est appelé sans configuration de logger personnalisée. Le bootstrap utilise directement `Logger.log()`.

Hors production, un message indique :

- si la sécurité du pointage est active ;
- si la localisation du site est configurée ;
- le rayon autorisé effectif ou son absence ;
- si l’ensemble de configuration Cloudinary est présent.

Dans tous les environnements, un message confirme le port d’écoute et le préfixe `/api/v1`.

## 3.2 Audit administratif

`AuditLogService` est un provider global. Il produit un message `warn` contenant un objet JSON avec :

- le type d’événement `admin_audit` ;
- l’horodatage ;
- l’identifiant, l’adresse et le rôle de l’acteur ;
- l’action ;
- la ressource et son identifiant ;
- les métadonnées propres à l’action.

Le service est appelé après des actions administratives dans les contrôleurs de pointage, employés, plannings et calendrier. L’export mensuel déclenche également un événement d’audit.

Sources : `apps/backend/src/common/audit/audit-log.module.ts`, `apps/backend/src/common/audit/audit-log.service.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/calendar/calendar.controller.ts`.

## 3.3 Limitation de débit du PIN

Lorsqu’un limiteur PIN bloque une requête, `AppThrottlerGuard` journalise au niveau `warn` la route, le tracker réseau, le user-agent, le nom du limiteur et un horodatage. Le garde retourne ensuite une exception HTTP de limitation de débit.

Les limitations globales et de connexion principale sont actives, mais le journal explicite du garde est réservé aux deux limiteurs du PIN.

## 3.4 Export PDF

Le coordinateur PDF journalise :

- le démarrage avec le moteur, le type de rapport et le nom de fichier ;
- la fin avec la durée et la taille du PDF ;
- l’usage explicite du moteur historique ;
- l’échec Puppeteer avec le message et la pile lorsqu’elle existe ;
- le passage au moteur de repli lorsqu’il est autorisé ;
- l’échec final lorsque le repli est désactivé.

Ces messages utilisent les niveaux `log`, `warn` et `error`.

## 3.5 Stockage des photos

Le service de stockage journalise en JSON :

- chaque nouvelle tentative d’envoi avec l’identifiant public, le numéro de tentative, le statut HTTP éventuel et l’état de dépassement de délai ;
- l’échec final avec l’identifiant public et les informations d’erreur disponibles.

Un dépassement de délai devient une exception HTTP de passerelle expirée. Les autres échecs d’envoi deviennent une exception de passerelle. Une configuration Cloudinary incomplète produit une exception serveur lors de l’utilisation du stockage.

## 3.6 Requêtes HTTP, validation et exceptions

Aucun middleware de journalisation HTTP n’est configuré dans `apps/backend/src/main.ts`. Aucun filtre d’exception global ni intercepteur global n’est enregistré dans `apps/backend/src`.

Le backend fournit cependant des réponses de diagnostic par les mécanismes suivants :

| Mécanisme | Comportement observable | Source |
|---|---|---|
| `ValidationPipe` global | Retire les propriétés non déclarées, rejette les propriétés interdites, transforme les valeurs et produit une erreur HTTP de validation | `apps/backend/src/main.ts` |
| Validation Joi | Interrompt le bootstrap lorsque la configuration ne respecte pas le schéma ou les contraintes croisées | `apps/backend/src/app.module.ts` |
| Exceptions NestJS | Produit des statuts correspondant aux erreurs de requête, authentification, autorisation, conflit, absence, limitation et erreurs serveur | `apps/backend/src/modules`, `apps/backend/src/common/security/app-throttler.guard.ts` |
| Gardes globaux | Produisent des réponses d’authentification ou d’autorisation lorsque le Bearer ou le rôle ne convient pas | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |

## 3.7 Erreurs Prisma

Plusieurs services reconnaissent des erreurs `PrismaClientKnownRequestError` et transforment certains codes de contrainte en exceptions HTTP de conflit ou d’absence. Ce traitement est présent dans les services employés, plannings, calendrier et pointage.

Ces conversions ne produisent pas de journal explicite. Une erreur Prisma non reconnue est relancée. Les commandes Prisma CLI écrivent leur propre résultat dans leur sortie de processus.

Sources : `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/calendar/calendar.service.ts`, `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/test/test-database.ts`.

# 4. Journalisation du frontend

## 4.1 Sorties et erreurs

Aucun appel explicite à `console.log`, `console.warn` ou `console.error` n’est présent dans `apps/frontend`. Aucun service de journalisation frontend n’est déclaré dans `apps/frontend/package.json`.

Le serveur Next.js produit ses sorties natives pendant `next dev`, `next build` et `next start`. Ces sorties restent celles du processus Next.js ; le dépôt n’ajoute pas de format, fichier ou transport applicatif.

## 4.2 Réponses des route handlers

`apps/frontend/lib/api-route.ts` convertit les échecs de communication avec le backend :

- une erreur de configuration d’URL devient une réponse JSON HTTP 500 ;
- une impossibilité de joindre le backend devient une réponse JSON HTTP 502 ;
- une session absente devient une réponse HTTP 401 ;
- un statut d’erreur backend est propagé avec un message normalisé ;
- une session de pointage refusée par le backend est supprimée lorsque le statut est 401.

La route `/api/health` applique le même principe pour le contrôle backend et renvoie le statut backend en cas de réponse reçue.

## 4.3 Pages d’erreur

Le frontend contient des composants `error.tsx` pour le dashboard racine, le pointage, les employés, les plannings, le calendrier et la page employé. Ils affichent le message reçu et proposent une nouvelle tentative ou un rechargement de la route.

Les composants d’erreur ne journalisent pas eux-mêmes l’exception. Les pages `loading.tsx` fournissent des états de chargement sans produire de journal.

Sources : `apps/frontend/app/error.tsx`, `apps/frontend/app/attendance-entry/error.tsx`, `apps/frontend/app/employees/error.tsx`, `apps/frontend/app/schedules/error.tsx`, `apps/frontend/app/calendar/error.tsx`, `apps/frontend/app/my-attendance/error.tsx`.

# 5. Vérification de disponibilité

| Point vérifié | Moyen réellement disponible | Signal de succès ou d’échec | Source |
|---|---|---|---|
| Processus backend | GET `/api/v1/health` | Réponse JSON avec état `ok`, nom de service et horodatage | `apps/backend/src/modules/health/health.controller.ts`, `apps/backend/src/main.ts` |
| Communication frontend vers backend | GET `/api/health` | Payload backend relayé ; erreur HTTP en cas de configuration ou de connexion invalide | `apps/frontend/app/api/health/route.ts`, `apps/frontend/lib/api.ts` |
| PostgreSQL Compose | Healthcheck `pg_isready` | État sain ou non sain du conteneur `postgres` | `docker-compose.yml` |
| Backend Compose | Healthcheck HTTP interne | Réponse HTTP réussie de `/api/v1/health` | `docker-compose.yml` |
| Frontend Compose | Healthcheck HTTP interne | Réponse HTTP réussie de `/api/health` | `docker-compose.yml` |
| État des services Compose | `pnpm db:status` | Tableau d’état produit par `docker compose ps` | `package.json` |
| État de la pile applicative | `docker compose --env-file .env.production ps` | État et santé des services démarrés | `README.md` |
| Journaux de la pile | `docker compose --env-file .env.production logs -f backend frontend postgres` | Sorties suivies des trois conteneurs | `README.md` |
| État des migrations | `pnpm prisma:status` | Résultat de `prisma migrate status` | `package.json` |
| Backend | `pnpm validate:backend` | Génération Prisma, typecheck, tests backend et build | `package.json` |
| Frontend et proxy | `pnpm validate:frontend` | Typecheck, build frontend et test du raccordement | `package.json` |
| Raccordement temporaire | `pnpm test:proxy` | Validation des deux routes de santé et de la redirection de pointage | `package.json`, `scripts/validate-proxy.mjs` |
| Ensemble du dépôt | `pnpm validate` | Format, Prisma, typage, lint, tests, builds et raccordement | `package.json` |

L’endpoint backend vérifie la disponibilité HTTP de NestJS sans exécuter de requête Prisma. La route frontend vérifie le chemin Next.js vers ce même endpoint. Le healthcheck PostgreSQL reste un contrôle distinct.

# 6. Diagnostic

| Situation observable | Indice disponible | Méthode présente | Source |
|---|---|---|---|
| Application backend démarrée | Message de bootstrap et réponse de santé | Lire la sortie backend et interroger `/api/v1/health` | `apps/backend/src/main.ts`, `apps/backend/src/modules/health/health.controller.ts` |
| Frontend démarré | Réponse Next.js et healthcheck frontend | Ouvrir le frontend ou interroger `/api/health` | `apps/frontend/app`, `apps/frontend/app/api/health/route.ts` |
| Backend indisponible depuis le frontend | Réponse HTTP 502 avec message générique | Interroger `/api/health` ou une route handler métier | `apps/frontend/lib/api-route.ts`, `apps/frontend/app/api/health/route.ts` |
| URL d’API frontend invalide | Réponse HTTP 500 avec message de variable concernée | Interroger `/api/health` ou une route handler | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` |
| PostgreSQL indisponible dans Compose | Healthcheck non sain et backend non démarré par dépendance | Consulter `pnpm db:status` ou l’état de la pile | `docker-compose.yml`, `package.json` |
| Erreur Prisma pendant les tests | Message enrichi de préparation de base | Exécuter `pnpm test:backend` et lire la sortie | `apps/backend/test/test-database.ts`, `package.json` |
| Écart de migration | Sortie Prisma CLI | Exécuter `pnpm prisma:status` | `package.json`, `apps/backend/prisma.config.ts` |
| Échec de migration de déploiement | Sortie Prisma et absence de démarrage du backend Docker | Lire les journaux backend Compose | `docker/backend.Dockerfile`, `README.md` |
| Erreur de configuration backend | Échec du bootstrap avec message Joi ou validation croisée | Démarrer le backend et lire sa sortie | `apps/backend/src/app.module.ts`, `apps/backend/src/main.ts` |
| Échec du rendu PDF | Messages du logger avec moteur, erreur, pile et état du repli | Lire la sortie backend lors de l’export | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Échec d’envoi de photo | Événements JSON de tentative et d’échec | Lire la sortie backend lors du pointage concerné | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Limitation du PIN | Message de sécurité et réponse HTTP de limitation | Lire la sortie backend et le statut de la requête | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Échec du raccordement | Message du test et dernières sorties des processus temporaires | Exécuter `pnpm test:proxy` | `scripts/validate-proxy.mjs` |

# 7. Flux de supervision

```text
                       +----------------------+
                       | Contrôles manuels et |
                       | scripts du dépôt     |
                       +----------+-----------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
              v                   v                   v
     `pnpm db:status`     `pnpm prisma:status`  `pnpm test:proxy`
              |                   |                   |
              v                   v                   v
      État des conteneurs   État des migrations   Backend temporaire
              |                                       |
              v                                       v
       `pg_isready`                         `/api/v1/health`
              |                                       |
              v                                       v
       PostgreSQL sain                           Frontend temporaire
                                                      |
                                                      v
                                                `/api/health`

Pile Compose active :

`postgres` healthcheck
          |
          v
`backend` healthcheck + sorties NestJS
          |
          v
`frontend` healthcheck + sorties Next.js
          |
          v
`docker compose ... logs -f backend frontend postgres`
```

Le flux repose sur des commandes ponctuelles, des healthchecks Docker et les sorties des processus. Aucun composant du dépôt ne collecte ou ne corrèle automatiquement ces signaux.

# 8. Traçabilité

| Mécanisme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Logger de démarrage | `apps/backend/src/main.ts` | Deux appels `Logger.log`, dont un conditionnel hors production |
| Logger NestJS par défaut | `apps/backend/src/main.ts` | Création NestJS sans remplacement du logger |
| Audit administrateur | `apps/backend/src/common/audit/audit-log.service.ts`, `apps/backend/src/modules` | Événement JSON `admin_audit` appelé par les contrôleurs administratifs |
| Blocage PIN | `apps/backend/src/common/security/app-throttler.guard.ts` | Message `warn` au moment du blocage |
| Journaux Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Événements JSON de nouvelle tentative et d’échec |
| Journaux PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | Messages de cycle, durée, taille, moteur et erreur |
| Validation des requêtes | `apps/backend/src/main.ts` | `ValidationPipe` global |
| Validation de configuration | `apps/backend/src/app.module.ts` | Schéma Joi et validation croisée |
| Exceptions métier | `apps/backend/src/modules` | Exceptions NestJS émises par les services et gardes |
| Conversion des erreurs Prisma | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/calendar/calendar.service.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Reconnaissance de contraintes Prisma et conversion en exceptions HTTP |
| Sorties des scripts | `apps/backend/scripts`, `apps/backend/prisma/seed.ts` | Appels console de succès et d’échec |
| Erreurs frontend | `apps/frontend/app`, `apps/frontend/lib/api-route.ts`, `apps/frontend/lib/client-error.ts` | Pages d’erreur et normalisation des réponses |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts` | Endpoint public GET `health` |
| Santé frontend | `apps/frontend/app/api/health/route.ts` | Appel du backend et propagation du statut |
| Healthchecks Compose | `docker-compose.yml` | Contrôles PostgreSQL, backend et frontend |
| État Compose | `package.json` | Script `db:status` |
| Journaux Compose | `README.md` | Commande `docker compose ... logs -f` |
| État Prisma | `package.json`, `apps/backend/prisma.config.ts` | Script `prisma:status` |
| Validation proxy | `scripts/validate-proxy.mjs` | Buffer borné des sorties récentes et contrôles HTTP |
| Tests et validations | `package.json`, `apps/backend/test` | Scripts backend, frontend, proxy et global |
| Contexte opérationnel | `documentation/07-Operations-Guide/01-Presentation-de-lexploitation.md`, `documentation/07-Operations-Guide/02-Architecture-dexecution.md`, `documentation/07-Operations-Guide/03-Demarrage-et-arret-des-services.md`, `documentation/07-Operations-Guide/04-Configuration-des-environnements.md` | Architecture, démarrage, contrôles et configuration déjà établis |

# 9. Observations

- La journalisation applicative explicite est concentrée dans le backend et les scripts.
- Le backend utilise les niveaux `log`, `warn` et `error` du logger NestJS.
- Les événements d’audit et de stockage photo sont des objets JSON sérialisés dans les messages du logger.
- Les journaux PDF sont textuels et incluent des mesures de durée et de taille.
- Aucun journal de requête HTTP n’est ajouté par l’application.
- Aucun filtre d’exception ou intercepteur global personnalisé n’est présent.
- Les erreurs de validation, d’authentification, d’autorisation et métier sont visibles comme réponses HTTP.
- Certaines contraintes Prisma sont traduites en erreurs HTTP sans journal applicatif spécifique.
- Le frontend ne contient aucun appel console explicite ; ses erreurs visibles reposent sur les réponses JSON et les composants `error.tsx`.
- Les sorties ne sont pas enregistrées dans des fichiers par le code applicatif.
- Les journaux Compose donnent accès aux sorties des trois conteneurs.
- Les trois healthchecks Compose couvrent séparément PostgreSQL, l’API et le proxy frontend.
- Le healthcheck backend ne contrôle ni Prisma, ni PostgreSQL, ni le rendu PDF, ni le stockage photo.
- Le test proxy conserve uniquement un nombre borné de lignes récentes par processus pendant son exécution et les inclut dans l’erreur finale.
- Aucun mécanisme d’alerte, de métriques applicatives, de collecte centralisée ou de conservation des journaux n’est configuré dans le dépôt.
