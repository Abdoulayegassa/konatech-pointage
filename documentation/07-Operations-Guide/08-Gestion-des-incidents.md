# Gestion des incidents

| Métadonnée | Valeur |
|---|---|
| Document ID | OG-008 |
| Titre | Gestion des incidents |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Operations Guide |
| Projet | Konatech Pointage |

# 1. Présentation

Ce chapitre décrit les incidents observables et les moyens de traitement réellement fournis par Konatech Pointage. Il s’appuie sur les erreurs HTTP, les exceptions NestJS, les réponses des route handlers Next.js, les validations, les journaux, les healthchecks Docker Compose, les commandes Prisma et les scripts de diagnostic du dépôt.

Les actions présentées sont limitées aux commandes, contrôles et comportements codés ou publiés dans le dépôt. Le chapitre ne définit pas d’organisation humaine autour des incidents.

# 2. Typologie des incidents observables

| Incident | Composant concerné | Origine observée |
|---|---|---|
| Échec du bootstrap backend | NestJS | Variable obligatoire absente, type invalide ou contrainte de sécurité incohérente dans la validation Joi |
| Backend indisponible depuis le frontend | Next.js vers NestJS | Échec réseau de `fetchServerApi` ou processus backend non joignable |
| URL frontend/API invalide | Next.js | Variable URL absente en production, URL mal formée, protocole refusé ou base API ne terminant pas par `/api/v1` |
| Frontend indisponible | Next.js | Processus non démarré, build absent ou échec de rendu |
| PostgreSQL indisponible | PostgreSQL, backend | Healthcheck `pg_isready` en échec ou datasource non joignable |
| Migration Prisma en échec | Prisma, PostgreSQL, backend Docker | Erreur de `prisma migrate status`, `migrate dev` ou `migrate deploy` |
| Prisma Client absent ou obsolète | Backend, scripts, build | Client non généré après installation ou changement du schéma |
| Base de test non préparée | Tests backend | PostgreSQL inaccessible, URL de test incorrecte ou échec de recréation/migration |
| Requête invalide | API NestJS | DTO non conforme, propriété non autorisée ou règle métier invalide |
| Authentification absente ou invalide | API, frontend | En-tête Bearer absent/mal formé, jeton invalide/expiré, identifiants invalides ou utilisateur inactif |
| Autorisation insuffisante | API NestJS | Rôle authentifié absent de la liste exigée par `@Roles()` |
| Limitation de débit | API NestJS | Dépassement d’une limite globale, de connexion ou de PIN |
| Contrainte de persistance | Services NestJS, Prisma | Unicité ou relation PostgreSQL signalée par `PrismaClientKnownRequestError` |
| Pointage refusé | Module attendance | État métier incompatible, date future, pointage déjà présent ou preuve de sécurité invalide |
| Stockage photo en échec | Backend, service photo externe | Configuration incomplète, réponse distante en erreur ou dépassement de délai |
| Export PDF en échec | Backend, Puppeteer/Chromium | Renderer indisponible ou erreur de rendu avec repli désactivé |
| Validation du proxy en échec | Script de test frontend/backend | Santé backend/frontend non atteinte, URL incohérente, redirection incorrecte ou ports temporaires bloqués |
| Fichier verrouillé sous Windows | Build, Prisma, Next.js, NestJS | Erreur `EPERM`, accès refusé ou artefact verrouillé sur les chemins de build |

# 3. Détection des incidents

## 3.1 Réponses HTTP

| Signal | Origine | Signification observable | Source |
|---|---|---|---|
| HTTP 400 | `ValidationPipe` et services métier | Corps ou règle métier invalide | `apps/backend/src/main.ts`, `apps/backend/src/modules` |
| HTTP 401 | `JwtAuthGuard`, `AuthService` ou proxy sans session | Authentification absente, invalide, expirée ou utilisateur inactif | `apps/backend/src/modules/auth`, `apps/frontend/lib/api-route.ts` |
| HTTP 403 | `RolesGuard` | Rôle insuffisant | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| HTTP 404 | Services métier | Ressource demandée absente | `apps/backend/src/modules` |
| HTTP 409 | Services métier et contraintes Prisma connues | Conflit d’état ou d’unicité | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/calendar/calendar.service.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| HTTP 429 | `AppThrottlerGuard` | Limite de requêtes atteinte | `apps/backend/src/common/security/app-throttler.guard.ts` |
| HTTP 500 | Configuration frontend ou erreur backend interne | URL frontend invalide, configuration photo absente lors d’un envoi ou renderer PDF indisponible | `apps/frontend/lib/api-route.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| HTTP 502 | Proxy frontend ou stockage photo | Backend non joignable depuis Next.js ou échec de passerelle du stockage photo | `apps/frontend/lib/api-route.ts`, `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| HTTP 504 | Stockage photo | Délai d’envoi de photo dépassé | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |

## 3.2 Santé et état des services

Les contrôles disponibles sont :

- GET `/api/v1/health` pour le processus backend ;
- GET `/api/health` pour le chemin frontend vers le backend ;
- `pg_isready` dans le healthcheck PostgreSQL ;
- les healthchecks HTTP des services backend et frontend ;
- `pnpm db:status` pour l’état Compose ;
- `docker compose --env-file .env.production ps` pour la pile construite ;
- `pnpm prisma:status` pour l’état des migrations.

L’endpoint backend ne réalise pas de requête Prisma. La santé PostgreSQL est donc détectée séparément par Compose ou par les commandes Prisma qui utilisent la datasource.

## 3.3 Journaux et sorties

| Source | Incident rendu visible | Méthode d’accès | Source |
|---|---|---|---|
| Bootstrap NestJS | Configuration et démarrage backend | Sortie du processus backend | `apps/backend/src/main.ts`, `apps/backend/src/app.module.ts` |
| Garde de limitation PIN | Blocage d’une tentative PIN | Message `warn` avec route, tracker et limiteur | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Stockage photo | Nouvelles tentatives, statut et échec final | Messages JSON `warn` et `error` | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Export PDF | Début, fin, moteur, durée, pile et échec | Messages `log`, `warn` et `error` | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Prisma CLI | État ou échec de génération/migration/seed | Sortie de la commande pnpm concernée | `package.json` |
| Test proxy | Cause du contrôle et dernières sorties temporaires | Sortie de `pnpm test:proxy` | `scripts/validate-proxy.mjs` |
| Conteneurs | Démarrage, migration et erreurs des services | `docker compose --env-file .env.production logs -f backend frontend postgres` | `README.md` |

# 4. Traitement des incidents

| Incident | Symptôme | Cause observée dans le code | Procédure réellement disponible | Vérification |
|---|---|---|---|---|
| PostgreSQL local arrêté | `pg_isready` non sain, commandes Prisma en échec | Service `postgres` non disponible | Exécuter `pnpm db:up`, puis `pnpm db:status` | `pnpm prisma:status` |
| PostgreSQL Compose non sain | Backend non démarré par `depends_on` | Healthcheck PostgreSQL en échec | Lire `docker compose --env-file .env.production logs -f backend frontend postgres` et l’état avec `docker compose --env-file .env.production ps` | État `healthy`, puis santé backend |
| Migrations non appliquées | `pnpm prisma:status` signale un écart | Historique de la base différent de `apps/backend/prisma/migrations` | Exécuter `pnpm prisma:migrate:deploy` dans le flux de déploiement publié | Réexécuter `pnpm prisma:status` |
| Migration Docker en échec | Conteneur backend sans API disponible | `migrate deploy` échoue avant `node dist/main.js` | Lire les journaux backend Compose ; exécuter `pnpm prisma:status` contre la datasource concernée | `/api/v1/health` après réussite de la migration et démarrage |
| Prisma Client à régénérer | Erreur de client pendant build ou script | Client absent ou non aligné au schéma | Exécuter `pnpm prisma:generate` | `pnpm validate:backend` |
| Bootstrap backend refusé | Processus NestJS s’arrête avec un message de validation | Variables absentes ou incohérentes | Utiliser `apps/backend/.env.example` et les règles de `apps/backend/src/app.module.ts`, puis relancer la commande de démarrage utilisée | GET `/api/v1/health` |
| Configuration frontend invalide | Route handler en HTTP 500 avec le nom d’une URL | URL manquante ou rejetée par `resolveConfiguredUrl` | Vérifier les trois URL décrites dans `apps/frontend/.env.example`; exécuter `pnpm test:proxy` | GET `/api/health` |
| Backend non joignable depuis Next.js | Route handler en HTTP 502 | `fetchServerApi` lève une erreur de connexion | Vérifier `/api/v1/health`, lire les sorties des processus et exécuter `pnpm test:proxy` | GET `/api/health` |
| Frontend en échec de build | `next build` ou une page échoue | Erreur de typage, build, configuration ou rendu | Exécuter `pnpm validate:frontend` | Build terminé et GET `/api/health` |
| Session générale absente | Réponse 401 ou redirection vers `/login` | Cookie de session absent ou jeton refusé | Utiliser la route `/login`, qui appelle `/api/auth/login` et recrée le cookie après authentification réussie | GET `/api/v1/auth/me` par le chargement applicatif |
| Session de pointage refusée | Réponse 401 et retour au pavé PIN | Jeton de pointage expiré/invalide ou employé inactif | Le proxy supprime le cookie de pointage ; `/attendance-entry` réaffiche le pavé PIN | Identification PIN réussie puis chargement de `/attendance-entry` |
| Limite PIN atteinte | HTTP 429 et journal de sécurité | Limiteur court ou long bloqué | Lire l’en-tête `Retry-After` produit par le garde | Nouvelle requête acceptée après expiration indiquée |
| Requête métier invalide | HTTP 400 avec message | DTO ou règle métier rejeté | Lire le message retourné par NestJS ; aucun script d’exploitation ne transforme la requête | Réponse réussie d’une requête conforme |
| Conflit Prisma connu | HTTP 409 | Contrainte unique ou relation reconnue par le service | Lire le message HTTP retourné ; aucun script générique de correction n’est présent | Requête ultérieure sans conflit |
| Stockage photo en échec | HTTP 500, 502 ou 504 et journal photo | Configuration incomplète, réponse distante ou délai | Lire les événements du service et contrôler les variables Cloudinary définies dans les fichiers d’exemple/Compose | Pointage concerné accepté sans erreur de stockage |
| Export PDF en échec | HTTP 500 et journaux du renderer | Chromium/Puppeteer indisponible et repli désactivé | Lire les journaux PDF ; l’image backend installe Chromium et définit `ATTENDANCE_PDF_EXECUTABLE_PATH` | Exécuter l’export et obtenir une réponse de fichier |
| Test proxy en échec | `pnpm test:proxy` retourne un code non nul | Santé, URLs, redirection ou port temporaire | Appliquer les contrôles de la section Troubleshooting de `README.md` et lire les sorties récentes imprimées | Réexécuter `pnpm test:proxy` |
| Verrouillage Windows | `EPERM` ou accès refusé | Processus local ou artefact verrouillé | Exécuter `pnpm.cmd clean:windows:dev`, puis `pnpm.cmd clean:windows:prisma` si le client Prisma est concerné | Réexécuter `pnpm.cmd prisma:generate` et la commande initialement en échec |

Les traitements du tableau ne modifient pas les données métier, sauf les commandes Prisma de migration explicitement prévues pour modifier la structure de la base.

# 5. Gestion des erreurs

## 5.1 Backend

Le backend utilise les mécanismes suivants :

| Mécanisme | Comportement implémenté | Source |
|---|---|---|
| `ValidationPipe` global | Liste blanche, rejet des propriétés non déclarées, transformation et conversion implicite | `apps/backend/src/main.ts` |
| Validation Joi | Validation de l’environnement et contraintes croisées au bootstrap | `apps/backend/src/app.module.ts` |
| Exceptions NestJS | `BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException` et exceptions serveur/passerelle | `apps/backend/src/modules`, `apps/backend/src/common/security/app-throttler.guard.ts` |
| `JwtAuthGuard` | Rejette l’absence ou le mauvais format Bearer, puis valide le jeton et l’utilisateur | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| `RolesGuard` | Compare le rôle de l’utilisateur aux rôles exigés par le handler ou le contrôleur | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| `AppThrottlerGuard` | Produit les en-têtes de limite et une exception 429 lorsque le tracker est bloqué | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Erreurs Prisma connues | Convertit certaines contraintes en erreurs HTTP métier | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/calendar/calendar.service.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| Erreurs photo | Classe configuration, contenu, passerelle et délai en exceptions HTTP distinctes | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Erreurs PDF | Journalise la pile, applique le repli configuré ou retourne une erreur serveur | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |

Aucun filtre d’exception global ni intercepteur global personnalisé n’est enregistré. Les exceptions utilisent donc les mécanismes HTTP fournis par NestJS.

## 5.2 Frontend

`apps/frontend/lib/api-route.ts` normalise les erreurs de proxy :

- 500 pour une erreur de configuration d’URL ;
- 502 lorsque le backend n’est pas joignable ;
- 401 lorsqu’aucune session adaptée n’est disponible ;
- propagation du statut backend et d’un message normalisé lorsqu’une réponse est reçue.

Les routes d’authentification créent les cookies HTTP-only après succès. La session de pointage est supprimée lorsqu’une réponse 401 la rend invalide.

Les composants `error.tsx` présents pour plusieurs pages affichent `error.message` et proposent les actions de nouvelle tentative ou de rechargement codées dans chaque composant.

# 6. Vérification du rétablissement

| Élément rétabli | Contrôle disponible | Résultat attendu par le code | Source |
|---|---|---|---|
| PostgreSQL | `pnpm db:status` | Service PostgreSQL sain selon Compose | `package.json`, `docker-compose.yml` |
| Migrations | `pnpm prisma:status` | État cohérent des migrations | `package.json` |
| Prisma et backend | `pnpm validate:backend` | Génération, typecheck, tests et build réussis | `package.json` |
| Backend HTTP | GET `/api/v1/health` | `status` égal à `ok` et service attendu | `apps/backend/src/modules/health/health.controller.ts` |
| Frontend vers backend | GET `/api/health` | Payload de santé backend relayé | `apps/frontend/app/api/health/route.ts` |
| Raccordement complet | `pnpm test:proxy` | Santé des deux processus et redirection `/attendance-entry` validées | `scripts/validate-proxy.mjs` |
| Frontend | `pnpm validate:frontend` | Typecheck, build et proxy réussis | `package.json` |
| Pile Compose | `docker compose --env-file .env.production ps` | Services et healthchecks dans l’état attendu | `README.md`, `docker-compose.yml` |
| Authentification | Route `/login` puis chargement utilisateur | Cookie créé et utilisateur retourné par l’API | `apps/frontend/app/api/auth/login/route.ts`, `apps/backend/src/modules/auth/auth.controller.ts` |
| Pointage PIN | `/attendance-entry` | Session dédiée créée et écran de pointage chargé | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` |
| Export PDF | Endpoint mensuel d’export | Réponse de fichier avec en-têtes de contenu | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Ensemble du dépôt | `pnpm validate` | Chaîne complète de format, Prisma, typage, lint, tests, builds et proxy réussie | `package.json` |

# 7. Diagramme de traitement

```text
Symptôme observable
        |
        v
Réponse HTTP / sortie processus / état Compose
        |
        +-------------------+--------------------+
        |                   |                    |
        v                   v                    v
  HTTP 4xx/5xx       Healthcheck en échec   Commande en échec
        |                   |                    |
        v                   v                    v
Message normalisé     `pnpm db:status`      Sortie Prisma/build/test
ou journal ciblé      ou `compose ps`              |
        |                   |                    |
        +-------------------+--------------------+
                            |
                            v
Commande ou comportement existant associé
                            |
                            v
Contrôle de rétablissement
        |
        +--> `/api/v1/health`
        +--> `/api/health`
        +--> `pnpm prisma:status`
        +--> `pnpm test:proxy`
        +--> `pnpm validate:backend`
        +--> `pnpm validate:frontend`
```

Le flux repose sur des contrôles déclenchés par les commandes et endpoints du dépôt. Aucun composant applicatif ne coordonne ces étapes dans un workflow distinct.

# 8. Traçabilité

| Mécanisme documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Bootstrap et validation globale | `apps/backend/src/main.ts` | Création NestJS, middlewares, pipe global, port et logs |
| Validation d’environnement | `apps/backend/src/app.module.ts` | Schéma Joi et validation croisée |
| Santé backend | `apps/backend/src/modules/health/health.controller.ts` | Endpoint public GET `health` |
| Santé frontend | `apps/frontend/app/api/health/route.ts` | Appel du backend et réponse normalisée |
| Erreurs proxy | `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts` | Validation des URL, statuts 500/502/401 et propagation |
| Authentification JWT | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Signature, vérification et erreurs 401 |
| Autorisation | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Vérification du rôle et erreur 403 |
| Limitation de débit | `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/backend/src/app.module.ts` | En-têtes, blocage et journal PIN |
| Validation métier | `apps/backend/src/modules` | Exceptions de services et DTOs validés |
| Erreurs Prisma | `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/calendar/calendar.service.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Reconnaissance de contraintes connues |
| Cycle Prisma | `apps/backend/src/common/prisma/prisma.service.ts` | Client injectable et déconnexion |
| Migrations | `package.json`, `apps/backend/prisma.config.ts`, `apps/backend/prisma/migrations` | Scripts de statut et migration |
| Démarrage Docker backend | `docker/backend.Dockerfile` | Migration préalable au processus NestJS |
| Dépendances Compose | `docker-compose.yml` | Healthchecks, `depends_on` et politique `restart` |
| Incident photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Journaux, tentatives et exceptions 400/500/502/504 |
| Incident PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` | Journaux, pile, repli et erreur serveur |
| Pages d’erreur | `apps/frontend/app` | Composants `error.tsx` et actions de nouvelle tentative |
| Test proxy | `scripts/validate-proxy.mjs` | Ports temporaires, healthchecks, redirection, logs récents et code de sortie |
| Nettoyage Windows | `scripts/clean-windows.ps1`, `package.json` | Arrêt des processus sur ports connus, nettoyage et génération Prisma |
| Commandes de diagnostic | `package.json`, `README.md` | État Compose, Prisma, validations et journaux |
| Documentation opérationnelle liée | `documentation/07-Operations-Guide/03-Demarrage-et-arret-des-services.md`, `documentation/07-Operations-Guide/04-Configuration-des-environnements.md`, `documentation/07-Operations-Guide/05-Journaux-et-supervision.md`, `documentation/07-Operations-Guide/06-Exploitation-de-PostgreSQL-et-Prisma.md`, `documentation/07-Operations-Guide/07-Sauvegarde-et-restauration.md` | Mécanismes de démarrage, configuration, diagnostic et données déjà établis |

# 9. Observations

- Les incidents sont visibles par les réponses HTTP, les sorties de processus, les healthchecks Compose et les commandes de validation.
- Le frontend distingue une erreur de configuration d’URL d’une indisponibilité réseau du backend.
- Le backend centralise la validation des requêtes dans un pipe global.
- L’authentification et l’autorisation sont appliquées par deux gardes globaux distincts.
- La limitation de débit expose des en-têtes de capacité et de reprise.
- Les blocages PIN, échecs de photo et échecs PDF possèdent des journaux applicatifs ciblés.
- Certaines erreurs Prisma sont converties en conflits HTTP ; les erreurs non reconnues sont relancées.
- Les migrations du conteneur backend précèdent le démarrage de l’API.
- Le backend Compose attend un PostgreSQL sain et le frontend Compose attend un backend sain.
- Les trois services Compose déclarent la politique `restart: unless-stopped`.
- Le healthcheck backend ne vérifie pas PostgreSQL.
- Le healthcheck frontend vérifie le chemin Next.js vers le healthcheck backend.
- Le test proxy démarre ses propres processus, conserve leurs dernières sorties et les arrête à la fin.
- Les composants d’erreur frontend affichent l’erreur et proposent uniquement les actions codées de nouvelle tentative ou rechargement.
- Les scripts de nettoyage Windows ciblent les artefacts du dépôt et les ports de développement déclarés.
- Aucun mécanisme du dépôt n’enregistre un incident dans un système distinct ou n’attribue son traitement à un rôle humain.
