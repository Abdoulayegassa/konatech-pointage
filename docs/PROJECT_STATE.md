# ⚠️ OUTDATED HISTORICAL BASELINE — 28 juillet 2026

**Status:** HISTORICAL / OUTDATED

**IMPORTANT:** This document is from 2026-07-28, **before the SaaS multi-tenant architecture was implemented** (2026-08-28).

**This audit contradicts the current codebase.** For example:
- This audit claims "aucun modèle, tenant ou séparation organisationnelle" (no organizational model or tenant separation)
- Current schema includes: Organization, User, Membership, OrganizationSubscription, PlatformAdmin models
- All shared resources (Employee, Schedule, Attendance) now have organizationId tenant scoping

**Do NOT use this document for current guidance.** It is preserved for historical reference only.

**For current implementation status, refer to:**
- **CURRENT_STATUS.md** — Updated implementation status (current)
- **PROJECT_PLAN.md** — Current SaaS architecture and roadmap

---

# État vérifié du projet (28 juillet 2026) Le dépôt ouvert est bien **Konatech Pointage**
(`konatech-attendance`) et contient une application de pointage structurée en
monorepo pnpm avec un backend NestJS/Prisma/PostgreSQL et un frontend Next.js.

**Verdict : ACCEPTED_WITH_RESERVATIONS.** Le code se compile, passe le
type-checking et le lint. Le câblage local frontend/backend a répondu
correctement. La baseline n'est toutefois pas entièrement validée : le contrôle
de format échoue sur 26 fichiers, 78 tests backend dépendant de PostgreSQL n'ont
pas pu s'exécuter, aucun workflow CI n'est présent et aucune preuve de
fonctionnement en production n'a été recherchée ni obtenue.

Les statuts de capacité employés sont exclusivement `CONFIRMED`,
`CODE_PRESENT`, `PARTIAL`, `DOCUMENTED_ONLY`, `PLANNED`, `NOT_FOUND` et
`TO_VALIDATE`. `CONFIRMED` ne signifie pas « prêt pour la production ».

## 2. Baseline auditée

| Élément | Valeur constatée |
| --- | --- |
| Date | 2026-07-28 UTC |
| Chemin absolu | `/home/abdoulaye/projects/konatech-pointage` |
| Système | Ubuntu 26.04 LTS sous WSL2, noyau `6.18.33.2-microsoft-standard-WSL2`, x86_64 |
| Branche | `release/v1.0.0-rc1` |
| HEAD | `c2576caacde9decfec2c0c836fd7e87ebf648214` |
| État Git au début | arbre propre ; branche en avance de 1 commit sur `origin/release/v1.0.0-rc1` |
| Remote | `origin` → `git@github.com:Abdoulayegassa/konatech-pointage.git` |
| Git | 2.53.0 |
| Node.js | 22.23.1 |
| pnpm | 10.26.0 |
| Docker | 29.1.3 |
| Docker Compose | v2.40.3-desktop.1 |

Les seuls changements produits par l'audit sont ce document et
`docs/governance/repository-baseline-audit.md`.

## 3. Stack réelle

- Workspace pnpm 10, TypeScript strict, ESLint 10 et Prettier 3.
- Backend : NestJS 11.1.19, Prisma/Prisma Client 6.19.3, PostgreSQL 16 dans
  Compose, validation DTO `class-validator`, validation d'environnement Joi,
  JWT maison, Helmet, CORS et throttling.
- Frontend : Next.js 15.5.18 App Router, React 19.2.5, TypeScript, Tailwind CSS
  3.4 et composants UI locaux inspirés de shadcn/ui.
- Exploitation : Dockerfiles Node 22, Compose pour PostgreSQL et profil `app`,
  rendu PDF Puppeteer/Chromium.
- Versions déclarées par plages dans les manifests ; versions ci-dessus
  résolues depuis les dépendances installées.

## 4. Structure du dépôt

```text
apps/backend/     API NestJS, Prisma, migrations, scripts et tests E2E
apps/frontend/    UI Next.js, routes proxy API et composants
docker/           Dockerfiles backend/frontend
docs/             architecture, registre des modules, release et référence PDF
scripts/          développement, validation proxy et nettoyage Windows
```

Le workspace ne déclare que `apps/*`. Aucun package partagé autonome n'est
présent. Vingt migrations Prisma sont versionnées. Le dépôt contient un
lockfile unique `pnpm-lock.yaml`.

## 5. Modules

| Module | État constaté |
| --- | --- |
| Authentification | Module NestJS, JWT, login mot de passe et session PIN |
| Employés | CRUD, statut, rôle métier, département et planning |
| Pointage | Entrée/sortie admin et self-service, historique, sécurité conditionnelle |
| Dashboard | Agrégats d'assiduité et de vérification |
| Plannings | CRUD et activation |
| Calendrier RH | Jours fériés, congés et missions dans le modèle |
| Sanctions | Règles et calculs mensuels |
| Rapports | Exports mensuels CSV et PDF |
| Santé | Endpoint public backend et proxy frontend |
| Audit | Journal JSON dans les logs applicatifs pour plusieurs actions admin |

## 6. Capacités et statut

| Capacité | Statut | Preuve/limite principale |
| --- | --- | --- |
| Authentification | `CODE_PRESENT` | login JWT et guards présents ; tests DB bloqués |
| Utilisateurs | `CODE_PRESENT` | utilisateurs portés par `Employee`, sans module `User` séparé |
| Rôles et permissions | `CODE_PRESENT` | `ADMIN`/`EMPLOYEE`, guards backend et redirections frontend |
| Entreprises/organisations | `NOT_FOUND` | aucun modèle, tenant ou séparation organisationnelle |
| Employés | `CODE_PRESENT` | CRUD/API/UI présents ; comportement DB non vérifié |
| Pointage entrée/sortie | `CODE_PRESENT` | services, API et UI présents ; tests d'intégration DB bloqués |
| QR code | `PARTIAL` | génération/lien et redirection vérifiés ; scan mobile non vérifié |
| PIN | `CODE_PRESENT` | PIN à 4 chiffres, hash et migration legacy ; tests DB bloqués |
| Historique | `CODE_PRESENT` | API et vues admin/employé présentes |
| Retards | `CODE_PRESENT` | calculs, statuts et rapports présents ; validation DB bloquée |
| Absences | `CODE_PRESENT` | génération/calculs présents ; tests calendrier DB bloqués |
| Rapports mensuels | `PARTIAL` | rendu PDF ciblé testé et builds OK ; exports avec DB non vérifiés |
| Administration | `CODE_PRESENT` | dashboard et écrans de gestion protégés par rôle |
| GPS | `PARTIAL` | politique conditionnelle et tests sans DB présents ; flux navigateur réel non vérifié |
| Selfie/photo | `PARTIAL` | stockage/métadonnées et UI existent ; documentation contradictoire sur le caractère legacy |
| Commentaires | `CODE_PRESENT` | champ `notes` et justification hors zone dans le flux de sécurité |
| Jours fériés | `CODE_PRESENT` | modèle/API/UI présents ; test d'intégration bloqué par PostgreSQL |
| Sanctions | `PARTIAL` | moteur et tests ciblés passent ; endpoints avec DB non vérifiés |
| PWA | `NOT_FOUND` | aucun manifeste web, service worker ou mécanisme d'installation trouvé |
| SaaS/multitenancy | `NOT_FOUND` | aucune isolation tenant constatée |

## 7. Aperçu du modèle de données

Cinq modèles Prisma : `Employee`, `Schedule`, `Attendance`, `CalendarEntry` et
`SanctionRule`. Les relations couvrent l'affectation d'un planning, les
pointages d'un employé et les entrées calendaires éventuellement individuelles.
`Attendance` conserve des snapshots de planning et des preuves distinctes à
l'entrée et à la sortie (coordonnées, précision, distance, méthode, niveau,
raison, URL/photo). La contrainte unique `[employeeId, date]` impose un
enregistrement quotidien par employé.

Il n'existe ni modèle d'organisation, ni tenant, ni session persistée, ni table
d'audit. Les sanctions sont calculées depuis des règles persistées, sans modèle
de sanction appliquée distinct.

## 8. Rôles et permissions constatés

`AccessRole` contient uniquement `ADMIN` et `EMPLOYEE`. Un guard JWT est global
au module d'authentification et `RolesGuard` vérifie les décorateurs `@Roles`.
Les ressources dashboard, employés, plannings, calendrier, sanctions,
historique global, exports et pointages administratifs sont réservées à
`ADMIN`. Le self-service de pointage et l'historique personnel sont réservés à
`EMPLOYEE`. Santé, login et redirection publique de pointage sont publics.

Le champ texte `Employee.role` est un intitulé métier distinct de
`Employee.accessRole`; il ne porte pas d'autorisation technique.

## 9. État des API

Le backend expose **38 opérations déclarées** sous `/api/v1` dans huit
contrôleurs : auth, health, dashboard, employees, schedules, attendance,
calendar et sanctions. Le frontend expose 18 routes App Router servant
principalement de proxy/session.

`CONFIRMED` : endpoint santé backend, proxy santé frontend, cohérence
`FRONTEND_URL`/`NEXT_PUBLIC_APP_URL` et redirection publique vers
`/attendance-entry`, observés par le script de proxy avant son blocage de
nettoyage.

Le reste est `CODE_PRESENT` ou `PARTIAL` : aucune API de production n'a été
contactée et les scénarios E2E dépendant de PostgreSQL n'ont pas pu être joués.
Aucun contrat OpenAPI/Swagger versionné n'a été trouvé.

## 10. État des tests

- 7 suites backend, 107 tests détectés.
- Exécution : 3 suites et 29 tests passent ; 4 suites et 78 tests échouent en
  préparation, PostgreSQL étant inaccessible sur `localhost:5433`. Ces 78
  résultats ne prouvent pas un défaut fonctionnel.
- Aucun test frontend unitaire/composant/E2E trouvé.
- `typecheck`, `lint`, build frontend et build backend réussissent.
- `format:check` échoue sur 26 fichiers.
- Le test proxy valide les assertions de connexion, mais ne termine pas son
  nettoyage ; il a été interrompu et retourne 130.

## 11. État du déploiement

Dockerfiles et Compose sont présents, avec healthchecks et exécution de
`prisma migrate deploy` au démarrage du backend. Des instructions manuelles de
déploiement, sauvegarde et restauration existent. Aucun workflow GitHub Actions
ni manifeste d'une plateforme de déploiement n'est présent. Aucun build Docker,
déploiement, migration réelle, sauvegarde/restauration ou contrôle de production
n'a été exécuté pendant l'audit.

État : `TO_VALIDATE` pour l'exploitabilité de bout en bout.

## 12. Dette technique principale

- `TECH_DEBT` `MAJOR` — baseline de format non conforme sur 26 fichiers.
- `TECH_DEBT` `MAJOR` — script proxy bloqué lors de l'arrêt de ses processus.
- `TECH_DEBT` `MAJOR` — champ PIN legacy en clair toujours présent dans le
  schéma, même si le code prévoit sa migration vers un hash.
- `TECH_DEBT` `MAJOR` — audit admin uniquement écrit dans les logs, sans
  stockage métier durable ni preuve de rétention.
- `QUALITY_RISK` `MAJOR` — absence de tests frontend et couverture backend
  effectivement incomplète dans cet environnement.
- `TECH_DEBT` `MINOR` — documentation de statut dispersée et partiellement
  contradictoire.

## 13. Risques principaux

- `SECURITY_RISK` `CRITICAL` — le profil « KAES SaaS Critical » envisagé n'est
  pas démontré : aucune frontière d'organisation/tenant n'existe.
- `QUALITY_RISK` `CRITICAL` — 78 scénarios métier critiques restent
  `TO_VALIDATE` faute de base de test disponible.
- `OPERATIONS_RISK` `MAJOR` — aucune CI/CD versionnée et aucune preuve de
  restauration, déploiement ou supervision.
- `SECURITY_RISK` `MAJOR` — coexistence temporaire possible d'un PIN en clair
  et d'un PIN hashé.
- `OPERATIONS_RISK` `MAJOR` — migrations couplées au démarrage applicatif ;
  comportement concurrent et stratégie de retour arrière non vérifiés.
- `QUALITY_RISK` `MAJOR` — incohérence entre architecture « GPS et selfie » et
  documentation récente décrivant un flux actif GPS-only.

## 14. Problèmes connus

- `pnpm validate` s'arrête sur Prettier avant les autres étapes.
- PostgreSQL de test n'écoute pas sur `localhost:5433`.
- `pnpm test:proxy` confirme ses assertions mais reste actif au nettoyage.
- Les tests/builds créent des artefacts ignorés ; aucun fichier applicatif
  versionné n'a été modifié.
- Le build Next indique que le lint interne est ignoré ; le lint racine séparé
  passe.

## 15. Décisions en attente

- `HUMAN_DECISION_REQUIRED` — confirmer si le produit doit réellement relever
  d'un profil SaaS multi-organisation ; le dépôt actuel est mono-organisation.
- `HUMAN_DECISION_REQUIRED` — désigner la politique de sécurité active :
  GPS-only ou GPS avec chemin photo/selfie, et le statut exact des données
  historiques.
- `HUMAN_DECISION_REQUIRED` — fixer les exigences de preuve et de rétention
  pour l'audit administratif.
- `TO_VALIDATE` — confirmer les paramètres réels de géorepérage, le rendu PDF
  métier, le scan QR mobile, les sauvegardes/restaurations et le déploiement.

## 16. Prochaine étape de gouvernance recommandée

Faire examiner cette baseline par les responsables Produit, Architecture, QA et
DevOps, puis consigner leurs validations et décisions. Seulement après cette
revue, décider si le dépôt peut entrer dans un cadrage KAES SaaS Critical. Les
candidats d'action du rapport détaillé ne sont pas des tâches `READY`.
