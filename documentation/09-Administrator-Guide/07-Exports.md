Document ID : AG-007  
Titre : Exports  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# 1. Présentation

Le module d’export génère un rapport mensuel de présence à partir des données Attendance. Le rapport peut couvrir toute l’équipe ou un employé sélectionné.

# 2. Accès

L’interface est accessible à la route frontend `/exports`, depuis l’entrée « Exports PDF » de la navigation administrateur. La page exige une session `ADMIN`; un autre rôle est redirigé vers `/my-attendance` et l’absence de jeton vers `/login`.

Le formulaire « Rapport mensuel RH » appelle `GET /attendance/exports/monthly` via la route frontend `/api/attendance/exports/monthly`.

# 3. Formats disponibles

| Format | Disponibilité | Description |
|---|---|---|
| PDF | Disponible dans l’interface `/exports` | Rapport mensuel RH téléchargeable pour l’équipe ou un employé. |
| CSV | Disponible dans l’API | Export tabulaire produit lorsque le paramètre `format` vaut `csv` ou n’est pas fourni. |

# 4. Paramètres d’export

Le formulaire permet de choisir :

- `month` : mois numérique de 1 à 12 ;
- `year` : année comprise entre 2000 et 2100 ;
- `employeeId` : identifiant UUID facultatif. Sans identifiant, le rapport porte sur l’équipe; avec identifiant, il porte sur l’employé sélectionné.

L’interface envoie toujours `format=pdf`. Le DTO backend accepte `pdf` ou `csv`.

# 5. Contenu du fichier exporté

Le CSV contient une ligne par employé et les colonnes suivantes :

| Donnée exportée | Description |
|---|---|
| Full Name | Nom complet. |
| Employee Identifier | Identifiant employé. |
| Department | Département. |
| Assigned Schedule | Planning affecté. |
| Working Days | Jours ouvrés. |
| Scheduled Presence Days | Jours de présence planifiés. |
| Total Worked Days | Total des jours travaillés. |
| Outside Schedule Work Days | Jours travaillés hors planning. |
| Entries / Exits | Nombre d’entrées et de sorties. |
| Late Days / Absent Days | Jours en retard et jours absents. |
| Absence Count | Nombre d’absences. |
| Incomplete Attendance Days | Jours de pointage incomplet. |
| Total Worked Hours | Total des heures travaillées. |
| Depart anticipe (jours) / Depart anticipe (min) | Jours et minutes de départ anticipé. |
| Scheduled Overtime Hours | Heures supplémentaires planifiées. |
| Outside Schedule Overtime Hours | Heures supplémentaires hors planning. |
| Heures supplementaires | Total des heures supplémentaires. |

Le PDF contient, selon le périmètre, les informations d’identité et de planning, les indicateurs mensuels de présence, absence, retards, départs anticipés et heures supplémentaires, les éléments de sanctions et une table journalière. Cette table journalière contient la date, l’entrée, la sortie, le statut, le retard et une remarque composée du jour et du libellé de vérification GPS.

# 6. Génération du fichier

Après validation du mois et de l’année, l’interface envoie la requête et reçoit un fichier binaire. Le nom retourné par `Content-Disposition` est utilisé pour le téléchargement; à défaut, l’interface construit un nom PDF à partir du périmètre, du mois et de l’année. Un message de succès est affiché après le téléchargement et un message d’erreur reprend la réponse de l’API en cas d’échec.

Le contrôleur construit le rapport mensuel, sélectionne le générateur PDF ou CSV, définit le type MIME et renvoie le fichier en téléchargement. L’action d’export est enregistrée dans l’audit administrateur.

# 7. Limitations

- L’écran `/exports` expose uniquement le téléchargement PDF; le CSV est présent au niveau de l’API.
- Le périmètre est limité à un mois et une année, avec sélection de l’équipe ou d’un seul employé.
- Les données exportées dépendent des pointages, plannings, calendriers et sanctions présents pour la période demandée.
- Le DTO d’export n’accepte que les valeurs `csv` et `pdf` pour le paramètre `format`.

# 8. Références

| Élément documenté | Fichier source |
|---|---|
| Page et accès administrateur | `apps/frontend/app/exports/page.tsx` |
| Formulaire, paramètres et téléchargement PDF | `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx` |
| Navigation « Exports PDF » | `apps/frontend/components/admin/admin-nav.tsx` |
| Route API, sélection du format et en-têtes de téléchargement | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Validation des paramètres | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| Construction des données mensuelles | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` |
| Colonnes et génération CSV | `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts` |
| Mise en page et contenu PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Types de lignes et rapports exportés | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.types.ts` |
