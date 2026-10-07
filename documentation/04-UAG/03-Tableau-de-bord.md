# Tableau de bord

> **Périmètre actuel :** ce guide concerne le tableau de bord de l'organisation, accessible à `/dashboard`. Il s'agit d'une vue agrégée de l'entreprise et non du dashboard d'un site particulier. Les opérations d'un site utilisent `/site/[siteId]/...`, avec un dashboard distinct et des données limitées au site autorisé. Le `siteId` de l'URL ne confère aucun droit d'accès; le backend autorise le site depuis le contexte d'organisation authentifié. Voir `PROJECT_PLAN.md` pour le contrat produit et `docs/ARCHITECTURE.md` pour les frontières d'implémentation.

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-DASH-001 |
| Titre | Tableau de bord |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif du tableau de bord

Le tableau de bord constitue la page d'accueil de l'espace administrateur de
Konatech Pointage. Il présente une vue opérationnelle de la situation RH du
jour et une synthèse du mois courant à partir des données de présence.

Les éléments affichés permettent de consulter :

- cinq indicateurs de présence du jour ;
- les alertes RH du jour ;
- les actions administratives rapides ;
- l'activité récente de pointage ;
- quatre indicateurs mensuels ;
- trois classements mensuels d'employés ;
- l'identité de la session active et l'heure de génération des données.

Le tableau de bord n'est pas un écran de saisie directe des indicateurs. Les
valeurs sont calculées par le backend à partir des employés, plannings,
pointages et jours non ouvrés stockés.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/components/dashboard`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 1.2 Utilisateurs concernés

Le tableau de bord est réservé au rôle d'accès `ADMIN`.

Cette restriction est appliquée à deux niveaux :

- la page frontend vérifie `user.accessRole` ;
- le contrôleur backend `DashboardController` porte
  `@Roles(AccessRole.ADMIN)`.

Un utilisateur `EMPLOYEE` authentifié qui ouvre la page racine est redirigé
vers `/my-attendance`. Un utilisateur sans session valide est redirigé vers
`/login`.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/backend/src/modules/dashboard/dashboard.controller.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

### 1.3 Source des données

La page appelle `getDashboardData(token)`. Cette fonction effectue une requête
authentifiée vers :

```text
GET /api/v1/dashboard/overview
```

Le contrôleur délègue le calcul à `DashboardService.getOverview()`. Le service
interroge Prisma pour agréger :

- les employés actifs ;
- les employés actifs affectés à un planning ;
- les pointages du jour ;
- les pointages du mois ;
- les activités de présence récemment modifiées ;
- le calendrier RH pour déterminer les jours non ouvrés.

Références :
`apps/frontend/lib/api.ts`,
`apps/backend/src/modules/dashboard/dashboard.controller.ts`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`,
`apps/backend/src/modules/dashboard/dashboard.types.ts`.

## 2. Accès

### 2.1 Parcours réel

Le parcours normal d'un administrateur est :

```text
+---------------------------+
| Connexion                 |
| /login                    |
+-------------+-------------+
              |
              | rôle ADMIN
              v
+---------------------------+
| Dashboard                 |
| /                         |
+---------------------------+
```

Après une authentification réussie sans autre destination interne demandée, le
rôle `ADMIN` est dirigé vers `/`. Le rôle `EMPLOYEE` est dirigé vers
`/my-attendance`.

Références :
`apps/frontend/lib/redirect.ts`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/app/dashboard/page.tsx`.

### 2.2 Contrôles avant affichage

La page exécute les contrôles suivants dans cet ordre :

1. `requireCurrentUser()` récupère le cookie de session et demande
   l'utilisateur courant à l'API.
2. Sans utilisateur valide, la navigation est redirigée vers `/login`.
3. Si `accessRole` n'est pas `ADMIN`, la navigation est redirigée vers
   `/my-attendance`.
4. Le jeton de session est relu.
5. Sans jeton, la navigation est redirigée vers `/login`.
6. Les données du tableau de bord sont demandées avec ce jeton.
7. Le contenu est rendu après réception de la réponse.

Le backend vérifie le bearer token avant le rôle `ADMIN`.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/lib/auth.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

### 2.3 En-tête après accès

Une fois la page chargée, son en-tête affiche :

| Élément | Valeur affichée |
| --- | --- |
| Date | Date du tableau de bord formatée en français |
| Salutation | Prénom de l'administrateur |
| Contexte | « Vue operationnelle du jour » |
| Session active | Prénom et nom |
| Rôle | Valeur de `accessRole` |
| Synchronisation | Date et heure de `generatedAt` |
| Organisation | Département ou « Administration Konatech » |

L'en-tête contient également la navigation administrateur et le bouton
`Se déconnecter`.

Référence : `apps/frontend/app/dashboard/page.tsx`.

## 3. Vue d'ensemble

### 3.1 Cartes de synthèse quotidiennes

La première zone de synthèse contient exactement cinq cartes :

| Carte | Donnée utilisée | Texte complémentaire |
| --- | --- | --- |
| Présents planifiés | `scheduledPresentToday` | Présences sur jours ouvrés |
| Travail jour non ouvré | `nonWorkingDayWorkToday` | Présences exceptionnelles |
| Retards aujourd'hui | `lateEmployeesToday` | Priorité |
| Absences aujourd'hui | `absentEmployeesToday` | Sans pointage |
| Départs anticipés aujourd'hui | `earlyExitToday` | Sorties avant horaire |

Chaque carte affiche le libellé de période `Situation RH`, une valeur numérique,
un badge visuel et un texte complémentaire.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/components/dashboard/metric-card.tsx`.

### 3.2 Calcul des indicateurs du jour

Le backend calcule les cinq valeurs affichées de la manière observable
suivante :

| Indicateur | Calcul observé |
| --- | --- |
| Présents planifiés | Pointages des employés planifiés avec une arrivée et un statut différent de `ABSENT` |
| Travail jour non ouvré | Pointages du jour au statut `NON_WORKING_DAY_WORK` avec une arrivée |
| Retards | Pointages du jour dont `minutesLate` est supérieur à zéro |
| Absences | Employés planifiés sans pointage, avec statut `ABSENT` ou sans heure d'arrivée |
| Départs anticipés | Pointages du jour dont `earlyExit` vaut `true` |

Pour déterminer les employés attendus, le service conserve les employés actifs
qui possèdent un planning actif applicable au jour consulté. Si le calendrier
RH considère la date comme non ouvrée, aucun employé n'est retenu comme
planifié pour ce calcul.

Référence :
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 3.3 Alertes du jour

La carte `Alertes du jour` transforme l'activité récente correspondant à la
date du tableau de bord en alertes :

| Type d'alerte | Condition observée |
| --- | --- |
| Absence | Statut `ABSENT` ou compteur d'absence supérieur à zéro |
| Retard | Nombre de minutes de retard supérieur à zéro |
| Départ anticipé | Indicateur ou nombre de minutes de départ anticipé |
| Sortie manquante | Statut `INCOMPLETE` ou arrivée sans sortie |

Une même activité peut produire plusieurs alertes lorsque plusieurs conditions
sont remplies. Les alertes sont triées par priorité dans l'ordre absence,
retard, départ anticipé, sortie manquante, puis limitées aux cinq premières.

Chaque alerte affiche :

- le type ;
- le nom de l'employé ;
- son identifiant ;
- son département ou `Sans département` ;
- le détail disponible en minutes.

L'en-tête affiche le nombre d'alertes rendues.

Référence :
`apps/frontend/components/dashboard/daily-alerts-card.tsx`.

### 3.4 Activité récente

La zone intitulée `Activité en direct` affiche les événements de pointage
fournis dans `recentActivity`.

Pour chaque élément, le composant détermine :

- le type `Entrée`, `Sortie` ou `Absence` ;
- le nom de l'employé ;
- son département ou `Sans département` ;
- l'heure d'arrivée ou de sortie utilisée ;
- un statut fonctionnel.

Les statuts visibles peuvent être :

- `À l'heure` ;
- `Retard` avec sa durée ;
- `Départ anticipé` avec sa durée ;
- `Heures supp` avec sa durée ;
- `Travail jour non ouvré`, éventuellement avec sa durée ;
- `Absence` ;
- `Pointage incomplet`.

Le composant trie les éléments par heure décroissante et en limite l'affichage
à dix. Le backend ne retourne toutefois que cinq enregistrements de pointage
récents, triés par date de modification puis de création décroissante. Dans le
flux actuel, la liste visible contient donc au maximum cinq enregistrements.

Références :
`apps/frontend/components/dashboard/recent-activity-list.tsx`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 3.5 Indicateurs mensuels

La section `Synthèse du mois` affiche quatre cartes :

| Carte | Valeur visible |
| --- | --- |
| Retards du mois | Cumul des minutes du classement disponible ou nombre d'occurrences disponibles |
| Absences du mois | `absenceCountThisMonth` |
| Heures supplémentaires | `overtimeHoursThisMonth`, formaté en heures |
| Départs anticipés | `earlyExitCount` |

La valeur visible des retards est calculée dans le frontend à partir des
entrées du classement `topLateEmployees`. Elle représente donc le cumul du
classement disponible, lequel est limité à cinq employés, et non un compteur
mensuel global distinct.

Les heures sont affichées avec au plus deux décimales. Lorsque la valeur reçue
n'est pas un nombre fini, le formateur affiche `N/A`.

Références :
`apps/frontend/components/dashboard/dashboard-analytics-section.tsx`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 3.6 Classements RH

La zone `Classements RH` contient trois cartes :

| Classement | Mesure affichée |
| --- | --- |
| Top retards | Minutes de retard cumulées, occurrences et moyenne |
| Top heures supplémentaires | Heures supplémentaires cumulées |
| Top départs anticipés | Minutes cumulées et nombre d'occurrences |

Chaque classement affiche au maximum cinq employés, avec :

- leur position ;
- leur nom ;
- leur département ou `Sans département` ;
- la valeur associée ;
- les précisions disponibles pour les retards et départs anticipés.

Le backend agrège ces classements sur le mois courant et demande au plus cinq
groupes par classement.

Références :
`apps/frontend/components/dashboard/dashboard-analytics-section.tsx`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 3.7 Statistiques calculées mais non affichées

La réponse du backend contient d'autres données dans `summary` et `analytics`,
notamment :

- le nombre total d'employés actifs ;
- le nombre total de présences du jour ;
- les heures supplémentaires du jour ;
- le nombre total de pointages du jour ;
- les taux de présence, retard et absence ;
- des compteurs de vérification GPS et historiques ;
- le travail hors planning.

La page actuelle ne transmet pas ces champs à un composant visuel. Ils ne sont
donc pas affichés dans le tableau de bord rendu par `app/page.tsx`.

Références :
`apps/backend/src/modules/dashboard/dashboard.types.ts`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`,
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/components/dashboard/dashboard-analytics-section.tsx`.

### 3.8 Raccourcis

La section `Actions rapides` présente quatre actions :

| Action | Comportement |
| --- | --- |
| QR Pointage | Ouvre ou ferme la carte du terminal de pointage |
| Exporter un rapport | Ouvre `/exports` |
| Créer un employé | Ouvre `/employees` |
| Créer un planning | Ouvre `/schedules` |

La carte QR :

- génère un aperçu du poster dans le navigateur ;
- affiche le lien public du terminal ;
- ouvre ce lien dans un nouvel onglet ;
- permet de télécharger le poster au format PDF ;
- affiche un retour de succès ou d'échec de génération et de téléchargement.

Le lien utilisé est construit à partir de `NEXT_PUBLIC_APP_URL` lorsqu'il est
disponible. Hors production, si cette origine publique n'est pas définie, la
page fournit d'abord le chemin `/attendance-entry`, ensuite normalisé avec
l'origine du navigateur par le composant client.

Références :
`apps/frontend/components/dashboard/quick-actions-section.tsx`,
`apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`,
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/lib/api.ts`.

## 4. Navigation

### 4.1 Menu administrateur

Le tableau de bord affiche la navigation administrateur complète :

| Groupe | Lien | Route |
| --- | --- | --- |
| Pilotage | Tableau de bord | `/` |
| Pointages | Historique RH | `/attendance-history` |
| Pointages | Exports PDF | `/exports` |
| Équipe | Employés | `/employees` |
| Équipe | Plannings | `/schedules` |
| Règles RH | Calendrier RH | `/calendar` |
| Règles RH | Sanctions RH | `/sanctions` |

Sur cette page, le lien `Tableau de bord` est marqué comme actif.

Référence :
`apps/frontend/components/admin/admin-nav.tsx`,
`apps/frontend/app/dashboard/page.tsx`.

### 4.2 Liens des actions rapides

Les liens des actions rapides ne pointent pas vers une sous-section précise
d'un formulaire :

- `Créer un employé` ouvre la page générale `/employees` ;
- `Créer un planning` ouvre la page générale `/schedules` ;
- `Exporter un rapport` ouvre la page générale `/exports`.

Le terminal QR est affiché dans la page sans navigation. Son URL publique
constitue ensuite un lien distinct vers `/attendance-entry`.

Référence :
`apps/frontend/components/dashboard/quick-actions-section.tsx`.

### 4.3 Déconnexion

Le bouton `Se déconnecter` soumet un formulaire `POST` à
`/api/auth/logout`. La route serveur efface les cookies de session général et
de terminal, puis redirige vers `/login`.

Références :
`apps/frontend/components/auth/logout-form.tsx`,
`apps/frontend/app/api/auth/logout/route.ts`.

### 4.4 Absence de navigation depuis les cartes

Les cinq cartes quotidiennes, les alertes, les événements récents, les cartes
mensuelles et les lignes de classement ne contiennent pas de lien ni d'action
de navigation. Elles présentent uniquement les informations calculées.

Les navigations disponibles depuis le tableau de bord sont donc celles du menu,
des actions rapides, du lien du terminal QR et de la déconnexion.

Références :
`apps/frontend/components/dashboard/metric-card.tsx`,
`apps/frontend/components/dashboard/daily-alerts-card.tsx`,
`apps/frontend/components/dashboard/recent-activity-list.tsx`,
`apps/frontend/components/dashboard/dashboard-analytics-section.tsx`.

## 5. Actualisation des données

### 5.1 Chargement

La route racine est déclarée avec :

```text
dynamic = force-dynamic
```

La page est donc rendue dynamiquement. Pendant son chargement, le fichier
`apps/frontend/app/loading.tsx` affiche une interface de squelettes composée
de zones d'en-tête, de cartes de métriques et de blocs d'activité.

Le chargement ne présente pas de données précédemment mises en cache par le
composant du tableau de bord.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/app/loading.tsx`.

### 5.2 Récupération des données

Après validation de la session, le serveur frontend appelle :

```text
getDashboardData(token)
        |
        v
GET /dashboard/overview
        |
        v
DashboardService.getOverview()
        |
        v
Prisma et CalendarService
```

`requestApi` place le JWT dans l'en-tête `Authorization`. `fetchServerApi`
construit l'URL du backend et utilise `cache: no-store` en l'absence d'une
autre valeur.

Le backend lance plusieurs lectures Prisma en parallèle pour construire la
synthèse, les données mensuelles et l'activité récente. Il renvoie
`generatedAt`, utilisé dans le badge `Sync`.

Références :
`apps/frontend/lib/api.ts`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`,
`apps/frontend/app/dashboard/page.tsx`.

### 5.3 Rafraîchissement

Les données sont récupérées lors du rendu de la page. Une nouvelle navigation
ou un rechargement de `/` déclenche une nouvelle récupération sans cache du
tableau de bord.

Aucun mécanisme périodique de rafraîchissement, aucune connexion temps réel,
aucun bouton général `Actualiser` et aucun appel de polling ne sont présents
dans la page ou ses composants.

Le libellé `Activité en direct` est le titre visuel du composant ; le composant
ne met pas lui-même les données à jour après le rendu.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/lib/api.ts`,
`apps/frontend/components/dashboard/recent-activity-list.tsx`.

### 5.4 Gestion des erreurs

Si la requête API retourne un statut d'échec, `requestApi` lève une
`ApiRequestError` contenant le message analysé et le statut.

Une erreur non traitée pendant le rendu active la page d'erreur racine. Cette
page affiche :

- le badge `Erreur de rendu` ;
- le contexte `Tableau de bord` ;
- le titre indiquant que le tableau de bord n'a pas pu s'afficher ;
- le message de l'erreur ;
- le bouton `Réessayer` ;
- le bouton `Recharger la page`.

`Réessayer` appelle la fonction de réinitialisation fournie à la frontière
d'erreur. `Recharger la page` navigue vers `/`.

Références :
`apps/frontend/lib/api.ts`,
`apps/frontend/app/error.tsx`.

### 5.5 États de chargement des actions locales

La carte QR possède son propre état de préparation :

- le bouton de téléchargement est désactivé tant que le poster n'est pas
  généré ;
- le canevas porte l'état `aria-busy` pendant la génération ;
- un échec de QR laisse le lien public visible ;
- le téléchargement affiche ensuite un message de succès ou d'échec.

Les autres zones du tableau de bord ne déclenchent pas d'opération
asynchrone locale : elles affichent les données déjà reçues par la page.

Référence :
`apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`.

## 6. Comportements observés

### 6.1 Absence d'alertes

Lorsque aucune alerte n'est produite, la carte affiche :

- le compteur `0 alerte(s)` ;
- le titre `Aucune alerte RH aujourd'hui` ;
- le texte `Aucun événement RH à surveiller pour le moment.`.

Référence :
`apps/frontend/components/dashboard/daily-alerts-card.tsx`.

### 6.2 Absence d'activité récente

Lorsque `recentActivity` ne produit aucun élément, la section affiche :

- le compteur `0 événement(s)` ;
- le titre `Aucune activité récente` ;
- le texte indiquant que les derniers pointages apparaîtront lorsqu'ils seront
  disponibles.

Référence :
`apps/frontend/components/dashboard/recent-activity-list.tsx`.

### 6.3 Absence de données de classement

Chaque classement dont le tableau d'employés est vide affiche
`Aucune donnée disponible`.

Les indicateurs numériques quotidiens et mensuels ne sont pas masqués lorsque
leur valeur est nulle : les cartes affichent la valeur `0`. Les taux calculés
par le backend retournent également zéro lorsque leur dénominateur n'est pas
positif, mais ces taux ne sont pas rendus par la page actuelle.

Références :
`apps/frontend/components/dashboard/dashboard-analytics-section.tsx`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 6.4 Erreur de récupération

La page ne conserve pas une version partielle du tableau de bord lorsqu'un
appel à `dashboard/overview` échoue. L'exception atteint la frontière d'erreur
racine, qui remplace le contenu par son écran d'erreur et ses deux actions.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/lib/api.ts`,
`apps/frontend/app/error.tsx`.

### 6.5 Accès refusé et redirections

| Situation | Comportement observable |
| --- | --- |
| Aucun cookie de session | Redirection vers `/login` |
| Jeton invalide ou expiré lors de `auth/me` | Utilisateur considéré absent, puis redirection vers `/login` |
| Utilisateur `EMPLOYEE` | Redirection vers `/my-attendance` |
| Appel direct de l'API sans bearer token valide | Réponse non autorisée du guard JWT |
| Appel direct avec rôle autre que `ADMIN` | Réponse interdite du guard de rôles |
| Déconnexion | Cookies effacés puis redirection vers `/login` |

Références :
`apps/frontend/lib/auth.ts`,
`apps/frontend/app/dashboard/page.tsx`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/frontend/app/api/auth/logout/route.ts`.

### 6.6 Date et période

Le backend utilise la date courante du serveur par défaut. Il normalise cette
date avec les utilitaires de présence pour définir :

- le début et la fin de la journée ;
- le début et la fin du mois ;
- la période de calcul des absences.

Le frontend affiche la date du tableau de bord et le mois correspondant aux
données calculées. Aucun sélecteur de date ou de mois n'est présent sur le
tableau de bord.

Références :
`apps/backend/src/modules/dashboard/dashboard.service.ts`,
`apps/backend/src/common/utils/attendance-date.util.ts`,
`apps/frontend/app/dashboard/page.tsx`.

## 7. Traçabilité

| Fonctionnalité | Élément observable | Fichiers concernés |
| --- | --- | --- |
| Page racine | Tableau de bord administrateur | `apps/frontend/app/dashboard/page.tsx` |
| Accès authentifié | Lecture de la session et de l'utilisateur | `apps/frontend/lib/auth.ts` |
| Redirection par rôle | `ADMIN` vers `/`, `EMPLOYEE` vers son espace | `apps/frontend/lib/redirect.ts`, `apps/frontend/app/dashboard/page.tsx` |
| Endpoint dashboard | `GET dashboard/overview` réservé à `ADMIN` | `apps/backend/src/modules/dashboard/dashboard.controller.ts` |
| Agrégation des données | Requêtes Prisma et calculs | `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Contrat backend | Types de synthèse, analyses et activité | `apps/backend/src/modules/dashboard/dashboard.types.ts` |
| Contrat frontend | Types et fonction `getDashboardData` | `apps/frontend/lib/api.ts` |
| Cartes quotidiennes | Cinq métriques construites par la page | `apps/frontend/app/dashboard/page.tsx`, `apps/frontend/components/dashboard/metric-card.tsx` |
| Alertes du jour | Transformation de l'activité récente | `apps/frontend/components/dashboard/daily-alerts-card.tsx` |
| Activité récente | Entrées, sorties, absences et statuts | `apps/frontend/components/dashboard/recent-activity-list.tsx` |
| Synthèse mensuelle | Quatre cartes mensuelles | `apps/frontend/components/dashboard/dashboard-analytics-section.tsx` |
| Classement retards | Top cinq par minutes | `apps/frontend/components/dashboard/dashboard-analytics-section.tsx`, `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Classement heures supplémentaires | Top cinq par heures | `apps/frontend/components/dashboard/dashboard-analytics-section.tsx`, `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Classement départs anticipés | Top cinq par minutes | `apps/frontend/components/dashboard/dashboard-analytics-section.tsx`, `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Actions rapides | QR, export, employé et planning | `apps/frontend/components/dashboard/quick-actions-section.tsx` |
| Poster QR | Génération, aperçu, lien et PDF | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` |
| Navigation administrateur | Groupes et liens | `apps/frontend/components/admin/admin-nav.tsx` |
| Déconnexion | Formulaire et route serveur | `apps/frontend/components/auth/logout-form.tsx`, `apps/frontend/app/api/auth/logout/route.ts` |
| Chargement | Interface de squelettes | `apps/frontend/app/loading.tsx` |
| Erreur | Message, nouvelle tentative et rechargement | `apps/frontend/app/error.tsx` |
| Absence de données | État vide partagé | `apps/frontend/components/admin/admin-empty-state.tsx` |
| Requête sans cache | `fetchServerApi` avec `cache: no-store` | `apps/frontend/lib/api.ts` |
| Jours non ouvrés | Consultation du calendrier RH | `apps/backend/src/modules/dashboard/dashboard.service.ts`, `apps/backend/src/modules/calendar/calendar.service.ts` |

## 8. Observations

### 8.1 Composants existants et utilisés

Les composants de tableau de bord effectivement importés par la page sont :

- `AdminNav` ;
- `LogoutForm` ;
- `MetricCard` ;
- `DailyAlertsCard` ;
- `QuickActionsSection` ;
- `AttendanceEntryQrCard`, utilisé par les actions rapides ;
- `RecentActivityList` ;
- `DashboardAnalyticsSection` ;
- `PageShell`.

`ConnectionPanel` et `ModuleCard` existent dans le répertoire des composants
du tableau de bord, mais ne sont importés ni rendus par la page actuelle.
`MonthlyAttendanceExportCard` existe également dans ce répertoire, mais il est
rendu par la page `/exports`, pas par le tableau de bord.

Références :
`apps/frontend/app/dashboard/page.tsx`,
`apps/frontend/components/dashboard/connection-panel.tsx`,
`apps/frontend/components/dashboard/module-card.tsx`,
`apps/frontend/app/exports/page.tsx`.

### 8.2 Comportements observés

- La page est rendue côté serveur de manière dynamique.
- La requête de données utilise un JWT et ne conserve pas de réponse en cache
  par défaut.
- La date de synchronisation affichée correspond à `generatedAt` fourni par le
  backend.
- Les alertes sont dérivées du sous-ensemble d'activités récentes fourni par le
  backend.
- Une activité peut générer plusieurs alertes.
- Les absences quotidiennes dépendent des employés planifiés et du calendrier
  RH.
- Les classements sont limités aux cinq premiers employés.
- Le QR et son poster PDF sont générés dans le navigateur.
- Les cartes d'information ne modifient aucune donnée.

### 8.3 Limitations visibles

Les limites suivantes sont observables dans le code :

- aucun rafraîchissement automatique périodique ;
- aucun flux temps réel ;
- aucun bouton général d'actualisation hors écran d'erreur ;
- aucun sélecteur de date ou de période sur la page ;
- aucune navigation depuis les métriques, alertes, activités ou classements ;
- activité récente limitée à cinq pointages par la requête backend ;
- alertes calculées uniquement à partir de ces activités récentes et limitées
  à cinq alertes visibles ;
- valeur des retards mensuels construite à partir du classement disponible ;
- plusieurs statistiques retournées par l'API ne sont pas rendues ;
- compteurs de tentatives de pointage bloquées renvoyés à `null` par le
  service ;
- aucun état partiel lorsque la récupération globale échoue ;
- aucun paramètre utilisateur de personnalisation des cartes ou de leur ordre.

Ces constats décrivent uniquement le tableau de bord présent dans le dépôt.
