# Présentation

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-INTRO-001 |
| Titre | Présentation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

> **Contrat courant :** ce guide est un inventaire daté des parcours administratifs observés, pas la source de vérité produit. Les rôles actuels sont SUPER ADMIN SAAS, ADMIN ENTREPRISE et EMPLOYEE. Le dashboard d'organisation est agrégé; chaque site dispose d'un contexte opérationnel séparé. Consulter `PROJECT_PLAN.md` pour le contrat courant et `CURRENT_STATUS.md` pour les écarts d'implémentation.

## 1. Présentation

### 1.1 Objectif du guide

Ce document présente Konatech Pointage du point de vue de son administration.
Il décrit les fonctions accessibles dans l'application, le parcours de
l'administrateur, les rôles d'accès et la navigation réellement implémentée.

Cette présentation constitue le premier document du User Administration Guide
(UAG). Son contenu repose exclusivement sur les pages, composants, routes API,
contrôleurs et modèles présents dans le dépôt.

### 1.2 Public concerné

Le guide s'adresse :

- aux administrateurs de Konatech Pointage ;
- aux responsables RH qui consultent et gèrent les données de présence ;
- aux personnes chargées de gérer les comptes employés et les plannings ;
- aux personnes chargées de produire les exports mensuels disponibles dans
  l'interface.

Le rôle `EMPLOYEE` dispose d'un espace fonctionnel distinct, mais il n'est pas
le public principal de ce guide d'administration.

### 1.3 Rôle de l'administrateur

Dans l'application, l'administrateur correspond au rôle d'accès `ADMIN`.
Les capacités observables de ce rôle sont :

- consulter le tableau de bord ;
- consulter l'historique RH des pointages ;
- enregistrer des entrées et sorties pour un employé par l'API ;
- générer des exports mensuels ;
- créer et modifier des comptes ;
- activer ou désactiver des comptes ;
- affecter un rôle métier, un service et un planning ;
- attribuer le rôle d'accès administrateur ou employé ;
- créer, modifier, activer ou désactiver des plannings ;
- accéder au terminal de pointage depuis le tableau de bord ;
- se déconnecter.

La navigation administrateur expose également les pages `Calendrier RH` et
`Sanctions RH`. Elles existent dans l'application, mais ne constituent pas de
nouveaux rôles.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/dashboard/dashboard.controller.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/frontend/components/admin/admin-nav.tsx`.

## 2. Présentation de Konatech Pointage

### 2.1 Finalité de l'application

Konatech Pointage est une application de suivi des présences. Les fonctions
implémentées permettent notamment :

- l'identification des administrateurs et des employés ;
- l'enregistrement de l'arrivée et de la sortie d'un employé ;
- la consultation des présences, retards, absences, sorties anticipées et
  heures supplémentaires calculées ;
- la consultation d'indicateurs quotidiens et mensuels ;
- la gestion des employés ;
- la gestion et l'affectation des plannings ;
- la production d'un rapport mensuel depuis l'interface ;
- l'utilisation d'un point d'entrée fixe de pointage avec identification par
  code employé et code PIN.

Ces fonctions sont matérialisées par les modules frontend et backend de
l'application.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/app/my-attendance/page.tsx`,
`apps/frontend/app/attendance-entry/page.tsx`,
`apps/backend/src/modules/attendance`,
`apps/backend/src/modules/dashboard`.

### 2.2 Architecture fonctionnelle

Le parcours fonctionnel repose sur les couches suivantes :

```text
+------------------------------+
| Utilisateur                  |
| Administrateur ou employé    |
+--------------+---------------+
               |
               v
+------------------------------+
| Frontend Next.js             |
| Pages et actions utilisateur |
+--------------+---------------+
               |
               v
+------------------------------+
| API NestJS                   |
| Authentification et métier   |
+--------------+---------------+
               |
               v
+------------------------------+
| Prisma                       |
| Accès et modèle de données   |
+--------------+---------------+
               |
               v
+------------------------------+
| PostgreSQL                   |
| Données applicatives         |
+------------------------------+
```

Le frontend présente les écrans et relaie les opérations vers l'API. Le
backend applique l'authentification, les rôles et les traitements métier.
Prisma relie le backend à PostgreSQL.

Références :
`apps/frontend/app`,
`apps/frontend/lib/api.ts`,
`apps/backend/src/modules`,
`apps/backend/src/common/prisma/prisma.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 2.3 Frontend

Le frontend est une application Next.js utilisant l'App Router. Les pages
fonctionnelles observées sont :

| Route | Fonction visible |
| --- | --- |
| `/login` | Connexion par adresse électronique et mot de passe |
| `/` | Redirection vers l'espace selon le rôle authentifié |
| `/dashboard` | Vue agrégée de l'organisation, tous sites confondus |
| `/site/[siteId]/dashboard` | Dashboard opérationnel du site autorisé |
| `/employees` | Gestion des employés et des comptes |
| `/schedules` | Gestion des plannings |
| `/attendance-history` | Historique RH des pointages |
| `/exports` | Export mensuel PDF |
| `/attendance-entry` | Terminal fixe de pointage par identifiant et PIN |
| `/my-attendance` | Espace personnel de pointage d'un employé |
| `/calendar` | Calendrier RH administrateur |
| `/sanctions` | Sanctions RH administrateur |

Les pages administrateur vérifient le rôle connecté. Lorsqu'un utilisateur
`EMPLOYEE` tente d'accéder aux pages d'administration observées, le code le
redirige vers `/my-attendance`.

Références :
`apps/frontend/app/login/page.tsx`,
`apps/frontend/app/page.tsx`,
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/app/employees/page.tsx`,
`apps/frontend/app/schedules/page.tsx`,
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/app/attendance-entry/page.tsx`,
`apps/frontend/app/my-attendance/page.tsx`.

### 2.4 Backend

Le backend est une API NestJS préfixée par `/api/v1`. Les domaines fonctionnels
présents sont :

| Module backend | Fonction |
| --- | --- |
| `auth` | Connexion, identification courante et accès au terminal de pointage |
| `dashboard` | Vue d'ensemble administrateur |
| `employees` | Consultation et gestion des employés |
| `schedules` | Consultation et gestion des plannings |
| `attendance` | Pointages, historique, synthèse et exports |
| `calendar` | Gestion du calendrier RH |
| `sanctions` | Calcul mensuel et règles de sanction |
| `health` | État de disponibilité de l'API |

Les contrôleurs `dashboard`, `employees`, `schedules`, `calendar` et
`sanctions` sont réservés au rôle `ADMIN`. Le contrôleur de pointage sépare les
opérations administrateur des opérations personnelles réservées au rôle
`EMPLOYEE`.

Références :
`apps/backend/src/main.ts`,
`apps/backend/src/modules`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

### 2.5 Base de données

La base PostgreSQL conserve les données décrites par le schéma Prisma. Les
modèles fonctionnels observables comprennent :

- `Employee` pour l'identité, le compte, le rôle d'accès, le service, l'état et
  l'affectation à un planning ;
- `Schedule` pour les horaires, la marge de retard, les jours travaillés et
  l'état ;
- `Attendance` pour les entrées, sorties, statuts et informations calculées de
  présence ;
- les modèles de calendrier RH ;
- les modèles de règles de sanction.

Le modèle `Employee` contient à la fois :

- `role`, une chaîne représentant la fonction ou le poste métier ;
- `accessRole`, une valeur d'autorisation limitée à `ADMIN` ou `EMPLOYEE`.

Ces deux notions ne portent donc pas la même information.

Référence : `apps/backend/prisma/schema.prisma`.

## 3. Organisation fonctionnelle

### 3.1 Authentification

L'écran `/login` contient un formulaire avec adresse électronique et mot de
passe. Le frontend transmet les identifiants à sa route serveur, qui appelle
`POST /api/v1/auth/login`.

Après une connexion réussie :

- le jeton d'accès est placé dans un cookie de session ;
- un administrateur est dirigé par défaut vers `/` ;
- un employé est dirigé par défaut vers `/my-attendance`.

La route `GET /api/v1/auth/me` retourne l'utilisateur authentifié. La
déconnexion efface les cookies de session général et de terminal de pointage,
puis redirige vers `/login`.

Le terminal `/attendance-entry` utilise une authentification séparée par
identifiant employé et code PIN. Cette session n'est acceptée que pour un
utilisateur dont le rôle d'accès est `EMPLOYEE`.

Références :
`apps/frontend/components/auth/login-form.tsx`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/app/api/auth/logout/route.ts`,
`apps/frontend/lib/redirect.ts`,
`apps/backend/src/modules/auth/auth.controller.ts`,
`apps/frontend/app/attendance-entry/page.tsx`.

### 3.2 Tableau de bord

La page `/` est réservée à l'administrateur. Elle affiche :

- l'utilisateur et sa session active ;
- la date et l'heure de génération des données ;
- les présences planifiées du jour ;
- le travail effectué un jour non ouvré ;
- les retards du jour ;
- les absences du jour ;
- les départs anticipés du jour ;
- les alertes quotidiennes ;
- les actions rapides ;
- les activités récentes ;
- des données analytiques de présence.

Les actions rapides donnent accès :

- au terminal de pointage et à son QR code ;
- à l'export d'un rapport ;
- à la création d'un employé ;
- à la création ou à l'affectation d'un planning.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/components/dashboard`,
`apps/backend/src/modules/dashboard/dashboard.controller.ts`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 3.3 Employés

La page `/employees` est réservée à l'administrateur. Elle permet de :

- consulter la liste des employés ;
- rechercher par les informations prises en charge par le composant ;
- filtrer par état, rôle d'accès, service et affectation à un planning ;
- créer un compte ;
- modifier un compte ;
- activer ou désactiver un compte ;
- saisir le prénom, le nom, l'adresse électronique, le rôle métier, le rôle
  d'accès et le service ;
- affecter un planning ;
- définir un mot de passe ;
- gérer l'identifiant employé et le code PIN lorsque le rôle est `EMPLOYEE`.

Le backend expose des opérations de consultation, création, modification,
changement d'état, affectation de rôle métier, de service et de planning.
Aucune opération `DELETE` n'est présente dans le contrôleur des employés.

Références :
`apps/frontend/app/employees/page.tsx`,
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/employees/dto`,
`apps/backend/prisma/schema.prisma`.

### 3.4 Plannings

La page `/schedules` est réservée à l'administrateur. Elle permet de :

- consulter les modèles de planning ;
- rechercher un planning ;
- filtrer par état, utilisation et jours travaillés ;
- créer un planning ;
- modifier un planning ;
- activer ou désactiver un planning ;
- renseigner un nom, une heure de début, une heure de fin, une marge de retard
  et les jours travaillés ;
- observer le nombre d'employés affectés.

L'affectation d'un planning à un employé est effectuée dans la gestion des
employés. Aucune opération `DELETE` n'est présente dans le contrôleur des
plannings.

Références :
`apps/frontend/app/schedules/page.tsx`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/schedules.controller.ts`,
`apps/backend/src/modules/schedules/dto`.

### 3.5 Pointages

Trois parcours de pointage sont observables :

| Parcours | Accès | Fonction |
| --- | --- | --- |
| Historique RH | Administrateur | Consultation mensuelle des pointages de l'équipe |
| Espace personnel | Employé connecté | Consultation du jour, historique et actions personnelles |
| Terminal fixe | Employé identifié par PIN | Entrée ou sortie depuis `/attendance-entry` |

L'historique RH comprend des filtres et un panneau de détail. Les données
retournées peuvent inclure l'heure d'arrivée, l'heure de sortie, le statut,
le retard, la sortie anticipée, les heures supplémentaires et les informations
de vérification conservées.

Le backend réserve à l'administrateur :

- la synthèse du jour ;
- l'historique mensuel global ;
- les exports mensuels ;
- l'enregistrement d'une entrée ou d'une sortie pour un employé.

Il réserve à l'employé :

- sa situation du jour ;
- sa politique de sécurité de pointage ;
- son historique mensuel ;
- son arrivée et sa sortie personnelles.

Références :
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/components/attendance-history`,
`apps/frontend/app/my-attendance/page.tsx`,
`apps/frontend/app/attendance-entry/page.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

### 3.6 Exports

La page `/exports` est réservée à l'administrateur. L'interface permet de
sélectionner une période mensuelle et un périmètre d'employés, puis de
télécharger un rapport PDF.

L'API `GET /api/v1/attendance/exports/monthly` accepte les formats `pdf` et
`csv`. L'interface dédiée observée construit une demande avec le format `pdf`.
L'action d'export est enregistrée par le service de journalisation d'audit
backend.

Références :
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`,
`apps/backend/src/modules/attendance/exports`.

### 3.7 Profil

Aucune route frontend `/profile` ou `/profil`, aucun module backend de profil
et aucun élément de navigation vers un espace de profil personnel ne sont
présents.

L'identité de l'administrateur connecté est affichée dans les en-têtes des
pages. La modification des informations d'un compte s'effectue depuis le
module Employés lorsqu'elle est réalisée par un administrateur.

Il n'existe pas de parcours autonome observé permettant à l'utilisateur
connecté de modifier lui-même son profil ou son mot de passe.

Références :
`apps/frontend/app`,
`apps/frontend/components/admin/admin-nav.tsx`,
`apps/frontend/app/employees/page.tsx`,
`apps/backend/src/modules`.

## 4. Parcours Administrateur

### 4.1 Parcours observé

Le parcours principal est :

```text
+--------------------------+
| Connexion                |
| /login                   |
+------------+-------------+
             |
             v
+--------------------------+
| Dashboard                |
| /                        |
+------------+-------------+
             |
             v
+--------------------------+
| Choix du module          |
| navigation ou action     |
+------------+-------------+
             |
             v
+--------------------------+
| Gestion                  |
| consultation ou saisie   |
+--------------------------+
```

### 4.2 Connexion

L'administrateur renseigne son adresse électronique et son mot de passe. Après
validation par le backend, le frontend crée la session et redirige le rôle
`ADMIN` vers le tableau de bord.

Une personne déjà connectée qui ouvre `/login` est redirigée selon son rôle.
Les comptes de démonstration intégrés à l'écran de connexion ne sont affichés
que lorsque `NODE_ENV` n'est pas `production`.

Références :
`apps/frontend/app/login/page.tsx`,
`apps/frontend/components/auth/login-form.tsx`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

### 4.3 Dashboard

Le dashboard d'organisation est une vue agrégée des données de l'entreprise
à travers ses sites. Il fournit les indicateurs, alertes, activités, analyses
et raccourcis observés. Chaque site a un dashboard opérationnel distinct; le
`siteId` d'une URL n'autorise pas l'accès, qui reste vérifié par le backend.
La navigation administrateur et le bouton de déconnexion sont placés dans son
en-tête.

Référence : `apps/frontend/app/dashboard/page.tsx`.

### 4.4 Choix du module

L'administrateur choisit un module depuis la navigation regroupée par thème ou
depuis les actions rapides du tableau de bord.

Les destinations proposées par la navigation sont :

- Tableau de bord ;
- Historique RH ;
- Exports PDF ;
- Employés ;
- Plannings ;
- Calendrier RH ;
- Sanctions RH.

Référence : `apps/frontend/components/admin/admin-nav.tsx`.

### 4.5 Gestion

Selon le module, l'administrateur consulte des indicateurs, filtre des données,
saisit ou modifie un employé, gère un planning, consulte les pointages ou
télécharge un rapport. Les actions disponibles dépendent des composants et
routes décrits dans la section 3.

Les pages principales vérifient la session et le rôle avant de charger les
données. Les contrôleurs backend appliquent également les rôles via le guard
global.

Références :
`apps/frontend/lib/auth.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/modules/auth/auth.module.ts`.

## 5. Rôles

### 5.1 Rôles d'accès présents

Le schéma Prisma définit exactement deux rôles d'accès :

| Rôle | Destination après connexion | Capacités observables |
| --- | --- | --- |
| `ADMIN` | `/` | Administration, tableau de bord, équipe, plannings, historique, exports, calendrier et sanctions |
| `EMPLOYEE` | `/my-attendance` | Consultation personnelle et pointage d'arrivée ou de sortie |

Référence : `apps/backend/prisma/schema.prisma`,
`apps/frontend/lib/redirect.ts`.

### 5.2 Différences observables

Le rôle `ADMIN` accède aux contrôleurs d'administration et aux pages portant la
navigation administrateur. Il peut gérer d'autres comptes et consulter les
données d'équipe.

Le rôle `EMPLOYEE` utilise les routes de pointage préfixées par `me`, qui
déduisent l'employé du jeton authentifié. Il accède à son espace personnel et
au terminal fixe après identification par PIN.

Les pages administrateur observées redirigent l'employé vers
`/my-attendance`. Le backend refuse une route lorsque le rôle du jeton ne
figure pas parmi les rôles exigés par le décorateur `@Roles`.

Références :
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/frontend/app/page.tsx`,
`apps/frontend/app/my-attendance/page.tsx`.

### 5.3 Rôle métier et rôle d'accès

Le champ `role` d'un employé est libre et décrit sa fonction métier. Le champ
`accessRole` contrôle l'autorisation dans l'application et ne peut prendre que
les valeurs `ADMIN` ou `EMPLOYEE`.

Le formulaire de gestion des employés présente séparément ces deux champs.
La modification du rôle métier ne crée donc pas un troisième rôle d'accès.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/employees/dto/assign-employee-role.dto.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

## 6. Navigation

### 6.1 Navigation administrateur

La navigation est rendue par `AdminNav` et organisée en quatre groupes :

| Groupe affiché | Liens | Routes |
| --- | --- | --- |
| Pilotage | Tableau de bord | `/` |
| Pointages | Historique RH, Exports PDF | `/attendance-history`, `/exports` |
| Équipe | Employés, Plannings | `/employees`, `/schedules` |
| Règles RH | Calendrier RH, Sanctions RH | `/calendar`, `/sanctions` |

Le lien du module courant reçoit un style actif. La navigation est reproduite
dans les en-têtes des pages administrateur.

Référence : `apps/frontend/components/admin/admin-nav.tsx`.

### 6.2 Actions rapides

Le tableau de bord propose quatre accès :

| Libellé | Destination ou action |
| --- | --- |
| QR Pointage | Affiche l'accès au terminal de pointage |
| Exporter un rapport | `/exports` |
| Créer un employé | `/employees` |
| Créer un planning | `/schedules` |

Le premier accès ouvre une carte contenant le point d'entrée du terminal et
son QR code. Les trois autres sont des liens vers les modules correspondants.

Référence :
`apps/frontend/components/dashboard/quick-actions-section.tsx`,
`apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`.

### 6.3 Navigation liée à la session

Les pages protégées utilisent `requireCurrentUser`. Sans utilisateur reconnu,
ce mécanisme redirige vers `/login`.

La déconnexion est proposée sur les pages administrateur et dans l'espace
employé. Elle déclenche une requête `POST` locale, efface les deux cookies de
session puis revient à la connexion.

Références :
`apps/frontend/lib/auth.ts`,
`apps/frontend/components/auth/logout-form.tsx`,
`apps/frontend/app/api/auth/logout/route.ts`.

### 6.4 Navigation employé

L'employé connecté est dirigé vers `/my-attendance`. Cet écran regroupe :

- la date et l'heure ;
- l'état de la politique de sécurité de pointage ;
- l'action d'arrivée ou de sortie disponible ;
- des indicateurs mensuels ;
- un historique récent ;
- la déconnexion.

Le terminal `/attendance-entry` constitue un parcours distinct, ouvert depuis
le lien fixe ou le QR code, avec identification par code employé et PIN.

Références :
`apps/frontend/app/my-attendance/page.tsx`,
`apps/frontend/app/attendance-entry/page.tsx`,
`apps/frontend/components/attendance`.

## 7. Limites fonctionnelles

Les limites suivantes sont directement observables dans le dépôt :

| Domaine | Limite observable | Trace |
| --- | --- | --- |
| Profil | Aucun écran autonome de profil ou de préférences | `apps/frontend/app`, `apps/frontend/components/admin/admin-nav.tsx` |
| Mot de passe personnel | Aucun parcours utilisateur de changement ou de récupération | `apps/frontend/app`, `apps/backend/src/modules/auth` |
| Employés | Aucun endpoint de suppression | `apps/backend/src/modules/employees/employees.controller.ts` |
| Plannings | Aucun endpoint de suppression | `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Exports dans l'interface | L'écran dédié demande un PDF ; le CSV est seulement pris en charge par l'API | `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`, `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Rôles d'accès | Seulement `ADMIN` et `EMPLOYEE` | `apps/backend/prisma/schema.prisma` |
| Comptes de démonstration | Visibles sur la connexion hors production uniquement | `apps/frontend/app/login/page.tsx` |
| Historique employé | L'espace personnel affiche un historique récent limité par son rendu | `apps/frontend/app/my-attendance/page.tsx` |
| Terminal fixe | Réservé à un compte d'accès `EMPLOYEE` identifié par PIN | `apps/frontend/app/attendance-entry/page.tsx`, `apps/backend/src/modules/auth/auth.service.ts` |
| Suppression des données | Aucun parcours utilisateur de suppression des pointages | `apps/backend/src/modules/attendance/attendance.controller.ts` |

Aucune fonction de profil autonome, de récupération de mot de passe, de rôle
d'accès supplémentaire ou de suppression des entités citées n'est
matérialisée par les pages et contrôleurs audités.

## 8. Traçabilité

| Fonctionnalité | Frontend | Backend ou données |
| --- | --- | --- |
| Connexion | `apps/frontend/app/login/page.tsx`, `apps/frontend/components/auth/login-form.tsx` | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| Session | `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/lib/auth-session.ts` | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Déconnexion | `apps/frontend/components/auth/logout-form.tsx`, `apps/frontend/app/api/auth/logout/route.ts` | Effacement réalisé par le frontend |
| Contrôle des rôles | Redirections dans les pages protégées | `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/prisma/schema.prisma` |
| Tableau de bord organisation | `apps/frontend/app/dashboard/page.tsx`, `apps/frontend/components/dashboard` | `apps/backend/src/modules/dashboard/dashboard.controller.ts`, `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Dashboard de site | `apps/frontend/app/site/[siteId]/dashboard/page.tsx` | Services et contrôleurs de contexte et de rapports de site |
| Navigation administrateur | `apps/frontend/components/admin/admin-nav.tsx` | Sans objet |
| Gestion des employés | `apps/frontend/app/employees/page.tsx`, `apps/frontend/components/employees/admin-employees-manager.tsx` | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/employees/employees.service.ts` |
| Gestion des plannings | `apps/frontend/app/schedules/page.tsx`, `apps/frontend/components/schedules/admin-schedules-manager.tsx` | `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/schedules/schedules.service.ts` |
| Historique RH | `apps/frontend/app/attendance-history/page.tsx`, `apps/frontend/components/attendance-history` | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| Pointage personnel | `apps/frontend/app/my-attendance/page.tsx`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Routes `me` dans `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Terminal fixe | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/attendance/attendance-entry.service.ts` |
| Export mensuel | `apps/frontend/app/exports/page.tsx`, `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx` | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/exports` |
| Calendrier RH | `apps/frontend/app/calendar/page.tsx`, `apps/frontend/components/calendar` | `apps/backend/src/modules/calendar` |
| Sanctions RH | `apps/frontend/app/sanctions/page.tsx`, `apps/frontend/components/sanctions` | `apps/backend/src/modules/sanctions` |
| Modèle employé | Formulaires et types dans `apps/frontend/lib/api.ts` | `Employee` dans `apps/backend/prisma/schema.prisma` |
| Modèle planning | Formulaires et types dans `apps/frontend/lib/api.ts` | `Schedule` dans `apps/backend/prisma/schema.prisma` |
| Modèle pointage | Affichage dans les composants de présence | `Attendance` dans `apps/backend/prisma/schema.prisma` |

## 9. Observations

### 9.1 Comportements observés

- La destination après connexion dépend du rôle d'accès.
- La session web repose sur un jeton conservé dans un cookie géré par les
  routes serveur Next.js.
- La session du terminal de pointage utilise un cookie distinct de la session
  web générale.
- Les pages administrateur vérifient le rôle avant d'afficher leur contenu.
- Le backend applique aussi les rôles sur ses contrôleurs et opérations.
- Les comptes inactifs ne sont pas traités comme des comptes actifs par le
  service d'authentification.
- Le tableau de bord agrège des informations de présence et propose des accès
  directs aux tâches administratives.
- Les changements administratifs d'employés, de plannings et les exports sont
  transmis au service de journalisation d'audit.

### 9.2 Modules existants

Les modules fonctionnels demandés et présents sont :

- Authentification ;
- Tableau de bord ;
- Employés ;
- Plannings ;
- Pointages ;
- Exports.

La navigation et le backend contiennent également deux domaines réellement
implémentés :

- Calendrier RH ;
- Sanctions RH.

Ces deux domaines sont cités parce qu'ils sont visibles dans la navigation
administrateur et présents dans les sources.

### 9.3 Modules absents

Le module Profil demandé n'existe pas comme page, entrée de navigation ou
module backend autonome.

Les mécanismes suivants sont également absents des interfaces et contrôleurs
audités :

- récupération d'un mot de passe oublié ;
- modification autonome du profil connecté ;
- troisième rôle d'accès ;
- suppression d'un employé ;
- suppression d'un planning ;
- suppression d'un pointage ;
- interface d'administration des journaux d'audit.

Ces constats décrivent uniquement l'état du dépôt à la date de génération.
