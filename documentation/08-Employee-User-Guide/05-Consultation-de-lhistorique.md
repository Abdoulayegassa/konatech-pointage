Document ID : EUG-005

Titre : Consultation de l'historique

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# 1. Présentation

L'historique employé présente les pointages personnels du mois courant. Il permet de consulter les heures d'entrée et de sortie les plus récentes ainsi que quatre indicateurs calculés pour le mois chargé.

Cette consultation est intégrée à l'espace `/my-attendance`. Elle utilise l'identité de la session pour demander uniquement les pointages de l'employé connecté.

# 2. Accès à l'historique

1. Se connecter sur `/login` avec l'adresse électronique et le mot de passe du compte employé.
2. Après une connexion réussie, l'application redirige le rôle applicatif `EMPLOYEE` vers `/my-attendance`.
3. Faire défiler la page jusqu'aux indicateurs mensuels puis à la section portant les libellés « Récent » et « Historique ».

La page `/my-attendance` est protégée par le cookie de compte `konatech_session`. En l'absence de ce cookie, le middleware redirige vers `/login`. La session PIN de `/attendance-entry` est distincte et la vue fixe de pointage n'affiche pas cette section d'historique.

Le mois demandé est déterminé automatiquement à partir de l'année et du mois UTC courants. L'interface employé ne présente pas de commande permettant de modifier cette période.

# 3. Informations affichées

| Information | Description |
|---|---|
| `ABS.` | Nombre d'absences du mois renvoyé avec la situation du jour. Le backend le calcule à partir du planning actif, des jours non ouvrés et des journées comportant une entrée. |
| `HEURES` | Somme des durées comprises entre l'entrée et la sortie pour les pointages chargés du mois. Un pointage sans entrée ou sans sortie ajoute zéro heure. |
| `DÉPARTS ANT.` | Nombre de pointages du mois portant l'indicateur de départ anticipé avec un nombre de minutes supérieur à zéro. |
| `H. SUPP.` | Somme des valeurs d'heures supplémentaires enregistrées dans les pointages du mois. |
| Nombre de pointages | Badge placé à droite du titre « Historique ». Il indique le nombre total de pointages renvoyés pour le mois courant, même lorsque la liste visible est limitée aux huit plus récents. |
| Date | Jour de la semaine abrégé, jour du mois sur deux chiffres et nom du mois, par exemple selon le format local français produit par le navigateur. |
| Heure d'entrée | Heure de `clockInAt` au format local français, avec heures et minutes. L'absence de valeur est affichée sous la forme `--:--`. |
| Heure de sortie | Heure de `clockOutAt` au format local français, avec heures et minutes. L'absence de valeur est affichée sous la forme `--:--`. |
| `GPS validé` | Badge affiché lorsqu'au moins la vérification d'entrée ou de sortie produit un libellé contenant « GPS valide ». |

Les quatre indicateurs portent sur tous les pointages du mois renvoyés par l'API. La liste sous « Historique » affiche au maximum huit éléments.

# 4. Consultation

Au chargement de `/my-attendance`, le frontend exécute en parallèle deux lectures backend : la situation de présence du jour et l'historique personnel du mois courant. L'appel d'historique utilise `GET /api/v1/attendance/me/history` avec le paramètre `month` au format `YYYY-MM`.

Le backend extrait l'identifiant employé du JWT, puis limite la requête Prisma à cet identifiant et à l'intervalle du mois demandé. Les résultats sont triés par date décroissante, puis par date de création décroissante.

Le frontend conserve cet ordre et sélectionne les huit premiers éléments pour la section visible. Chaque carte de pointage présente la date, l'heure d'entrée, l'heure de sortie et, lorsque le critère est rempli, le badge `GPS validé`.

Les indicateurs sont calculés avant cette réduction à huit éléments :

- `HEURES` additionne, pour chaque pointage complet du mois, la différence entre l'heure de sortie et l'heure d'entrée ;
- `DÉPARTS ANT.` compte les enregistrements marqués comme départ anticipé ;
- `H. SUPP.` additionne le champ `overtimeHours` ;
- `ABS.` utilise le compteur mensuel calculé par le backend.

# 5. Fonctionnalités disponibles

| Fonctionnalité | Disponible | Description |
|---|---|---|
| Consultation des pointages personnels | Oui | L'endpoint `me/history` utilise l'identifiant de l'employé authentifié. |
| Chargement du mois courant | Oui | La page construit automatiquement le mois courant au format `YYYY-MM`. |
| Affichage des pointages récents | Oui | La section affiche au maximum les huit premiers résultats du mois, déjà triés du plus récent au plus ancien. |
| Comptage des pointages mensuels | Oui | Le badge de la section affiche la longueur complète du tableau mensuel renvoyé. |
| Total des heures travaillées | Oui | Le frontend additionne les durées des pointages possédant une entrée et une sortie valides. |
| Comptage des absences | Oui | La situation du jour fournit le compteur mensuel calculé par le backend. |
| Comptage des départs anticipés | Oui | Le frontend compte les enregistrements dont `earlyExit` est actif et `earlyExitMinutes` positif. |
| Total des heures supplémentaires | Oui | Le frontend additionne `overtimeHours` pour l'ensemble du mois chargé. |
| Indication d'une validation GPS | Oui | Un badge conditionnel apparaît sur la carte lorsque la métadonnée de vérification d'entrée ou de sortie correspond au libellé attendu. |
| Nouvelle tentative après une erreur de chargement | Oui | L'écran d'erreur de `/my-attendance` propose « Réessayer » et « Recharger la page ». |

# 6. Cas particuliers

| Situation | Comportement observé | Sources |
|---|---|---|
| Aucun pointage pour le mois courant | La section affiche « Aucun pointage enregistré » puis « Vos derniers pointages apparaîtront ici. ». Le badge indique `0`. | `apps/frontend/app/my-attendance/page.tsx` |
| Plus de huit pointages dans le mois | Le badge conserve le nombre mensuel total, tandis que la liste affiche seulement les huit premiers éléments triés. | `apps/frontend/app/my-attendance/page.tsx`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| Entrée ou sortie absente | L'heure manquante est présentée sous la forme `--:--`. Le calcul des heures travaillées ignore les pointages incomplets. | `apps/frontend/components/attendance/attendance-display.ts` |
| Aucune validation GPS reconnue | La carte reste visible sans badge `GPS validé`. | `apps/frontend/app/my-attendance/page.tsx`, `apps/frontend/components/attendance/attendance-display.ts` |
| Session de compte absente | L'accès à `/my-attendance` redirige vers `/login`. | `apps/frontend/middleware.ts`, `apps/frontend/lib/auth.ts` |
| Session invalide ou expirée | La récupération de l'utilisateur échoue, puis `requireCurrentUser` redirige vers `/login`. | `apps/frontend/lib/auth.ts`, `apps/backend/src/modules/auth/auth.service.ts` |
| Rôle autre que `EMPLOYEE` sur l'endpoint personnel | Le garde de rôles refuse l'accès à `attendance/me/history`. La page `/my-attendance` redirige explicitement le rôle `ADMIN` vers `/`. | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/frontend/app/my-attendance/page.tsx` |
| Erreur pendant le chargement de la page | L'écran indique que les données personnelles de présence n'ont pas pu être chargées et qu'aucun pointage n'a été modifié ; il affiche les actions « Réessayer » et « Recharger la page ». | `apps/frontend/app/my-attendance/error.tsx` |

# 7. Flux de consultation

```text
Employé
   |
   v
/login
   |
   v
Session de compte EMPLOYEE
   |
   v
/my-attendance
   |
   +------------------------------+
   |                              |
   v                              v
Situation du jour        Historique du mois courant
                                  |
                                  v
                    Filtrage backend par employé
                                  |
                                  v
                    Tri du plus récent au plus ancien
                                  |
                 +----------------+----------------+
                 |                                 |
                 v                                 v
        Indicateurs mensuels            Huit pointages récents
```

# 8. Références

| Élément documenté | Fichier source | Preuve observée |
|---|---|---|
| Page employé et historique visible | `apps/frontend/app/my-attendance/page.tsx` | Charge le mois courant, calcule les indicateurs, limite la liste à huit cartes et rend l'état vide. |
| Format des dates et heures | `apps/frontend/components/attendance/attendance-display.ts` | Formate les dates, les heures et les valeurs d'heures pour l'affichage en français. |
| Calcul des heures mensuelles | `apps/frontend/components/attendance/attendance-display.ts` | Calcule une durée uniquement avec une entrée et une sortie valides, puis additionne le mois. |
| Métadonnée de vérification | `apps/frontend/components/attendance/attendance-display.ts` | Construit le libellé de vérification utilisé pour déterminer le badge GPS. |
| Appels frontend | `apps/frontend/lib/api.ts` | Appelle simultanément `/attendance/me/today` et `/attendance/me/history?month=...`. |
| Endpoint d'historique employé | `apps/backend/src/modules/attendance/attendance.controller.ts` | Réserve `me/history` au rôle `EMPLOYEE` et utilise l'identifiant du JWT. |
| Validation du mois | `apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts` | Autorise un paramètre facultatif au format `YYYY-MM`. |
| Sélection et ordre des données | `apps/backend/src/modules/attendance/attendance.service.ts` | Limite la période au mois, filtre par employé et trie par date puis création décroissantes. |
| Champs retournés par Prisma | `apps/backend/src/common/prisma/selects.ts` | Sélectionne les heures, résultats de sortie, absences et métadonnées de vérification utilisées par la vue. |
| Modèle persistant | `apps/backend/prisma/schema.prisma` | Définit les informations du pointage et l'unicité par employé et date. |
| Protection de la route frontend | `apps/frontend/middleware.ts` | Redirige `/my-attendance` vers `/login` sans cookie de compte. |
| Validation de la session | `apps/frontend/lib/auth.ts` | Charge l'utilisateur courant et redirige vers `/login` lorsqu'il est absent. |
| Redirection après connexion | `apps/frontend/lib/redirect.ts` | Associe le rôle `EMPLOYEE` à `/my-attendance`. |
| Contrôle du rôle backend | `apps/backend/src/modules/auth/guards/roles.guard.ts` | Refuse une ressource lorsque le rôle authentifié ne figure pas dans les rôles requis. |
| Écran d'erreur | `apps/frontend/app/my-attendance/error.tsx` | Affiche l'erreur et les actions de nouvelle tentative ou de rechargement. |
| Séparation de l'historique RH | `apps/frontend/app/attendance-history/page.tsx` | Redirige un utilisateur non administrateur vers `/my-attendance`. |
