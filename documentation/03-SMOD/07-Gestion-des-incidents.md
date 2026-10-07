# Gestion des incidents

| Métadonnée | Valeur |
|---|---|
| Document ID | SMOD-INCIDENT-001 |
| Titre | Gestion des incidents |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | SMOD |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce document décrit les signaux d'incident, moyens de détection, procédures de diagnostic, opérations de rétablissement et contrôles disponibles dans le dépôt Konatech Pointage.

Il ne définit pas de processus organisationnel qui ne serait pas matérialisé dans le projet.

### 1.2 Périmètre

Le périmètre couvre les incidents techniques observables pour :

- le frontend Next.js ;
- le backend NestJS et l'API ;
- PostgreSQL ;
- Prisma ;
- l'authentification et l'autorisation ;
- Docker Compose et les builds ;
- les variables d'environnement ;
- les dépendances conditionnelles Cloudinary et Chromium.

### 1.3 Public concerné

Ce document s'adresse aux exploitants, ingénieurs DevOps, SRE, développeurs, responsables techniques et intervenants chargés du diagnostic ou du rétablissement de la plateforme.

Sources : `README.md`, `docker-compose.yml`, `package.json`, `apps/backend/src/`, `apps/frontend/`.

## 2. Typologie des incidents

Le dépôt ne contient aucune classification officielle par sévérité, priorité ou impact. Les catégories suivantes correspondent uniquement à des pannes ou erreurs techniquement observables dans le code, les scripts et la configuration.

### 2.1 Incidents frontend

| Signal observable | Origine représentée dans le projet |
|---|---|
| L'application ne répond pas sur son port | Processus Next.js arrêté, build ou démarrage en échec |
| `/api/health` renvoie une erreur | Backend inaccessible ou backend en erreur |
| Réponse HTTP 500 du proxy | URL frontend/API invalide ou absente en production |
| Réponse HTTP 502 du proxy | Échec de connexion du route handler vers le backend |
| Message de session expirée | Cookie de session absent ou jeton non disponible |
| Healthcheck Docker `unhealthy` | Requête vers `http://127.0.0.1:3000/api/health` en échec |
| `test:proxy` en échec | Healthcheck, redirection ou cohérence des URL non conforme |
| Build frontend en échec | Erreur TypeScript, compilation ou dépendance de build |

Le proxy frontend convertit une erreur de configuration d'URL en réponse 500 et les autres échecs de connexion au backend en réponse 502.

Sources : `apps/frontend/lib/api.ts`, `apps/frontend/lib/api-route.ts`, `apps/frontend/app/api/health/route.ts`, `docker-compose.yml`.

### 2.2 Incidents backend

| Signal observable | Origine représentée dans le projet |
|---|---|
| `/api/v1/health` ne répond pas | Processus NestJS indisponible ou port inaccessible |
| Conteneur backend `unhealthy` | Requête locale de santé en échec |
| Backend non démarré | Validation de configuration, migration ou démarrage NestJS en échec |
| Réponse HTTP 400 | DTO invalide, règle métier ou preuve de sécurité invalide |
| Réponse HTTP 404 | Employé, présence ou ressource recherchée absente |
| Réponse HTTP 409 | Conflit de pointage ou contrainte métier |
| Réponse HTTP 429 | Limitation de débit atteinte |
| Réponse HTTP 500 | Erreur interne, dont indisponibilité du moteur PDF sans repli autorisé |
| Réponse HTTP 502 ou 504 | Échec ou timeout Cloudinary relayé par le backend |
| Build ou tests en échec | Erreur de code, type, base de test ou comportement |

Une réponse métier 4xx n'atteste pas à elle seule une indisponibilité de la plateforme. Elle reste un signal observable pouvant être diagnostiqué à partir du code et des messages retournés.

Sources : contrôleurs et services backend, service Cloudinary, service d'export PDF, `package.json`.

### 2.3 Incidents PostgreSQL

| Signal observable | Origine représentée dans le projet |
|---|---|
| Service `postgres` non démarré | Conteneur absent, arrêté ou démarrage en échec |
| État `unhealthy` | `pg_isready` échoue pendant les essais |
| Backend non démarré sous Compose | Le backend attend un PostgreSQL sain |
| `prisma:status` en échec | Datasource inaccessible ou chaîne de connexion incorrecte |
| Tests backend en échec à la préparation | Impossible de joindre ou recréer la base de test |
| Erreurs dans les logs PostgreSQL | Erreur produite par le serveur ou le conteneur |

Le volume `postgres-data` assure la persistance locale. Il ne fournit pas une détection d'intégrité ou de corruption.

Sources : `docker-compose.yml`, `apps/backend/test/test-database.ts`, `package.json`.

### 2.4 Incidents Prisma

| Signal observable | Origine représentée dans le projet |
|---|---|
| Génération du client en échec | Schéma invalide, dépendances indisponibles ou exécution Prisma en erreur |
| État des migrations en erreur | Connexion ou historique de migration non exploitable |
| `migrate dev` en échec | Migration de développement non appliquée |
| `migrate deploy` en échec | Migration versionnée non appliquée au déploiement |
| Backend Docker ne démarre pas | La commande de migration précède `node dist/main.js` |
| Requête Prisma en échec | Erreur de connexion ou contrainte remontée au backend |

Prisma n'est pas un service séparé et n'a pas de healthcheck propre.

Sources : `apps/backend/prisma.config.ts`, `apps/backend/prisma/schema.prisma`, `docker/backend.Dockerfile`, scripts Prisma.

### 2.5 Incidents d'authentification et d'autorisation

| Statut ou message | Condition implémentée |
|---|---|
| `Invalid credentials.` | Adresse inconnue, compte inactif ou mot de passe incorrect |
| `Identifiants invalides.` | Code PIN de borne non reconnu |
| `Invalid or expired token.` | Jeton invalide ou expiré |
| `User is no longer active.` | Jeton lié à un employé absent ou inactif |
| `Missing Authorization header.` | En-tête d'autorisation absent |
| `Authorization header must use Bearer.` | Schéma Bearer absent ou incorrect |
| `Insufficient permissions for this resource.` | Rôle insuffisant |
| `Session expiree.` | Session frontend non disponible |
| `Trop de tentatives...` | Limite de tentatives de la borne atteinte |

Les limites de la borne sont journalisées au niveau `warn`. Le login standard possède également un limiteur configuré.

Sources : `apps/backend/src/modules/auth/`, `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/frontend/lib/api-route.ts`.

### 2.6 Incidents de déploiement

| Signal observable | Origine représentée dans le projet |
|---|---|
| Build Docker en échec | Installation figée, génération Prisma ou build applicatif en échec |
| Backend bloqué au démarrage | PostgreSQL non sain, migration en échec ou configuration invalide |
| Frontend bloqué au démarrage | Backend non sain |
| PDF premium indisponible | Chromium absent ou chemin non exploitable |
| URL publique incorrecte | Validation backend ou frontend en échec |
| Conteneur redémarré | Politique `restart: unless-stopped` appliquée |

Le dépôt fournit une procédure Docker Compose, mais aucun pipeline CI/CD ni manifeste Render.

Sources : Dockerfiles, `docker-compose.yml`, `README.md`.

### 2.7 Incidents de configuration

Le backend valide au démarrage :

- `NODE_ENV` ;
- le port ;
- `FRONTEND_URL` ;
- le secret et la durée JWT ;
- `DATABASE_URL` ;
- les limites HTTP et de débit ;
- le nombre de sauts proxy ;
- la politique GPS ;
- la configuration Cloudinary ;
- le moteur PDF.

Les erreurs explicites comprennent :

- coordonnées incomplètes lorsque la sécurité est active ;
- latitude ou longitude configurée seule ;
- rayon d'avertissement inférieur au rayon de confiance ;
- identifiants Cloudinary partiellement configurés ;
- secret JWT de production identifié comme local ou de test ;
- URL frontend de production locale, non HTTPS, privée ou fondée sur un tunnel temporaire.

Le frontend valide ses URL et produit des erreurs lorsque l'URL n'est pas absolue, manque en production, pointe vers localhost, n'utilise pas HTTPS, utilise une destination non permise ou ne termine pas par `/api/v1` pour une URL d'API.

Sources : `apps/backend/src/app.module.ts`, `apps/frontend/lib/api.ts`.

### 2.8 Incidents de services conditionnels

#### Cloudinary

Le service journalise :

- les nouvelles tentatives ;
- le statut HTTP ;
- les timeouts ;
- les échecs définitifs.

Il peut renvoyer une erreur 502 ou 504.

#### Export PDF

Le service journalise :

- le moteur sélectionné ;
- le début et la fin de génération ;
- la durée et la taille du document ;
- les erreurs Puppeteer ;
- le repli historique lorsqu'il est explicitement autorisé.

En mode premium sans repli, une indisponibilité du moteur produit une erreur interne explicite.

## 3. Détection

### 3.1 Healthchecks

| Composant | Contrôle | Paramètres |
|---|---|---|
| PostgreSQL | `pg_isready` | intervalle 10 s, timeout 5 s, 5 essais, démarrage 10 s |
| Backend | Requête vers `/api/v1/health` | intervalle 20 s, timeout 5 s, 5 essais, démarrage 30 s |
| Frontend | Requête vers `/api/health` | intervalle 20 s, timeout 5 s, 5 essais, démarrage 30 s |

Compose expose les états résultants avec `docker compose ps`.

Source : `docker-compose.yml`.

### 3.2 Endpoints

Backend :

```bash
curl http://localhost:4000/api/v1/health
```

Frontend et connexion backend :

```bash
curl http://localhost:3000/api/health
```

Le healthcheck backend renvoie un état, un identifiant de service et un horodatage. Il ne vérifie pas directement PostgreSQL.

Le healthcheck frontend relaie le backend.

### 3.3 Logs

Consultation Compose documentée :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

En développement, `pnpm dev` transmet les sorties backend et frontend au terminal.

Les journaux explicitement présents couvrent :

- le démarrage backend ;
- les actions administratives ;
- la limitation de débit de la borne ;
- Cloudinary ;
- le moteur PDF ;
- les scripts d'administration et de backfill.

Sources : `README.md`, `scripts/dev.mjs`, loggers backend.

### 3.4 Scripts

Les scripts de détection ponctuelle sont :

```bash
pnpm db:status
pnpm prisma:status
pnpm test:proxy
pnpm validate:backend
pnpm validate:frontend
pnpm validate
```

### 3.5 Vérifications du test de proxy

`pnpm test:proxy` détecte :

- un backend qui ne devient pas prêt ;
- un frontend qui ne devient pas prêt ;
- un contenu de healthcheck inattendu ;
- un statut de redirection incorrect ;
- une destination de redirection incorrecte ;
- une incohérence de connexion entre frontend et backend.

Il capture au maximum 80 lignes récentes par processus et les inclut dans l'erreur.

Source : `scripts/validate-proxy.mjs`.

### 3.6 Messages d'erreur frontend

Le proxy frontend conserve les messages backend lorsqu'ils sont disponibles. Il utilise sinon un message de repli propre à chaque route.

Les cas génériques sont :

| Statut | Signal |
|---|---|
| 401 | Session absente ou expirée |
| 500 | Configuration d'URL invalide |
| 502 | Backend inaccessible depuis le frontend |

Le healthcheck frontend renvoie le statut du backend lorsque celui-ci répond en erreur.

### 3.7 Messages de configuration au démarrage

La validation Joi du backend interrompt l'initialisation lorsque les variables obligatoires ou leurs contraintes ne sont pas satisfaites.

Le frontend lève des erreurs lors de la résolution d'URL invalide. Ces erreurs sont renvoyées par les route handlers sous forme de réponse 500 lorsqu'elles sont reconnues comme erreurs de configuration.

### 3.8 Absence de détection automatique externe

Aucun système d'alerte, monitoring centralisé, sonde d'uptime externe, tracing distribué ou notification d'incident n'est configuré.

La détection repose sur les healthchecks, états, journaux, messages et commandes exécutés.

## 4. Diagnostic

### 4.1 Vérification API

1. Appeler le healthcheck :

   ```bash
   curl http://localhost:4000/api/v1/health
   ```

2. En exécution Compose, afficher l'état :

   ```bash
   docker compose --env-file .env.production ps
   ```

3. Consulter les journaux :

   ```bash
   docker compose --env-file .env.production logs backend
   ```

4. Exécuter le contrôle backend :

   ```bash
   pnpm validate:backend
   ```

Le healthcheck confirme le processus HTTP. `validate:backend` vérifie Prisma Client, les types, les tests et le build.

### 4.2 Vérification frontend

1. Contrôler le proxy :

   ```bash
   curl http://localhost:3000/api/health
   ```

2. Comparer avec le backend :

   ```bash
   curl http://localhost:4000/api/v1/health
   ```

3. Consulter les journaux frontend :

   ```bash
   docker compose --env-file .env.production logs frontend
   ```

4. Exécuter :

   ```bash
   pnpm validate:frontend
   ```

Un backend sain avec un proxy en échec localise le signal dans le processus frontend, sa résolution d'URL ou sa connexion au backend.

### 4.3 Vérification de la base

1. Afficher l'état PostgreSQL :

   ```bash
   docker compose ps
   ```

2. Consulter les journaux :

   ```bash
   docker compose logs postgres
   ```

3. Vérifier la datasource :

   ```bash
   pnpm prisma:status
   ```

Le healthcheck PostgreSQL et `prisma:status` contrôlent deux chemins distincts : le serveur dans le conteneur et la connexion depuis la commande Prisma.

### 4.4 Vérification Prisma

État des migrations :

```bash
pnpm prisma:status
```

Génération du client :

```bash
pnpm prisma:generate
```

Tests backend :

```bash
pnpm test:backend
```

Les tests recréent leur base dédiée. Ils ne diagnostiquent pas le contenu de la base de production.

### 4.5 Vérification Docker

Pile locale par défaut :

```bash
docker compose ps
```

Pile applicative :

```bash
docker compose --profile app ps
```

Journaux complets :

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

La dépendance opérationnelle est PostgreSQL, puis backend, puis frontend.

### 4.6 Vérification des variables backend

Fichiers de référence :

- `apps/backend/.env.example` ;
- `.env.production.example` ;
- validation dans `apps/backend/src/app.module.ts`.

Ordre de chargement backend :

1. `.env.<NODE_ENV>.local` ;
2. `.env.<NODE_ENV>` ;
3. `.env.local` ;
4. `.env`.

Le premier fichier existant n'arrête pas la lecture des suivants ; le tableau complet est transmis au module de configuration.

Les valeurs sensibles ne sont pas affichées dans ce document.

### 4.7 Vérification des variables frontend

Fichier de référence :

- `apps/frontend/.env.example`.

Variables impliquées dans les erreurs de connexion :

- `NEXT_PUBLIC_APP_URL` ;
- `NEXT_PUBLIC_API_BASE_URL` ;
- `API_BASE_URL`.

Le test de proxy injecte temporairement des URL cohérentes et vérifie la redirection publique.

### 4.8 Vérification de l'authentification

Les réponses permettent de distinguer :

- l'absence d'en-tête ;
- un schéma Bearer invalide ;
- des identifiants invalides ;
- un jeton invalide ou expiré ;
- un compte devenu inactif ;
- un rôle insuffisant ;
- une limite de tentatives atteinte.

Les tests end-to-end couvrent l'authentification, les rôles et les limites selon les cas définis dans `apps/backend/test`.

### 4.9 Vérification Cloudinary

Les journaux backend exposent :

- `cloudinary_upload_retry` ;
- `cloudinary_upload_failed` ;
- le statut HTTP ;
- le timeout ;
- le message.

La validation backend exige que les trois identifiants Cloudinary soient configurés ensemble lorsqu'un seul est présent.

Aucun healthcheck Cloudinary distinct n'existe.

### 4.10 Vérification du moteur PDF

Les journaux indiquent :

- le moteur ;
- le type de rapport ;
- le nom de fichier ;
- la durée ;
- la taille ;
- les erreurs ;
- le repli éventuel.

La checklist de release contient un contrôle manuel du rendu PDF et de Chromium.

Sources : service d'export PDF, `docs/RELEASE_CHECKLIST.md`.

## 5. Rétablissement

### 5.1 Redémarrage

Pile Compose complète :

```bash
docker compose --env-file .env.production --profile app restart
```

Les trois services déclarent `restart: unless-stopped`.

En développement, arrêter puis relancer :

```bash
pnpm dev
```

Aucun script pnpm nommé `restart` n'est défini.

### 5.2 Reconstruction

Reconstruction complète :

```bash
pnpm build
```

Reconstruction ciblée :

```bash
pnpm build:backend
pnpm build:frontend
```

Reconstruction des images et démarrage :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

### 5.3 Réinstallation

```bash
pnpm install
```

Les builds Docker utilisent :

```bash
pnpm install --frozen-lockfile
```

Aucun script `reinstall` ni procédure de suppression automatique de `node_modules` n'est présent.

### 5.4 Migrations

Contrôle :

```bash
pnpm prisma:status
```

Développement :

```bash
pnpm prisma:migrate
```

Déploiement :

```bash
pnpm prisma:migrate:deploy
```

Le conteneur backend exécute `migrate deploy` avant `node dist/main.js`.

### 5.5 Régénération Prisma

```bash
pnpm prisma:generate
```

Sous Windows, le script de nettoyage avec régénération est :

```powershell
pnpm clean:windows:prisma
```

### 5.6 Réinitialisation

Aucun script de réinitialisation de la base applicative n'est présent. Aucun `db:reset`, `prisma:reset` ou appel à `prisma migrate reset` n'est défini.

Le code de test supprime et recrée uniquement la base dédiée aux tests. Il ne constitue pas une procédure de rétablissement de la base exploitée.

### 5.7 Restauration PostgreSQL

Le dépôt documente une restauration SQL :

```bash
cat backup.sql | docker compose --env-file .env.production exec -T postgres sh -lc 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

Il documente une restauration au format personnalisé :

```bash
cat backup.dump | docker compose --env-file .env.production exec -T postgres sh -lc 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists'
```

Ces procédures supposent qu'une sauvegarde correspondante soit disponible.

Source : `README.md`.

### 5.8 Seed

```bash
pnpm prisma:seed
```

Le seed charge des données de démonstration. Il ne restaure pas les données métier d'une sauvegarde.

### 5.9 Premier administrateur

Lorsque la base est vide et qu'un premier administrateur est nécessaire, le script présent est :

```bash
pnpm --dir apps/backend run admin:create
```

Il est idempotent sur l'adresse électronique configurée.

### 5.10 Backfills

```bash
pnpm --dir apps/backend run pins:backfill
pnpm --dir apps/backend run snapshots:backfill
```

Ces scripts réparent les données ciblées par leur implémentation. Ils ne remplacent pas une restauration.

### 5.11 Redéploiement

Le seul redéploiement exécutable décrit dans le dépôt est le cycle Docker Compose :

```bash
docker compose --env-file .env.production --profile app up -d --build
```

Aucune commande de redéploiement Render, aucun workflow CI/CD et aucun manifeste de plateforme ne sont présents.

### 5.12 Repli PDF

Le moteur historique peut être sélectionné explicitement par la configuration PDF, ou autorisé comme repli selon la variable dédiée.

Ce mécanisme concerne uniquement la génération PDF. Il ne constitue pas un rollback de version, de déploiement ou de base.

### 5.13 Rollback

Aucun rollback applicatif global, rollback Docker, rollback de migration ou migration descendante n'est défini.

## 6. Vérification après incident

### 6.1 API

```bash
curl http://localhost:4000/api/v1/health
```

La réponse attendue contient `status: ok`, l'identifiant du service et un horodatage.

### 6.2 Frontend

```bash
curl http://localhost:3000/api/health
```

Puis accès à :

```text
http://localhost:3000
```

### 6.3 Base PostgreSQL

```bash
docker compose --env-file .env.production ps
docker compose --env-file .env.production logs postgres
```

L'état sain repose sur `pg_isready`.

### 6.4 Prisma

```bash
pnpm prisma:status
pnpm prisma:generate
```

La première commande vérifie la connexion et les migrations. La seconde vérifie la génération du client.

### 6.5 Healthchecks intégrés

```bash
pnpm test:proxy
```

Le script valide les deux endpoints de santé, les URL et la redirection de la borne.

### 6.6 Contrôles applicatifs

Backend :

```bash
pnpm validate:backend
```

Frontend :

```bash
pnpm validate:frontend
```

Plateforme :

```bash
pnpm validate
```

### 6.7 Contrôles fonctionnels manuels

`TESTING_CHECKLIST.md` et `docs/RELEASE_CHECKLIST.md` couvrent manuellement :

- authentification ;
- employés et plannings ;
- pointage ;
- historique et tableau de bord ;
- sanctions et calendrier ;
- exports ;
- parcours mobiles et responsive.

Ces checklists ne sont pas un outil de suivi d'incident et ne consignent pas automatiquement les résultats.

### 6.8 Vérification des journaux

```bash
docker compose --env-file .env.production logs -f backend frontend postgres
```

Le dépôt ne fournit aucune règle automatique indiquant la durée d'observation après rétablissement.

## 7. Scripts utiles

| Script ou commande | Usage dans le diagnostic ou le rétablissement |
|---|---|
| `pnpm db:status` | Afficher l'état Compose |
| `pnpm db:up` | Démarrer PostgreSQL |
| `pnpm db:down` | Arrêter Compose |
| `docker compose ps` | Afficher l'état et la santé des conteneurs |
| `docker compose logs` | Consulter les journaux des conteneurs |
| `docker compose --profile app restart` | Redémarrer la pile applicative |
| `pnpm prisma:status` | Vérifier la datasource et les migrations |
| `pnpm prisma:generate` | Régénérer Prisma Client |
| `pnpm prisma:migrate` | Appliquer les migrations de développement |
| `pnpm prisma:migrate:deploy` | Appliquer les migrations versionnées |
| `pnpm prisma:seed` | Charger le seed de démonstration |
| `pnpm dev` | Relancer frontend et backend en développement |
| `pnpm dev:backend` | Relancer le backend seul |
| `pnpm dev:frontend` | Relancer le frontend seul |
| `pnpm build` | Reconstruire les deux applications |
| `pnpm build:backend` | Reconstruire le backend |
| `pnpm build:frontend` | Reconstruire le frontend |
| `pnpm test:backend` | Exécuter les tests end-to-end backend |
| `pnpm test:proxy` | Diagnostiquer la connexion frontend/backend |
| `pnpm validate:backend` | Vérifier et construire le backend |
| `pnpm validate:frontend` | Vérifier et construire le frontend, puis tester le proxy |
| `pnpm validate` | Exécuter la validation complète |
| `pnpm clean:windows:dev` | Arrêter les processus sur les ports ciblés et nettoyer sous Windows |
| `pnpm clean:windows:prisma` | Nettoyer et régénérer Prisma sous Windows |
| `pnpm --dir apps/backend run admin:create` | Créer le premier administrateur |
| `pnpm --dir apps/backend run pins:backfill` | Exécuter le backfill des hash PIN |
| `pnpm --dir apps/backend run snapshots:backfill` | Exécuter le backfill des snapshots |

Aucun script `incident`, `diagnose`, `doctor`, `monitor`, `restart`, `reset`, `rollback`, `redeploy` ou `postmortem` n'est défini dans les `package.json`.

## 8. Dépendances

```text
+----------------------+
| Incident             |
| signal ou erreur     |
+----------+-----------+
           |
           v
+----------------------+
| Diagnostic           |
| health / logs / tests|
+----------+-----------+
           |
           v
+----------------------+
| Backend NestJS       |
| API /api/v1          |
+----------+-----------+
           |
           v
+----------------------+
| Prisma               |
| client / migrations  |
+----------+-----------+
           |
           v
+----------------------+
| PostgreSQL           |
| pg_isready / données |
+----------------------+
```

Le frontend précède le backend dans le chemin utilisateur :

```text
Utilisateur -> Frontend -> Backend -> Prisma -> PostgreSQL
```

La chaîne de diagnostic descend de l'interface vers la base, tandis que la chaîne de démarrage Compose remonte de PostgreSQL vers le frontend.

## 9. Traçabilité

| Signal ou procédure | Fichiers concernés |
|---|---|
| Healthcheck PostgreSQL | `docker-compose.yml` |
| Healthcheck backend | `apps/backend/src/modules/health/health.controller.ts`, `docker-compose.yml` |
| Healthcheck frontend | `apps/frontend/app/api/health/route.ts`, `docker-compose.yml` |
| Erreurs proxy frontend | `apps/frontend/lib/api-route.ts` |
| Validation des URL frontend | `apps/frontend/lib/api.ts` |
| Validation des variables backend | `apps/backend/src/app.module.ts` |
| Chargement des environnements backend | `apps/backend/src/app.module.ts` |
| Authentification | `apps/backend/src/modules/auth/auth.service.ts` |
| En-tête Bearer | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Autorisation par rôle | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Limitation de débit | `apps/backend/src/common/security/app-throttler.guard.ts`, constantes d'authentification |
| Erreurs métier de présence | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Erreurs de sécurité du pointage | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Erreurs Cloudinary | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Erreurs PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Journaux de démarrage | `apps/backend/src/main.ts` |
| Audit administrateur | `apps/backend/src/common/audit/audit-log.service.ts` |
| État Docker et logs | `docker-compose.yml`, `README.md` |
| Test de connexion frontend/backend | `scripts/validate-proxy.mjs` |
| Arrêt et relance locale | `scripts/dev.mjs` |
| Nettoyage Windows | `scripts/clean-windows.ps1` |
| Scripts de diagnostic | `package.json`, packages des applications |
| État et migrations Prisma | `package.json`, `apps/backend/prisma.config.ts` |
| Migration au démarrage | `docker/backend.Dockerfile` |
| Base de test | `apps/backend/test/test-database.ts` |
| Restauration PostgreSQL | `README.md` |
| Contrôles fonctionnels | `TESTING_CHECKLIST.md`, `docs/RELEASE_CHECKLIST.md` |
| Déploiement Compose | `README.md`, Dockerfiles, `docker-compose.yml` |
| Absence de déploiement cloud | `documentation/02-SAR/15-Deploiement.md` |

## 10. Observations techniques

### 10.1 Limitations

- Le healthcheck backend ne vérifie pas PostgreSQL, Prisma, Cloudinary ou Chromium.
- Le healthcheck frontend dépend du backend et n'isole pas tous les défauts du rendu frontend.
- Aucun monitoring centralisé ni système d'alerte n'est configuré.
- Aucun agrégateur ni stockage de logs n'est configuré.
- Les tests utilisent une base dédiée et ne diagnostiquent pas les données de production.
- Les états Docker ne couvrent que les services exécutés par Compose.
- Aucun environnement Render ou Neon n'est matérialisé dans le dépôt.
- Le dépôt ne définit pas de haute disponibilité ou de bascule.

### 10.2 Comportements observés

- PostgreSQL sain conditionne le démarrage du backend.
- Backend sain conditionne le démarrage du frontend.
- Les services Compose utilisent `restart: unless-stopped`.
- Le backend Docker applique les migrations avant de démarrer.
- Un échec de migration empêche donc le lancement du serveur dans ce conteneur.
- Le proxy frontend distingue une erreur de configuration par un statut 500 et une indisponibilité backend par un statut 502.
- Une réponse 401 de la session de borne entraîne la suppression du cookie correspondant dans le proxy.
- Les limites de la borne produisent des journaux contenant route, IP, user-agent et horodatage.
- Les échecs Cloudinary peuvent être retentés selon la configuration avant une erreur finale.
- Le repli PDF historique est désactivé par défaut dans la configuration validée.
- Le seed n'est pas exécuté automatiquement au démarrage du conteneur.

### 10.3 Procédures absentes

- classification officielle des incidents ;
- niveaux de sévérité ;
- matrice d'impact ;
- rôles d'incident ;
- responsable d'incident ;
- astreinte ;
- escalade ;
- canaux de communication ;
- notifications automatiques ;
- journal chronologique d'incident ;
- déclaration d'incident ;
- clôture formelle ;
- post-mortem ;
- suivi d'actions après incident ;
- rollback applicatif automatisé ;
- rollback de migration ;
- réinitialisation générale de la base ;
- redéploiement Render ;
- bascule de base Neon ;
- exercice de reprise versionné.

### 10.4 Mécanismes disponibles

- healthchecks Docker sur les trois services ;
- endpoints de santé backend et frontend ;
- consultation des journaux de conteneurs ;
- journaux applicatifs ciblés ;
- état des migrations Prisma ;
- tests backend ;
- test de connexion frontend/backend ;
- builds et validations ciblés ou complets ;
- redémarrage et reconstruction Compose ;
- migrations de développement et de déploiement ;
- restauration PostgreSQL manuelle documentée ;
- seed de démonstration ;
- création idempotente du premier administrateur ;
- deux scripts de backfill.
