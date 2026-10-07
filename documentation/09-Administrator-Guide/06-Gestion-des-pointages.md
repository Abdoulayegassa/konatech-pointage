Document ID : AG-006  
Titre : Gestion des pointages  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# 1. Présentation

Le module de gestion des pointages fournit à l’administrateur l’historique RH mensuel, des filtres de consultation, un résumé calculé sur les enregistrements visibles et une fiche détaillée pour chaque pointage.

# 2. Accès au module

Le module est accessible à la route frontend `/attendance-history`, depuis l’entrée « Historique RH » de la navigation administrateur. La page exige une session `ADMIN`; un autre rôle est redirigé vers `/my-attendance` et l’absence de jeton vers `/login`.

Au chargement, la page demande l’historique du mois courant via `GET /attendance/history?month=YYYY-MM` et charge aussi les employés afin d’alimenter les filtres.

# 3. Consultation des pointages

La table affiche la date, l’employé et son identifiant, le département, l’heure d’entrée, l’heure de sortie, le retard, le départ anticipé, les heures supplémentaires, l’état GPS, la présence d’un selfie, un aperçu du commentaire et le statut.

Les filtres disponibles sont la période (`Aujourd’hui`, `Cette semaine`, `Ce mois`), l’employé, le département et un ou plusieurs statuts. Le bouton d’application met à jour la liste et le résumé; « Réinitialiser » restaure les filtres par défaut.

Le résumé de la période filtrée calcule le nombre de pointages, les retards, les absences, les départs anticipés, les heures supplémentaires et le travail un jour non ouvré.

# 4. Détails d'un pointage

Cliquer sur une ligne ouvre la « Fiche Pointage ». Elle affiche :

- l’identité de l’employé, son département et la date ;
- le statut, le retard, le départ anticipé et les heures supplémentaires ;
- l’analyse disciplinaire lorsqu’elle est disponible, avec la règle, la décision, le montant et le statut ;
- le type de pointage, l’heure d’entrée et l’heure de sortie ;
- le planning appliqué, ses horaires prévus et sa marge de retard lorsqu’ils sont disponibles ;
- les informations GPS capturées et leur statut de validation ;
- le commentaire et le selfie de vérification lorsqu’ils existent ;
- les dates de création et de mise à jour ainsi que l’identifiant du pointage.

# 5. Statuts des pointages

| Statut | Description |
|---|---|
| À l’heure | Pointage sans retard, absence, départ anticipé ni heures supplémentaires détectés par l’affichage. |
| Retard | Le champ de retard du pointage est supérieur à zéro. |
| Heures supplémentaires | Le pointage comporte des heures ou minutes supplémentaires. |
| Départ anticipé | Le départ anticipé est indiqué ou comporte des minutes associées. |
| Pointage incomplet | Le statut est incomplet ou une entrée existe sans sortie. |
| Absent | Aucune entrée ni sortie n’est enregistrée, avec le statut d’absence correspondant. |
| Travail jour non ouvré | Le statut est `NON_WORKING_DAY_WORK`. |

# 6. Historique

L’historique chargé initialement est celui du mois courant. Les périodes et statuts sont filtrés dans le composant frontend sur les enregistrements reçus. Lorsque le filtre ne renvoie aucun enregistrement, l’interface affiche « Aucun pointage trouvé. ».

Le backend expose aussi `GET /attendance/summary` pour le résumé du jour et des routes administrateur `POST /attendance/check-in` et `POST /attendance/check-out`; aucun bouton correspondant n’est présent dans la page d’historique analysée.

# 7. Limitations

- L’historique est chargé pour le mois courant au premier affichage; les filtres de période ne déclenchent pas une nouvelle requête API.
- Aucun mécanisme de modification ou de suppression d’un pointage n’est présent dans la page d’historique.
- Les informations GPS, selfie, planning et sanction dépendent des données réellement enregistrées pour le pointage.
- Les routes administrateur de pointage direct existent côté API, mais la page de consultation ne fournit pas leur formulaire d’appel.

# 8. Références

| Élément documenté | Fichier source |
|---|---|
| Route, accès administrateur et chargement du mois courant | `apps/frontend/app/attendance-history/page.tsx` |
| Navigation vers l’historique | `apps/frontend/components/admin/admin-nav.tsx` |
| Filtres et périodes | `apps/frontend/components/attendance-history/attendance-history-filters.tsx` |
| Résumé de période et orchestration | `apps/frontend/components/attendance-history/attendance-history-workspace.tsx` |
| Colonnes et statuts affichés | `apps/frontend/components/attendance-history/attendance-history-table.tsx` |
| Fiche détaillée, conformité et sanctions | `apps/frontend/components/attendance-history/attendance-detail-panel.tsx` |
| Types des enregistrements | `apps/frontend/lib/api.ts` |
| Routes Attendance administrateur | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Agrégation de l’historique | `apps/backend/src/modules/attendance/attendance.service.ts` |
