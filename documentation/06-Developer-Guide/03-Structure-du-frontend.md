# Structure du Frontend

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-003 |
| Titre | Structure du Frontend |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Date de génération | 30 juillet 2026 |

# 1. Présentation

## 1.1 Objectif

Ce chapitre décrit la structure du frontend de Konatech Pointage telle qu'elle est implémentée dans `apps/frontend`. Il présente l'organisation Next.js App Router, les pages, les composants, la navigation, la gestion des états et les échanges avec le backend.

La description se limite aux éléments présents dans le dépôt à la date de génération du document.

## 1.2 Rôle du frontend

Le frontend assure les fonctions observables suivantes :

- authentification des administrateurs et des employés ;
- affichage du tableau de bord administrateur ;
- consultation de l'historique des pointages ;
- gestion des employés et des plannings ;
- gestion du calendrier RH et des règles de sanction ;
- génération des exports mensuels au format PDF ;
- présentation de l'espace de pointage d'un employé ;
- accès public au terminal de pointage par code PIN ;
- exposition de routes API Next.js servant d'intermédiaire avec le backend.

Le code est écrit en TypeScript avec Next.js 15, React 19 et Tailwind CSS. L'application utilise l'App Router et ne possède pas de répertoire `pages`.

**Fichiers de référence :**

- `apps/frontend/package.json`
- `apps/frontend/app/layout.tsx`
- `apps/frontend/app/page.tsx`
- `apps/frontend/app/globals.css`
- `apps/frontend/tailwind.config.ts`
- `apps/frontend/tsconfig.json`

# 2. Architecture générale

## 2.1 Organisation App Router

Le répertoire `apps/frontend/app` constitue la racine de l'App Router. Une route d'interface est matérialisée par un fichier `page.tsx`. Les routes d'API internes sont matérialisées par des fichiers `route.ts` sous `app/api`.

Le frontend contient :

- un layout racine unique dans `app/layout.tsx` ;
- dix pages applicatives ;
- des fichiers `loading.tsx` pour les états de chargement de plusieurs segments ;
- des fichiers `error.tsx` pour les erreurs de plusieurs segments ;
- dix-huit routes API Next.js ;
- un middleware de contrôle de session pour quatre familles de routes.

Le layout racine déclare les métadonnées, charge `globals.css`, fixe la langue du document à `fr` et rend directement les enfants. Il est configuré avec `dynamic = 'force-dynamic'`.

Les pages applicatives exportent également `dynamic = 'force-dynamic'`. Les pages récupérant des données côté serveur lisent la session, interrogent le backend et transmettent les résultats initiaux aux composants clients concernés.

## 2.2 Layouts

Un seul fichier `layout.tsx` est présent :

| Layout | Portée | Fonction observée |
| --- | --- | --- |
| `app/layout.tsx` | Toute l'application | Métadonnées, icônes, langue française, feuille de styles globale et rendu de `children` |

Aucun layout imbriqué n'est présent dans les segments `login`, `employees`, `schedules`, `calendar`, `sanctions`, `exports`, `attendance-history`, `my-attendance` ou `attendance-entry`.

Le composant `PageShell`, distinct du mécanisme de layout Next.js, fournit un conteneur visuel réutilisé par les pages d'administration. Il ne constitue pas un fichier `layout.tsx`.

## 2.3 Pages

Les pages sont majoritairement des composants serveur asynchrones. Elles réalisent la lecture de session et le chargement initial des données avant de composer l'interface.

Les composants interactifs portent la directive `'use client'` et gèrent les formulaires, les filtres, les panneaux, les dialogues, le QR Code et le flux de pointage.

## 2.4 Composants

Les composants sont organisés par domaine fonctionnel :

- administration ;
- authentification ;
- tableau de bord ;
- employés ;
- plannings ;
- pointage ;
- historique des pointages ;
- calendrier ;
- sanctions ;
- mise en page ;
- primitives d'interface.

Les composants de domaine utilisent les primitives locales `Badge`, `Button`, `Card` et `Skeleton`. Les classes conditionnelles sont assemblées au moyen de `cn`, `clsx`, `tailwind-merge` et `class-variance-authority`.

## 2.5 Providers

Aucun composant React Provider personnalisé, aucun appel à `createContext` et aucun appel à `useContext` ne sont présents dans le frontend. Le layout racine ne monte aucun provider applicatif.

## 2.6 Diagramme d'architecture

```text
Navigateur
    |
    v
Next.js App Router
    |
    +--> app/layout.tsx
    |        |
    |        +--> app/**/page.tsx
    |                 |
    |                 +--> composants serveur
    |                 +--> composants clients
    |                 +--> composants UI
    |
    +--> middleware.ts
    |
    +--> app/api/**/route.ts
                 |
                 v
          lib/api-route.ts
                 |
                 v
             Backend API
```

**Fichiers de référence :**

- `apps/frontend/app/layout.tsx`
- `apps/frontend/app/page.tsx`
- `apps/frontend/app/loading.tsx`
- `apps/frontend/app/error.tsx`
- `apps/frontend/middleware.ts`
- `apps/frontend/components/layout/page-shell.tsx`
- `apps/frontend/components/ui/badge.tsx`
- `apps/frontend/components/ui/button.tsx`
- `apps/frontend/components/ui/card.tsx`
- `apps/frontend/components/ui/skeleton.tsx`
- `apps/frontend/lib/utils.ts`

# 3. Organisation des dossiers

## 3.1 Répertoires du frontend

| Dossier | Rôle observé | Contenu principal |
| --- | --- | --- |
| `apps/frontend/app` | Racine App Router | Layout racine, styles globaux, page du tableau de bord, erreurs et chargements globaux |
| `apps/frontend/app/api` | Couche API Next.js | Route handlers d'authentification, de pointage, d'employés, de plannings, de calendrier, de sanctions, d'export et de santé |
| `apps/frontend/app/attendance-entry` | Terminal de pointage | Page publique par PIN, chargement et gestion d'erreur |
| `apps/frontend/app/attendance-history` | Historique administrateur | Page, chargement et gestion d'erreur |
| `apps/frontend/app/calendar` | Calendrier RH | Page, chargement et gestion d'erreur |
| `apps/frontend/app/employees` | Gestion des employés | Page, chargement et gestion d'erreur |
| `apps/frontend/app/exports` | Export mensuel | Page d'export PDF |
| `apps/frontend/app/login` | Authentification | Page de connexion |
| `apps/frontend/app/my-attendance` | Espace employé | Page, chargement et gestion d'erreur |
| `apps/frontend/app/sanctions` | Sanctions RH | Page et chargement |
| `apps/frontend/app/schedules` | Gestion des plannings | Page, chargement et gestion d'erreur |
| `apps/frontend/components/admin` | Composants administratifs communs | Navigation et état vide |
| `apps/frontend/components/attendance` | Pointage employé | Terminal PIN, actions entrée/sortie, horloge, capture photo, sécurité navigateur, affichage et session courte |
| `apps/frontend/components/attendance-history` | Consultation des pointages | Filtres, tableau, panneau de détail et espace de travail |
| `apps/frontend/components/auth` | Authentification | Formulaires de connexion et de déconnexion |
| `apps/frontend/components/calendar` | Calendrier RH | Espace de travail, cellules, badges, légende, sélecteur et panneau de jour |
| `apps/frontend/components/dashboard` | Tableau de bord | Indicateurs, alertes, analyses, activité, actions rapides, QR Code et export |
| `apps/frontend/components/employees` | Gestion des employés | Gestionnaire interactif et fonctions auxiliaires |
| `apps/frontend/components/layout` | Mise en page réutilisable | `PageShell` et `PageHero` |
| `apps/frontend/components/sanctions` | Gestion des sanctions | Panneau des règles et sélecteur de mois |
| `apps/frontend/components/schedules` | Gestion des plannings | Gestionnaire interactif et fonctions auxiliaires |
| `apps/frontend/components/ui` | Primitives d'interface | Badge, bouton, carte et squelette |
| `apps/frontend/lib` | Services et fonctions transverses | Accès API, proxy, session, authentification, redirections, erreurs client et utilitaires CSS |
| `apps/frontend/public` | Ressources statiques | Logo, favicon et icônes |
| `apps/frontend/types` | Déclarations TypeScript | Déclaration de type pour `qrcode` |

## 3.2 Fichiers de configuration

| Fichier | Rôle observé |
| --- | --- |
| `apps/frontend/package.json` | Dépendances et scripts du frontend |
| `apps/frontend/next.config.ts` | Mode strict React et exclusion du lint pendant le build Next.js |
| `apps/frontend/tsconfig.json` | TypeScript strict, App Router et alias `@/*` |
| `apps/frontend/tailwind.config.ts` | Sources analysées par Tailwind et thème visuel |
| `apps/frontend/postcss.config.js` | Chaîne PostCSS avec Tailwind et Autoprefixer |
| `apps/frontend/.env.example` | Variables d'environnement d'exemple |
| `apps/frontend/.env.local` | Configuration locale présente dans l'arborescence de travail |
| `apps/frontend/middleware.ts` | Contrôle préalable de présence du cookie de session |

## 3.3 Éléments non présents

Les répertoires suivants ne sont pas présents dans `apps/frontend` :

- `hooks` ;
- `providers` ;
- `services` ;
- `contexts` ;
- `pages`.

Les fonctions assimilables à une couche de service frontend se trouvent dans `lib/api.ts` et `lib/api-route.ts`.

# 4. Navigation

## 4.1 Routes d'interface

| Route | Catégorie | Page | Accès et comportement observés |
| --- | --- | --- | --- |
| `/login` | Publique | `app/login/page.tsx` | Affiche la connexion si aucune session valide ; redirige un utilisateur déjà authentifié selon son rôle |
| `/attendance-entry` | Pointage public | `app/attendance-entry/page.tsx` | Affiche la saisie PIN sans session courte ; affiche le terminal si le cookie de pointage identifie un employé |
| `/` | Administration protégée | `app/page.tsx` | Requiert une session ; accepte `ADMIN` ; redirige les autres rôles vers `/my-attendance` |
| `/attendance-history` | Administration protégée | `app/attendance-history/page.tsx` | Requiert une session et le rôle `ADMIN` ; présente l'historique RH |
| `/employees` | Administration protégée | `app/employees/page.tsx` | Requiert une session et le rôle `ADMIN` ; présente la gestion des employés |
| `/schedules` | Administration protégée | `app/schedules/page.tsx` | Requiert une session et le rôle `ADMIN` ; présente la gestion des plannings |
| `/calendar` | Administration protégée | `app/calendar/page.tsx` | Requiert une session et le rôle `ADMIN` ; accepte le paramètre `month` |
| `/sanctions` | Administration protégée | `app/sanctions/page.tsx` | Requiert une session et le rôle `ADMIN` ; accepte les paramètres `month` et `tab` |
| `/exports` | Administration protégée | `app/exports/page.tsx` | Requiert une session et le rôle `ADMIN` ; présente l'export mensuel PDF |
| `/my-attendance` | Employé protégé | `app/my-attendance/page.tsx` | Requiert une session ; redirige un administrateur vers `/` ; présente les actions et l'historique de l'employé |

## 4.2 Navigation administrateur

`AdminNav` définit les liens réellement affichés dans les pages d'administration :

| Groupe | Libellé | Destination |
| --- | --- | --- |
| Pilotage | Tableau de bord | `/` |
| Pointages | Historique RH | `/attendance-history` |
| Pointages | Exports PDF | `/exports` |
| Équipe | Employés | `/employees` |
| Équipe | Plannings | `/schedules` |
| Règles RH | Calendrier RH | `/calendar` |
| Règles RH | Sanctions RH | `/sanctions` |

La route active est représentée par la variante principale du bouton. Les autres liens utilisent la variante secondaire.

## 4.3 Protection par middleware et par page

Le middleware vérifie uniquement la présence du cookie `konatech_session` pour :

- `/` ;
- `/my-attendance` et ses sous-chemins ;
- `/employees` et ses sous-chemins ;
- `/schedules` et ses sous-chemins.

En l'absence du cookie, ces routes sont redirigées vers `/login`.

Les pages serveur appliquent ensuite `requireCurrentUser()`, qui valide la session auprès de `/auth/me`. Les pages d'administration contrôlent explicitement `accessRole === 'ADMIN'`. Cette vérification de page couvre aussi les routes d'administration qui ne figurent pas dans le matcher du middleware : `/attendance-history`, `/calendar`, `/sanctions` et `/exports`.

La page `/my-attendance` redirige le rôle `ADMIN` vers `/`. La page `/login` utilise `resolvePostLoginRedirect` pour choisir `/` pour `ADMIN` et `/my-attendance` pour l'autre rôle observé.

## 4.4 Routes API Next.js

Les composants clients n'appellent pas directement le backend pour les mutations. Ils utilisent les route handlers sous `/api`, qui relaient les requêtes vers l'API backend.

| Famille | Routes Next.js observées | Méthodes |
| --- | --- | --- |
| Authentification | `/api/auth/login`, `/api/auth/logout` | `POST` |
| Session de pointage | `/api/auth/attendance-entry-session` | `POST`, `DELETE` |
| Pointage employé | `/api/attendance/me/check-in`, `/api/attendance/me/check-out` | `POST` |
| Export | `/api/attendance/exports/monthly` | `GET` |
| Employés | `/api/employees`, `/api/employees/[id]`, `/api/employees/[id]/status` | `GET`, `POST`, `PATCH` |
| Plannings | `/api/schedules`, `/api/schedules/[id]`, `/api/schedules/[id]/status` | `GET`, `POST`, `PATCH` |
| Calendrier | `/api/calendar/month`, `/api/calendar/holidays`, `/api/calendar/holidays/[id]` | `GET`, `POST`, `PATCH`, `DELETE` |
| Sanctions | `/api/sanctions/attendance/[attendanceId]`, `/api/sanctions/rules/[id]` | `GET`, `PATCH` |
| Santé | `/api/health` | `GET` |

**Fichiers de référence :**

- `apps/frontend/components/admin/admin-nav.tsx`
- `apps/frontend/middleware.ts`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/lib/redirect.ts`
- `apps/frontend/app/login/page.tsx`
- `apps/frontend/app/attendance-entry/page.tsx`
- `apps/frontend/app/my-attendance/page.tsx`
- `apps/frontend/app/api`

# 5. Gestion des composants

## 5.1 Primitives UI

| Composant | Fichier | Utilisation observée |
| --- | --- | --- |
| `Badge` | `components/ui/badge.tsx` | Statuts, catégories et informations synthétiques |
| `Button` et `buttonVariants` | `components/ui/button.tsx` | Actions, liens stylés et navigation |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | `components/ui/card.tsx` | Conteneurs visuels des pages et modules |
| `Skeleton` | `components/ui/skeleton.tsx` | États de chargement |

Ces primitives sont locales au dépôt. Aucun fichier `components.json` de configuration shadcn/ui n'est présent dans `apps/frontend`.

## 5.2 Mise en page et administration

| Composant | Fichier | Utilisation observée |
| --- | --- | --- |
| `PageShell` | `components/layout/page-shell.tsx` | Conteneur commun des pages administrateur |
| `PageHero` | `components/layout/page-shell.tsx` | En-tête générique exporté par le module de mise en page |
| `AdminNav` | `components/admin/admin-nav.tsx` | Navigation entre les modules administrateur |
| `AdminEmptyState` | `components/admin/admin-empty-state.tsx` | Affichage uniforme des listes ou alertes vides |

## 5.3 Formulaires et gestionnaires

| Composant | Fichier | Fonction observée |
| --- | --- | --- |
| `LoginForm` | `components/auth/login-form.tsx` | Envoi des identifiants à `/api/auth/login`, affichage d'erreur et redirection |
| `LogoutForm` | `components/auth/logout-form.tsx` | Formulaire POST vers `/api/auth/logout` |
| `AdminEmployeesManager` | `components/employees/admin-employees-manager.tsx` | Création, modification, activation, désactivation, recherche et filtres des employés |
| `AdminSchedulesManager` | `components/schedules/admin-schedules-manager.tsx` | Création, modification, activation, désactivation, recherche et filtres des plannings |
| `CalendarWorkspace` | `components/calendar/calendar-workspace.tsx` | Consultation du calendrier et création, modification ou suppression d'entrées RH |
| `SanctionRulesPanel` | `components/sanctions/sanction-rules-panel.tsx` | Consultation et modification des règles de sanction |
| `MonthlyAttendanceExportCard` | `components/dashboard/monthly-attendance-export-card.tsx` | Paramétrage et téléchargement de l'export mensuel PDF |

Les gestionnaires d'employés et de plannings disposent chacun d'un fichier auxiliaire contenant leurs valeurs initiales, transformations, libellés d'état et fonctions de présentation.

## 5.4 Tableaux et consultation

| Composant | Fichier | Fonction observée |
| --- | --- | --- |
| `AttendanceHistoryWorkspace` | `components/attendance-history/attendance-history-workspace.tsx` | Coordination des filtres, du résumé, du tableau et du détail |
| `AttendanceHistoryFilters` | `components/attendance-history/attendance-history-filters.tsx` | Filtres par période, employé, département et statuts disponibles |
| `AttendanceHistoryTable` | `components/attendance-history/attendance-history-table.tsx` | Tableau des pointages et sélection d'un enregistrement |
| `AttendanceDetailPanel` | `components/attendance-history/attendance-detail-panel.tsx` | Détails d'un pointage et chargement de sa sanction |

`AdminEmployeesManager` et `AdminSchedulesManager` présentent leurs données sous forme de lignes interactives, avec formulaires intégrés à leur espace de gestion.

## 5.5 Dialogues et panneaux

| Composant | Mécanisme observé |
| --- | --- |
| `CalendarDayDrawer` | Panneau de détail déclaré avec `role="dialog"` et `aria-modal="true"` |
| `CalendarWorkspace` | Dialogue de formulaire déclaré avec `role="dialog"` et `aria-modal="true"` |
| `SanctionRuleEditModal` | Modale interne de modification d'une règle de sanction |
| `AttendanceDetailPanel` | Panneau de détail commandé par la sélection d'une ligne du tableau |

## 5.6 Composants métiers de pointage

| Composant ou module | Fichier | Fonction observée |
| --- | --- | --- |
| `AttendanceEntryPinView` | `components/attendance/attendance-entry-pin-view.tsx` | Saisie et validation du PIN du terminal |
| `FixedAttendanceEntryView` | `components/attendance/fixed-attendance-entry-view.tsx` | Vue du terminal après identification |
| `EmployeeAttendanceActions` | `components/attendance/employee-attendance-actions.tsx` | Cycle d'entrée et de sortie, sécurité conditionnelle, commentaire et retour utilisateur |
| `AttendanceEntrySessionButton` | `components/attendance/attendance-entry-session-button.tsx` | Fin ou changement de la session courte de pointage |
| `AttendanceSelfieCapture` | `components/attendance/attendance-selfie-capture.tsx` | Capture photo lorsque le flux de sécurité la demande |
| `AttendanceLiveClock` | `components/attendance/attendance-live-clock.tsx` | Horloge actualisée côté client |
| `attendance-browser-security.ts` | `components/attendance/attendance-browser-security.ts` | Géolocalisation et calcul local de distance |
| `attendance-action-flow.ts` | `components/attendance/attendance-action-flow.ts` | Libellés et métadonnées du cycle de pointage |
| `attendance-display.ts` | `components/attendance/attendance-display.ts` | Formats, calculs d'affichage et métadonnées des statuts |
| `AttendanceEntryQrCard` | `components/dashboard/attendance-entry-qr-card.tsx` | Génération et affichage du QR Code vers `/attendance-entry` |

## 5.7 Composants du tableau de bord

La page d'accueil administrateur compose les composants suivants :

- `MetricCard` ;
- `DailyAlertsCard` ;
- `DashboardAnalyticsSection` ;
- `QuickActionsSection` ;
- `RecentActivityList`.

`QuickActionsSection` monte `AttendanceEntryQrCard` dans son action de pointage. Les composants `ModuleCard` et `ConnectionPanel` sont présents dans le répertoire `components/dashboard`, mais aucune importation par une page ou un autre composant n'a été observée.

# 6. Gestion des états

## 6.1 État serveur

Les pages serveur utilisent :

- `cookies()` pour lire les cookies de session ;
- `requireCurrentUser()` pour charger l'utilisateur courant ;
- `getSessionToken()` pour obtenir le jeton utilisé côté serveur ;
- les fonctions de `lib/api.ts` pour récupérer les données initiales ;
- `redirect()` pour appliquer les parcours liés à la session et au rôle.

Les chargements principaux observés sont :

| Page | Fonction de données |
| --- | --- |
| `/` | `getDashboardData()` |
| `/attendance-history` | `getAttendanceHistoryData()` et `getEmployeesData()` |
| `/employees` | `getEmployeesData()` |
| `/schedules` | `getSchedulesData()` |
| `/calendar` | `getCalendarMonthData()` |
| `/sanctions` | `getMonthlySanctionsData()` et `getSanctionRulesData()` |
| `/my-attendance` | `getEmployeeAttendanceData()` |
| `/attendance-entry` | `getCurrentUserFromApi()` et `getEmployeeAttendanceData()` lorsqu'une session courte existe |

Les appels serveur utilisent `fetchServerApi()` avec `cache: 'no-store'` par défaut.

## 6.2 État local React

Les composants clients utilisent les hooks React standards :

| Hook | Utilisation observée |
| --- | --- |
| `useState` | Formulaires, filtres, sélection, étapes de pointage, messages, états d'envoi et données locales |
| `useMemo` | Filtrage, résumés calculés, listes dérivées et calendrier |
| `useEffect` | Horloge, caméra, QR Code, chargements complémentaires, fermeture de panneaux et nettoyage de session |
| `useRef` | Canvas du QR Code, caméra et flux média |
| `useTransition` et `startTransition` | Soumission ou actualisation non bloquante de l'authentification et du terminal PIN |
| `useRouter` | Navigation, remplacement d'URL, actualisation après mutation ou authentification |

Aucun hook personnalisé exporté sous une convention `use...`, aucun dossier `hooks` et aucun état global par Context ne sont observés.

## 6.3 Données transmises par propriétés

Les pages serveur transmettent les données initiales aux composants clients par propriétés :

- `initialEmployees` et les plannings au gestionnaire d'employés ;
- `initialSchedules` au gestionnaire de plannings ;
- les enregistrements et listes de filtrage à l'espace d'historique ;
- `initialData` à l'espace calendrier ;
- les règles au panneau de sanctions ;
- les données du jour et l'historique aux vues de pointage.

Après une mutation, les gestionnaires mettent à jour leur état local. Certains composants appellent aussi `router.refresh()` afin de recharger l'état rendu côté serveur.

## 6.4 Appels API depuis les composants clients

| Composant | Routes internes appelées |
| --- | --- |
| `LoginForm` | `/api/auth/login` |
| `AttendanceEntryPinView` | `/api/auth/attendance-entry-session` |
| `AttendanceEntrySessionButton` | `/api/auth/attendance-entry-session` |
| `EmployeeAttendanceActions` | `/api/attendance/me/check-in`, `/api/attendance/me/check-out` |
| `AdminEmployeesManager` | `/api/employees`, `/api/employees/[id]`, `/api/employees/[id]/status` |
| `AdminSchedulesManager` | `/api/schedules`, `/api/schedules/[id]`, `/api/schedules/[id]/status` |
| `CalendarWorkspace` | `/api/calendar/holidays`, `/api/calendar/holidays/[id]` |
| `SanctionRulesPanel` | `/api/sanctions/rules/[id]` |
| `AttendanceDetailPanel` | `/api/sanctions/attendance/[attendanceId]` |
| `MonthlyAttendanceExportCard` | `/api/employees`, `/api/attendance/exports/monthly` |

`lib/api-route.ts` centralise le relais des requêtes authentifiées. Il lit le cookie approprié, ajoute l'en-tête `Authorization: Bearer`, relaie les corps JSON ou les fichiers, transforme les erreurs et supprime le cookie court de pointage lors de certaines réponses `401`.

## 6.5 Sessions

Deux cookies HTTP-only sont définis :

| Cookie | Rôle |
| --- | --- |
| `konatech_session` | Session applicative standard |
| `konatech_attendance_entry_session` | Session courte du terminal de pointage |

Les options communes sont `httpOnly`, `sameSite: 'lax'`, `path: '/'` et `secure` en production. L'âge maximal provient de la réponse d'authentification.

**Fichiers de référence :**

- `apps/frontend/lib/api.ts`
- `apps/frontend/lib/api-route.ts`
- `apps/frontend/lib/auth.ts`
- `apps/frontend/lib/auth-session.ts`
- `apps/frontend/components/auth/login-form.tsx`
- `apps/frontend/components/attendance/employee-attendance-actions.tsx`
- `apps/frontend/components/employees/admin-employees-manager.tsx`
- `apps/frontend/components/schedules/admin-schedules-manager.tsx`
- `apps/frontend/components/calendar/calendar-workspace.tsx`

# 7. Flux de navigation

## 7.1 Connexion avec session standard

Le parcours de connexion réellement implémenté est le suivant :

1. l'utilisateur ouvre `/login` ;
2. `LoginForm` envoie l'adresse électronique, le mot de passe et l'éventuelle cible à `/api/auth/login` ;
3. la route Next.js relaie les données à `/auth/login` du backend ;
4. en cas de succès, elle crée le cookie `konatech_session` ;
5. le rôle `ADMIN` est dirigé vers `/` par défaut ;
6. le rôle `EMPLOYEE` est dirigé vers `/my-attendance` par défaut ;
7. `router.refresh()` recharge les composants serveur dans le contexte de la nouvelle session.

Une cible interne `redirectTo` peut être conservée. Les chemins externes, les chemins commençant par `//` ou `/\`, et `/login` sont rejetés par la normalisation.

## 7.2 Parcours administrateur

Depuis `/`, l'administrateur utilise `AdminNav` pour accéder aux modules. Chaque page recharge l'utilisateur courant et vérifie son rôle avant de charger ses données.

## 7.3 Parcours employé authentifié

L'employé connecté arrive sur `/my-attendance`. La page charge les informations du jour et l'historique du mois courant. `EmployeeAttendanceActions` exécute ensuite l'entrée ou la sortie via les routes API Next.js.

## 7.4 Parcours terminal de pointage

Le QR Code du tableau de bord mène vers `/attendance-entry`. Sans cookie court, la page affiche le pavé PIN. Après validation, la route `/api/auth/attendance-entry-session` crée le cookie `konatech_attendance_entry_session`, puis la page se recharge et présente le terminal à l'employé identifié.

Si le rôle associé au cookie court n'est pas `EMPLOYEE`, ou si le chargement échoue, la page revient à la vue PIN. La session courte peut être supprimée par la méthode `DELETE` de la même route interne.

## 7.5 Diagramme des flux

```text
                         +----------------------+
                         |       /login         |
                         +----------+-----------+
                                    |
                           authentification
                                    |
                    +---------------+---------------+
                    |                               |
              rôle ADMIN                      rôle EMPLOYEE
                    |                               |
                    v                               v
          +---------+---------+            +--------+---------+
          | / tableau de bord |            | /my-attendance   |
          +---------+---------+            +--------+---------+
                    |                               |
           AdminNav |                         entrée / sortie
                    |                               |
        +-----------+-----------+                   v
        |     |      |     |    |          /api/attendance/me/*
        v     v      v     v    v
 historique employés plannings calendrier sanctions / exports

 Tableau de bord ADMIN
          |
          v
 QR Code vers /attendance-entry
          |
          v
 PIN -> session courte -> terminal employé -> entrée / sortie
```

**Fichiers de référence :**

- `apps/frontend/app/login/page.tsx`
- `apps/frontend/app/page.tsx`
- `apps/frontend/app/my-attendance/page.tsx`
- `apps/frontend/app/attendance-entry/page.tsx`
- `apps/frontend/components/auth/login-form.tsx`
- `apps/frontend/components/admin/admin-nav.tsx`
- `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`
- `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`
- `apps/frontend/components/attendance/fixed-attendance-entry-view.tsx`
- `apps/frontend/components/attendance/employee-attendance-actions.tsx`
- `apps/frontend/app/api/auth/login/route.ts`
- `apps/frontend/app/api/auth/attendance-entry-session/route.ts`
- `apps/frontend/lib/redirect.ts`

# 8. Traçabilité

| Section | Sujet vérifié | Fichiers principaux |
| --- | --- | --- |
| 1 | Rôle et technologies du frontend | `apps/frontend/package.json`, `apps/frontend/app/page.tsx`, `apps/frontend/app/globals.css` |
| 2 | App Router, layout, pages et providers | `apps/frontend/app/layout.tsx`, `apps/frontend/app`, `apps/frontend/components`, `apps/frontend/middleware.ts` |
| 3 | Organisation des répertoires | `apps/frontend/app`, `apps/frontend/components`, `apps/frontend/lib`, `apps/frontend/public`, `apps/frontend/types` |
| 3 | Configuration Next.js et TypeScript | `apps/frontend/next.config.ts`, `apps/frontend/tsconfig.json`, `apps/frontend/tailwind.config.ts`, `apps/frontend/postcss.config.js` |
| 4 | Routes d'interface | Tous les fichiers `apps/frontend/app/**/page.tsx` |
| 4 | Navigation administrateur | `apps/frontend/components/admin/admin-nav.tsx` |
| 4 | Protection et redirections | `apps/frontend/middleware.ts`, `apps/frontend/lib/auth.ts`, `apps/frontend/lib/redirect.ts` |
| 4 | Routes API internes | Tous les fichiers `apps/frontend/app/api/**/route.ts` |
| 5 | Primitives UI | `apps/frontend/components/ui/badge.tsx`, `button.tsx`, `card.tsx`, `skeleton.tsx` |
| 5 | Formulaires et gestionnaires | `apps/frontend/components/auth`, `employees`, `schedules`, `calendar`, `sanctions` |
| 5 | Pointage et historique | `apps/frontend/components/attendance`, `apps/frontend/components/attendance-history` |
| 5 | Tableau de bord | `apps/frontend/components/dashboard`, `apps/frontend/app/page.tsx` |
| 6 | Accès backend côté serveur | `apps/frontend/lib/api.ts` |
| 6 | Proxy des appels clients | `apps/frontend/lib/api-route.ts`, `apps/frontend/app/api` |
| 6 | Sessions | `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` |
| 6 | État local | Tous les composants contenant la directive `'use client'` sous `apps/frontend/components` |
| 7 | Flux de connexion | `apps/frontend/components/auth/login-form.tsx`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/lib/redirect.ts` |
| 7 | Flux du terminal | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` |

# 9. Observations

## 9.1 Structure

- Le frontend est une application Next.js autonome située dans `apps/frontend`.
- L'App Router est utilisé exclusivement ; aucun répertoire Pages Router n'est présent.
- Un seul layout Next.js est présent à la racine.
- Les composants sont regroupés par domaine fonctionnel, avec un répertoire séparé pour les primitives UI.
- Les fichiers `loading.tsx` et `error.tsx` ne sont pas présents pour chaque route : ils existent pour la racine et pour plusieurs modules, mais pas pour `login` ni `exports`; `sanctions` possède un chargement sans fichier d'erreur local.

## 9.2 Composants et réutilisation

- `PageShell`, `AdminNav`, `LogoutForm`, `Badge`, `Card` et `AdminEmptyState` sont réutilisés dans plusieurs modules.
- Les gestionnaires d'employés et de plannings suivent une structure similaire et disposent chacun d'un module de fonctions auxiliaires.
- `MetricCard` est utilisé par le tableau de bord et la page des sanctions.
- `MonthlyAttendanceExportCard` est rangé dans `components/dashboard` tout en étant utilisé par la page `/exports`.
- `AttendanceEntryQrCard` est monté par `QuickActionsSection` et non directement par la page du tableau de bord.
- `ModuleCard`, `ConnectionPanel` et `PageHero` sont exportés dans le code, mais aucune utilisation par une page ou un autre composant n'a été observée.

## 9.3 Organisation des états

- Aucun provider global, contexte React ou store externe n'est présent.
- Aucun hook personnalisé ni répertoire `hooks` n'est présent.
- L'état partagé entre une page et son espace interactif est transmis par propriétés.
- L'état d'interface est local aux composants clients.
- Les données initiales sont chargées par les pages serveur ; les mutations transitent par les routes API Next.js.

## 9.4 Navigation et protection

- Le middleware ne couvre qu'un sous-ensemble des routes protégées.
- Les contrôles serveur par `requireCurrentUser()` et par rôle sont présents dans toutes les pages administrateur observées.
- `/attendance-entry` reste accessible sans session standard et utilise un cookie distinct après validation du PIN.
- La route `/api/health` relaie le health check du backend, mais n'est pas une page de navigation.

## 9.5 Configuration observée

- TypeScript est configuré en mode strict avec l'alias `@/*`.
- `reactStrictMode` est actif.
- Le build Next.js ignore le lint par la configuration `eslint.ignoreDuringBuilds`.
- Aucun script `lint` n'est déclaré dans `apps/frontend/package.json`.
- Les scripts frontend déclarés sont `dev`, `build`, `start` et `typecheck`.
- Les appels serveur désactivent la mise en cache par défaut avec `cache: 'no-store'`.
