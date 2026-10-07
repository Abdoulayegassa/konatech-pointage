Document ID : AG-003  
Titre : Tableau de bord  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

> **Périmètre actuel :** `/dashboard` est le tableau de bord agrégé de l'organisation, pas celui d'un site particulier. Les sites ont leur propre dashboard et contexte opérationnel sous `/site/[siteId]/...`. Le `siteId` est un contexte de navigation, jamais une autorisation; le backend vérifie indépendamment l'organisation et le site.

# 1. Présentation

Le tableau de bord administrateur fournit une vue opérationnelle du jour. La page agrège les indicateurs de présence, les alertes RH, l’activité récente et une synthèse mensuelle à partir de l’API Dashboard.

# 2. Accès au tableau de bord

Le dashboard de l'organisation est accessible à `/dashboard` pour un `ADMIN` ENTREPRISE authentifié. La route racine `/` redirige l'utilisateur courant vers `/dashboard` ou `/my-attendance` selon son rôle; l’absence de session entraîne une redirection vers `/login`. Le dashboard agrège les données de l'organisation et n'est pas limité à un site sélectionné.

La page appelle ensuite `GET /dashboard/overview` avec le jeton de session. Le contrôleur NestJS applique également le rôle `ADMIN` au contrôleur `dashboard`.

# 3. Vue d'ensemble

Au chargement, la page affiche :

- la date du tableau de bord et le message d’accueil de l’administrateur ;
- une carte « Session active » avec le nom, le rôle, le département et l’horodatage `Sync` ;
- cinq indicateurs journaliers ;
- les alertes du jour ;
- les actions rapides ;
- l’activité en direct ;
- la synthèse et les classements RH du mois.

# 4. Indicateurs disponibles

| Indicateur | Description |
|---|---|
| Présents planifiés | Nombre de présences sur les jours ouvrés planifiés pour la journée. |
| Travail jour non ouvré | Nombre de présences exceptionnelles enregistrées un jour non ouvré. |
| Retards aujourd’hui | Nombre d’employés en retard pour la journée. |
| Absences aujourd’hui | Nombre d’employés planifiés sans pointage pour la journée. |
| Départs anticipés aujourd’hui | Nombre de départs avant l’horaire prévu pour la journée. |
| Retards du mois | Cumul des minutes de retard du classement disponible ou, à défaut, nombre d’occurrences disponibles. |
| Absences du mois | Nombre d’absences consolidées sur le mois. |
| Heures supplémentaires | Cumul mensuel des heures supplémentaires. |
| Départs anticipés | Nombre d’occurrences mensuelles de départ anticipé. |

La synthèse mensuelle présente également trois classements : « Top retards », « Top heures supplémentaires » et « Top départs anticipés ». Les lignes affichent le nom de l’employé, son département et la valeur calculée; les retards affichent aussi le nombre d’occurrences et la moyenne en minutes, et les départs anticipés le nombre d’occurrences.

# 5. Activité récente

La section « Alertes du jour » examine l’activité récente de la date affichée et peut présenter au maximum cinq alertes parmi les catégories suivantes : absence, retard, départ anticipé et sortie manquante. Chaque alerte affiche l’employé, son identifiant, son département et un détail lorsque celui-ci est calculé.

La section « Activité en direct » affiche les derniers événements transmis par l’API, avec le type d’événement, l’employé, son département, le statut et l’heure. Le service Dashboard sélectionne cinq enregistrements récents pour cette liste.

Lorsque les listes sont vides, l’interface affiche respectivement « Aucune alerte RH aujourd’hui » et « Aucune activité récente ».

# 6. Actualisation des données

La page du tableau de bord est déclarée `force-dynamic` et charge les données lors de la génération de la page. L’horodatage `Sync` correspond au champ `generatedAt` retourné par l’API. Aucun mécanisme de rafraîchissement périodique côté page n’est présent dans `apps/frontend/app/dashboard/page.tsx`.

# 7. Limitations

- Aucun filtre, tri ou contrôle de période n’est présent dans la page du tableau de bord.
- La vue dépend de la réponse `GET /dashboard/overview` et d’une session administrateur valide.
- Les alertes sont dérivées de l’activité récente fournie par l’API et sont limitées à cinq éléments côté composant.
- Les actions rapides visibles renvoient vers `/exports`, `/employees` et `/schedules`; le QR de pointage ouvre `/attendance-entry` ou l’URL publique configurée.

# 8. Références

| Élément documenté | Fichier source |
|---|---|
| Route, contrôle du rôle, chargement et indicateurs journaliers | `apps/frontend/app/dashboard/page.tsx` |
| Navigation administrateur | `apps/frontend/components/admin/admin-nav.tsx` |
| Appel API Dashboard | `apps/frontend/lib/api.ts` |
| Route backend et rôle requis | `apps/backend/src/modules/dashboard/dashboard.controller.ts` |
| Calcul des agrégats, activité récente et synthèse mensuelle | `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Cartes d’indicateurs | `apps/frontend/components/dashboard/metric-card.tsx` |
| Alertes du jour | `apps/frontend/components/dashboard/daily-alerts-card.tsx` |
| Activité récente | `apps/frontend/components/dashboard/recent-activity-list.tsx` |
| Synthèse et classements mensuels | `apps/frontend/components/dashboard/dashboard-analytics-section.tsx` |
| Actions rapides et QR de pointage | `apps/frontend/components/dashboard/quick-actions-section.tsx`, `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` |
