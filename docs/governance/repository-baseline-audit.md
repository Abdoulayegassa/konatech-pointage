# ⚠️ OUTDATED HISTORICAL BASELINE — 28 juillet 2026

**Status:** HISTORICAL / OUTDATED

**IMPORTANT:** This is the same baseline audit as PROJECT_STATE.md, from 2026-07-28, **before SaaS implementation** (2026-08-28).

**The findings in this audit do not reflect the current codebase.** It is preserved for governance history only.

**Do NOT use this for current status or guidance. Refer to CURRENT_STATUS.md instead.**

---

# Audit de baseline du dépôt — Konatech Pointage (28 juillet 2026)
`/home/abdoulaye/projects/konatech-pointage`. Objectif : établir une
photographie vérifiable du dépôt avant toute décision Produit, PWA, SaaS ou
architecturale.

L'audit est non destructif : aucun secret n'a été reproduit, aucune variable
d'environnement n'a été changée, aucun fichier applicatif ou lockfile n'a été
modifié, aucune dépendance installée, aucune migration créée/appliquée, aucun
commit ou changement de branche effectué et aucun environnement de production
contacté.

**Verdict : `ACCEPTED_WITH_RESERVATIONS`.** L'identité du dépôt est confirmée,
mais la preuve fonctionnelle est incomplète. Ce verdict n'est ni une
certification KAES, ni une approbation de production.

## 2. Preuves examinées

### Dépôt et environnement

- `AGENTS.md` lu en premier.
- Git : branche, HEAD, état, remote et huit derniers commits locaux.
- Ubuntu/WSL2 et versions Git, Node.js, pnpm, Docker, Docker Compose.
- `package.json` racine et manifests des deux applications.
- `pnpm-lock.yaml`, `pnpm-workspace.yaml`, configurations TypeScript, ESLint,
  Next.js et NestJS.

### Code et données

- `apps/backend/prisma/schema.prisma`, 20 répertoires de migration et seed.
- Bootstrap backend, validation d'environnement, modules, contrôleurs, services,
  guards, DTOs, utilitaires de sécurité et journal d'audit.
- Pages App Router, middleware, composants, helpers de session, appels API et
  routes proxy frontend.
- 7 fichiers de tests backend et outils de base de test.
- Dockerfiles, Compose et scripts de workspace.

### Documentation et opérations

- `README.md`, `CURRENT_STATUS.md`, `PROJECT_PLAN.md`, `PROJECT_SPEC.md`,
  `TESTING_CHECKLIST.md`, `CHANGELOG_DEV.md`.
- `docs/ARCHITECTURE.md`, `docs/MODULE_REGISTRY.md`,
  `docs/RELEASE_CHECKLIST.md` et `docs/hr-report-reference.pdf` (présence et
  rôle documentaire ; contenu visuel PDF non audité).
- `.env.production.example`, `apps/backend/.env.example` et
  `apps/frontend/.env.example`; seules les clés et explications ont été
  examinées, aucune valeur locale secrète n'est reportée.
- Recherche de workflows GitHub Actions : aucun trouvé.

### Absences explicitement constatées

- Pas de package partagé, modèle `User`, modèle d'organisation/tenant, contrat
  OpenAPI, tests frontend, manifeste PWA/service worker, workflow CI/CD, table
  d'audit persistante ou manifeste d'infrastructure cloud.
- Pas de `.env.example` à la racine ; les exemples attendus sont répartis entre
  `.env.production.example` et les applications.
- Les deux documents créés par cet audit n'existaient pas au début.

## 3. Commandes exécutées

Toutes les commandes ont été lancées depuis
`/home/abdoulaye/projects/konatech-pointage`, sauf mention contraire.

| Commande exacte | Résultat | Code |
| --- | --- | ---: |
| `pwd` | chemin absolu confirmé | 0 |
| `sed -n '1,240p' AGENTS.md` | consignes lues | 0 |
| `git status --short --branch` | propre, branche ahead 1 au début | 0 |
| `git branch --show-current` | `release/v1.0.0-rc1` | 0 |
| `git rev-parse HEAD` | `c2576caacde9decfec2c0c836fd7e87ebf648214` | 0 |
| `git remote -v` | remote `origin` GitHub cohérent avec le projet | 0 |
| `uname -a` | noyau WSL2 x86_64 relevé | 0 |
| `cat /etc/os-release` | Ubuntu 26.04 LTS | 0 |
| `git --version` | 2.53.0 | 0 |
| `node --version` | v22.23.1 | 0 |
| `pnpm --version` | 10.26.0 | 0 |
| `docker --version` | 29.1.3 | 0 |
| `docker compose version` | v2.40.3-desktop.1 | 0 |
| `rg --files -g '!node_modules' -g '!.next' -g '!dist'` | inventaire versionné/visible | 0 |
| `find . -maxdepth 3 -type d ...` | cartographie des répertoires | 0 |
| `git log -8 --date=iso-strict ...` | historique récent inspecté | 0 |
| `pnpm validate` | arrêt sur `format:check`, 26 fichiers non conformes | 1 |
| `pnpm prisma:generate` | client Prisma 6.19.3 généré dans `node_modules` | 0 |
| `pnpm typecheck` | backend puis frontend réussis | 0 |
| `pnpm lint` | ESLint réussi | 0 |
| `pnpm test:backend` | 3/7 suites, 29/107 tests passent ; 78 tests bloqués car PostgreSQL inaccessible sur `localhost:5433` | 1 |
| `pnpm build:frontend` | build Next.js réussi, 13 pages statiques traitées, routes dynamiques listées | 0 |
| `pnpm build:backend` | build NestJS réussi | 0 |
| `pnpm test:proxy` | première tentative : ouverture loopback refusée par la sandbox | 1 |
| `pnpm test:proxy` | hors sandbox : URL publique, santé proxy et redirection validées ; blocage au nettoyage, interruption manuelle | 130 |

Les commandes d'inventaire complémentaires (`sed`, `rg`, `find`, `ls`,
`git ls-files`, `git status`, lecture de versions avec `node`) ont toutes
retourné 0. Aucun script avec suffixe `:fix`, migration, seed, serveur durable,
Compose `up`, déploiement ou écriture métier n'a été lancé.

### Scripts réellement disponibles

Racine :

- `dev`, `build`, `build:backend`, `build:frontend`;
- `typecheck`, `typecheck:backend`, `typecheck:frontend`;
- `lint`, `lint:fix`, `format`, `format:check`;
- `check`, `validate`, `validate:backend`, `validate:frontend`;
- `test`, `test:backend`, `test:proxy`;
- `db:up`, `db:down`, `db:status`;
- `prisma:generate`, `prisma:status`, `prisma:migrate`,
  `prisma:migrate:deploy`, `prisma:seed`;
- `dev:backend`, `dev:frontend`;
- `clean:windows`, `clean:windows:dev`, `clean:windows:prisma`.

Backend : `dev`, `build`, `start`, `typecheck`, `test`, `admin:create`,
`pins:backfill`, `snapshots:backfill`, `prisma:generate`, `prisma:migrate`,
`prisma:migrate:deploy`, `prisma:seed`.

Frontend : `dev`, `build`, `start`, `typecheck`.

## 4. Cartographie du dépôt

```text
/
├── apps/
│   ├── backend/
│   │   ├── prisma/       schéma, seed, 20 migrations
│   │   ├── scripts/      admin initial et deux backfills
│   │   ├── src/
│   │   │   ├── common/   Prisma, temps, sécurité, validation, audit
│   │   │   └── modules/  attendance, auth, calendar, dashboard,
│   │   │                employees, health, sanctions, schedules
│   │   └── test/         7 suites E2E/intégration
│   └── frontend/
│       ├── app/          pages et routes proxy App Router
│       ├── components/   admin, pointage, historique, calendrier,
│       │                dashboard, employés, sanctions, plannings, UI
│       ├── lib/          API, session, auth, erreurs, redirections
│       └── public/       icônes et logo
├── docker/               Dockerfiles
├── docs/                 architecture, modules, release, référence RH
├── scripts/              dev, proxy, nettoyage Windows
├── docker-compose.yml
├── package.json
├── pnpm-lock.yaml
└── pnpm-workspace.yaml
```

Architecture logique :

1. Next.js rend les espaces admin/employé et relaie certaines requêtes via ses
   route handlers.
2. NestJS expose `/api/v1`, applique validation globale, CORS, Helmet,
   throttling, JWT et rôles.
3. Les services métier accèdent à PostgreSQL via un `PrismaService` global.
4. Le pointage utilise les plannings et le calendrier, conserve des snapshots et
   alimente dashboard, sanctions et exports.

## 5. Constats détaillés

### 5.1 Stack et configuration

- `CONFIRMED` — les versions installées se compilent avec Node 22, compatible
  avec l'intervalle racine `>=20.9.0 <23`.
- `CONFIRMED` — TypeScript strict, lint et builds backend/frontend passent.
- `CODE_PRESENT` — validation Joi exige URL frontend, secret JWT et URL DB ;
  elle renforce HTTPS/origines en production et la cohérence GPS/Cloudinary.
- `CODE_PRESENT` — `ValidationPipe` global utilise whitelist,
  `forbidNonWhitelisted` et transformation.
- `QUALITY_RISK` `MAJOR` — le gate complet échoue dès Prettier.

### 5.2 Modules et responsabilités

La séparation NestJS est modulaire. La logique de pointage est dans les
services, les DTOs sont nombreux et Prisma est encapsulé. Les domaines couverts
sont auth, employés, plannings, pointage, calendrier, dashboard, sanctions,
rapports et santé.

`AuditLogService` journalise plusieurs mutations admin (employés, plannings,
calendrier, pointages et exports), mais seulement via le logger.

### 5.3 Capacités

| Capacité | Classification | Justification |
| --- | --- | --- |
| Authentification | `CODE_PRESENT` | mot de passe, JWT, PIN court et guards ; DB non vérifiée |
| Utilisateurs | `CODE_PRESENT` | `Employee` joue aussi le rôle de compte |
| Rôles/permissions | `CODE_PRESENT` | `ADMIN` et `EMPLOYEE`, RBAC backend |
| Organisations | `NOT_FOUND` | aucun tenant ni clé organisation |
| Employés | `CODE_PRESENT` | CRUD/API/UI et affectations |
| Check-in/check-out | `CODE_PRESENT` | actions admin et self-service |
| QR | `PARTIAL` | QR/lien et redirection présents ; scan réel absent de l'audit |
| PIN | `CODE_PRESENT` | validation 4 chiffres, throttling, hash et migration legacy |
| Historique | `CODE_PRESENT` | admin et personnel |
| Retards/absences | `CODE_PRESENT` | règles, statuts et rapports ; intégration DB non jouée |
| Rapports | `PARTIAL` | CSV/PDF présents, renderer ciblé testé, DB et rendu métier à valider |
| Administration | `CODE_PRESENT` | dashboard et gestion |
| GPS | `PARTIAL` | activable par configuration, évaluation backend, UI ; réel non testé |
| Selfie/photo | `PARTIAL` | code et colonnes présents, statut actif/legacy contradictoire |
| Commentaires | `CODE_PRESENT` | `notes`, justification hors zone |
| Jours fériés | `CODE_PRESENT` | calendrier et types RH présents |
| Sanctions | `PARTIAL` | moteur testé, persistance/API non vérifiées |
| PWA | `NOT_FOUND` | aucun artefact PWA |
| SaaS | `NOT_FOUND` | modèle mono-organisation |

### 5.4 Modèle de données

`Employee` contient identité, authentification, rôle d'accès, rôle métier,
département, activité et planning. `Schedule` contient horaires, marge de retard
et jours travaillés JSON. `Attendance` couvre l'intégralité du cycle quotidien,
les résultats entrée/sortie, heures supplémentaires, retards, absences,
snapshots de planning et preuves de vérification. `CalendarEntry` représente
jours fériés, congés et missions. `SanctionRule` stocke seuils, tolérances,
montants et priorité.

Points de vigilance :

- `SECURITY_RISK` `MAJOR` — `Employee.pinCode` permet encore une valeur en clair
  pour compatibilité, à côté de `pinCodeHash`.
- `QUALITY_RISK` `MAJOR` — `Employee.role` libre et `accessRole` enum peuvent
  être confondus par les opérateurs ou la documentation.
- `TO_VALIDATE` — unicité journalière et fuseau métier ; le code possède une
  abstraction de date/horloge mais aucun test DB n'a été exécuté ici.
- `SECURITY_RISK` `CRITICAL` pour un profil SaaS — aucun `organizationId`,
  tenant ou contrainte d'isolation.

### 5.5 Rôles et permissions

Le RBAC backend est explicite. Les endpoints publics sont limités à santé,
login, login PIN et redirection de pointage. Les endpoints de gestion portent
`ADMIN`; les routes personnelles portent `EMPLOYEE`.

Limites :

- `TO_VALIDATE` — tests d'autorisation basés sur DB non exécutés.
- `SECURITY_RISK` `MAJOR` — pas de permissions granulaires ni de séparation
  d'organisation ; acceptable ou non selon décision produit.
- Le middleware frontend ne protège explicitement qu'un sous-ensemble des pages
  (`/`, `my-attendance`, `employees`, `schedules`). Les autres pages font des
  contrôles serveur, mais cette dualité augmente la surface de cohérence à
  maintenir.

### 5.6 API

Huit contrôleurs backend déclarent 38 opérations. Les principales familles
sont :

- `auth`: login, login PIN, utilisateur courant ;
- `health`: santé ;
- `dashboard`: aperçu admin ;
- `employees`: liste, détail, création, mise à jour, statut, rôle, département,
  planning ;
- `schedules`: liste, détail, création, mise à jour, statut ;
- `attendance`: redirection publique, synthèse, historique, export, état et
  historique personnels, politique sécurité, entrées/sorties ;
- `calendar`: mois et CRUD jours fériés ;
- `sanctions`: règles, édition, vue mensuelle et détail par pointage.

`CONFIRMED` uniquement pour le chemin santé/redirection testé localement.
`CODE_PRESENT` ou `PARTIAL` pour les autres. Aucun Swagger/OpenAPI n'est trouvé.

### 5.7 Tests et qualité

Le dépôt contient 107 tests dans 7 suites. Résultat observé :

- `PASS`: `sanctions.e2e-spec.ts`,
  `monthly-attendance-puppeteer-renderer.e2e-spec.ts`,
  `environment-validation.e2e-spec.ts`;
- `FAIL` en préparation DB : `app.e2e-spec.ts`, `calendar.e2e-spec.ts`,
  `attendance-calendar-absence.e2e-spec.ts`,
  `non-working-day-attendance.e2e-spec.ts`;
- total 29 passés, 78 bloqués, aucun snapshot.

Le message commun est l'impossibilité d'atteindre PostgreSQL sur
`localhost:5433`. L'audit n'a pas lancé `docker compose up`, car cela aurait
modifié l'état d'un service local et n'était pas nécessaire pour constater la
baseline. Aucun test frontend n'est présent.

`pnpm test:proxy` a démontré le câblage et la redirection, mais sa fonction
`finally` n'a pas terminé après plus d'une minute ; interruption avec code 130.

### 5.8 CI/CD

- `NOT_FOUND` — `.github/workflows/*.yml` et `*.yaml`.
- `DOCUMENTED_ONLY` — ordre de validation CI et checklist de release dans le
  README et la documentation.
- `OPERATIONS_RISK` `MAJOR` — aucune exécution automatique versionnée ne garantit
  lint, typecheck, tests, builds ou scan de dépendances.

### 5.9 Déploiement et exploitation

`CODE_PRESENT` : Compose, PostgreSQL 16, healthchecks, Dockerfiles Node 22,
Chromium backend et démarrage Next/Nest. Le backend lance
`prisma migrate deploy` avant l'application.

`DOCUMENTED_ONLY` : procédures de production, sauvegarde/restauration et
checklist release. L'historique mentionne Render, mais aucun manifeste Render
n'est présent dans la baseline.

Risques :

- `OPERATIONS_RISK` `MAJOR` — migrations au démarrage sans preuve de
  sérialisation multi-réplique ou rollback.
- `OPERATIONS_RISK` `MAJOR` — images copient le workspace et les dépendances de
  build ; taille, utilisateur non-root et surface finale non validés.
- `TO_VALIDATE` — builds Docker, healthchecks Compose, persistance volume,
  restauration, Chromium/PDF cible, supervision et secrets.

### 5.10 Documentation

La documentation est abondante et décrit stack, commandes, modules, sécurité,
tests, release et exploitation. Elle ne constitue pas une preuve d'exécution.
`CURRENT_STATUS.md` distingue partiellement « Implemented » et « Validated »,
mais certaines formulations restent plus fortes que les résultats de cet audit.

## 6. Incohérences entre code et documentation

1. `docs/ARCHITECTURE.md` décrit « GPS and Selfie Security » et une évaluation
   GPS/selfie, alors que `README.md`, `PROJECT_PLAN.md` et `.env.example`
   présentent le flux normal comme GPS-only et la photo comme legacy. Le code
   conserve capture/upload et fallback photo selon contexte.
2. `PROJECT_SPEC.md` décrit un comportement « hors rayon → photo requise » et
   « GPS indisponible → photo fallback », tandis que la documentation récente
   dit que le pointage est bloqué sans GPS et qu'aucune photo n'est demandée
   dans le flux normal.
3. `CURRENT_STATUS.md` indique que la connexion frontend/backend est « couverte »
   par `pnpm test:proxy`; elle est bien validée, mais le script ne termine pas
   correctement dans l'environnement audité.
4. Le README présente un gate CI/préproduction, mais aucun workflow CI n'est
   versionné.
5. Les documents de release et de statut évoquent une préparation production ;
   aucun déploiement ou environnement de production n'a été vérifié.
6. Le projet envisagé sous profil SaaS Critical ne possède aucune capacité
   organisation/tenant dans le code ou le modèle.

## 7. Dette technique

| Sévérité | Marqueur | Constat |
| --- | --- | --- |
| `CRITICAL` | `TECH_DEBT` | aucune isolation tenant si l'objectif SaaS Critical est confirmé |
| `MAJOR` | `TECH_DEBT` | 26 fichiers hors format attendu |
| `MAJOR` | `TECH_DEBT` | nettoyage du test proxy bloquant |
| `MAJOR` | `TECH_DEBT` | coexistence du PIN legacy en clair |
| `MAJOR` | `TECH_DEBT` | journal admin non persisté dans le domaine |
| `MAJOR` | `QUALITY_RISK` | aucun test frontend |
| `MAJOR` | `QUALITY_RISK` | 78 tests critiques non joués dans la baseline |
| `MINOR` | `TECH_DEBT` | documentation redondante et vocabulaire GPS/photo divergent |
| `INFO` | `TO_VALIDATE` | absence de package partagé, non problématique à elle seule |

## 8. Risques

| Sévérité | Marqueur | Risque et impact |
| --- | --- | --- |
| `CRITICAL` | `SECURITY_RISK` | fuite inter-organisation possible si le code mono-tenant est exposé comme SaaS |
| `CRITICAL` | `QUALITY_RISK` | régression auth/pointage/calendrier/absence/export non exclue par l'exécution actuelle |
| `MAJOR` | `SECURITY_RISK` | PIN legacy potentiellement stocké en clair avant backfill/login |
| `MAJOR` | `SECURITY_RISK` | politique photo/GPS ambiguë, avec implications de données personnelles |
| `MAJOR` | `OPERATIONS_RISK` | absence de CI/CD et de preuve de gate reproductible |
| `MAJOR` | `OPERATIONS_RISK` | restauration, migration concurrente, rollback et observabilité non validés |
| `MAJOR` | `QUALITY_RISK` | gate `validate` rouge sur format |
| `MAJOR` | `QUALITY_RISK` | flux QR mobile, géolocalisation réelle et rendu PDF métier non vérifiés |
| `MINOR` | `OPERATIONS_RISK` | script proxy nécessitant une interruption après succès des assertions |

L'absence d'une fonctionnalité non exigée par la documentation n'est pas
qualifiée automatiquement de défaut. La non-présence PWA est un constat, pas une
non-conformité de la baseline actuelle.

## 9. Limites de l'audit

- Aucun accès réseau de production, base de production, secret, métrique,
  journal réel ou configuration de plateforme n'a été examiné.
- PostgreSQL local de test était indisponible ; 78 tests restent
  `TO_VALIDATE`.
- Aucun build Docker ni démarrage Compose n'a été réalisé.
- Aucun test manuel navigateur/mobile, scan QR, permission GPS, capture photo ou
  téléchargement de rapport n'a été réalisé.
- La référence PDF a été recensée, sans comparaison visuelle du rendu.
- La couverture de tests n'a pas été mesurée ; seuls fichiers, cas déclarés et
  résultats d'exécution sont reportés.
- L'historique local récent a été lu ; aucune comparaison avec l'état distant
  n'a été effectuée.
- Le profil KAES SaaS Critical n'est pas défini dans le dépôt ; l'audit ne
  prétend donc pas mesurer une conformité KAES exhaustive.

## 10. Informations à transmettre aux chats spécialisés

### Produit

- Le produit actuel est mono-organisation.
- QR + PIN est le parcours par défaut visible ; GPS est conditionnel.
- La politique active photo/selfie versus legacy doit être décidée et alignée.
- Le format PDF mensuel, les règles de sanctions et les cas calendrier doivent
  être acceptés par les responsables métier.
- PWA et SaaS ne sont pas présents et ne doivent pas être présentés comme acquis.

### Architecture

- Cinq modèles Prisma, deux rôles techniques, 38 opérations backend.
- Absence de tenant, permissions granulaires et audit persistant.
- Migrations couplées au démarrage du conteneur.
- Double couche de contrôle frontend/backend et documentation GPS/photo
  incohérente à rationaliser après décision humaine.

### QA

- Gate format rouge ; statique/build vert.
- 29/107 tests passent, 78 bloqués par PostgreSQL.
- Aucun test frontend.
- Proxy fonctionnel sur ses assertions, cleanup bloqué.
- Priorité de validation : auth/RBAC, QR+PIN, entrée/sortie, calendrier/absences,
  GPS conditionnel, exports et sanctions.

### DevOps

- Ubuntu WSL2, Node 22, pnpm 10, Docker 29, Compose 2.40 relevés.
- Aucun workflow CI/CD.
- Dockerfiles/Compose présents mais non exécutés.
- Base test attendue sur `localhost:5433`.
- Examiner migration au startup, non-root, taille d'image, secrets, sauvegarde,
  restauration, Chromium, logs et supervision.

## 11. Candidats d'action à analyser ultérieurement

Ces éléments sont des **candidats**, pas des tâches KAES officielles et jamais
des tâches `READY` dans le cadre de cet audit.

1. Analyser la décision mono-organisation versus SaaS multi-tenant et ses
   exigences d'isolation.
2. Rejouer la suite complète avec une PostgreSQL de test explicitement autorisée
   et consigner les résultats.
3. Analyser le blocage de nettoyage de `test:proxy`.
4. Examiner la stratégie de retrait vérifiable du PIN legacy en clair.
5. Statuer sur GPS-only versus selfie/photo, puis réconcilier code,
   documentation et traitement des données personnelles.
6. Évaluer un audit admin persistant, sa rétention et son accès.
7. Évaluer une CI reproductible couvrant format, lint, types, Prisma, tests,
   builds et proxy.
8. Définir puis exécuter un protocole QA frontend/mobile pour QR, PIN, GPS et
   rapports.
9. Évaluer les procédures de migration, rollback, sauvegarde/restauration et
   supervision.
10. Comparer le PDF généré à la référence RH avec validation humaine.

La prochaine étape de gouvernance recommandée est une revue croisée de cette
baseline par Produit, Architecture, QA et DevOps, suivie de décisions explicites
sur les points `HUMAN_DECISION_REQUIRED`. La création éventuelle d'actions KAES
vient seulement après cette revue.
