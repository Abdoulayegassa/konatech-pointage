Document ID : AG-009  
Titre : Paramètres de l'application  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# 1. Présentation

Le dépôt ne contient pas de page ou de menu global nommé « Paramètres ». Les paramètres modifiables depuis l’application sont répartis dans les modules de plannings, du calendrier RH et des règles de sanctions.

# 2. Paramètres disponibles

| Paramètre | Description |
|---|---|
| Planning | Nom, heures de début et de fin, marge de retard, jours actifs et statut actif. |
| Jour RH | Nom, date, type (`PUBLIC_HOLIDAY` ou `COMPANY_HOLIDAY`) et description d’un jour du calendrier. |
| Règle de sanction | Activation, nom, description, seuils de retard, tolérance mensuelle, montant en FCFA et priorité. |
| Mois consulté | Mois affiché dans le calendrier RH et dans la consultation mensuelle des sanctions. |

# 3. Modification

Les plannings sont créés ou modifiés depuis `/schedules`. Le formulaire envoie `POST /schedules` ou `PATCH /schedules/:id`; le statut est modifié séparément par `PATCH /schedules/:id/status`.

Les jours RH sont gérés depuis `/calendar`. Le formulaire envoie `POST /calendar/holidays` pour créer un jour, `PATCH /calendar/holidays/:id` pour le modifier et `DELETE /calendar/holidays/:id` pour le supprimer.

Les règles de sanctions sont consultées depuis `/sanctions?tab=rules`. Le bouton « Modifier » ouvre le formulaire d’édition et envoie `PATCH /sanctions/rules/:id`. L’écran de règles affiche également des règles inactives comme « Prévu plus tard »; le bouton « Désactiver » de cette carte est désactivé dans l’interface.

Le mois affiché est sélectionné par les sélecteurs du calendrier RH et des sanctions; la sélection modifie la route frontend et recharge les données correspondantes.

# 4. Restrictions

- Les paramètres fonctionnels sont accessibles aux comptes dont le rôle est `ADMIN`.
- Un planning doit avoir un nom, une heure de début, une heure de fin postérieure, une marge comprise entre 0 et 180 minutes et au moins un jour actif.
- Un jour RH doit utiliser une date valide et l’un des deux types déclarés par le DTO.
- Les champs numériques d’une règle de sanction sont des entiers positifs ou nuls selon `UpdateSanctionRuleDto`.
- Les modifications de configuration sont validées par les DTO NestJS avant la persistance.

# 5. Limitations

- Aucun écran de paramètres généraux ne permet de modifier depuis l’interface les variables d’environnement, le secret JWT, les durées de session ou la politique GPS.
- Les paramètres de sécurité du pointage sont lus dans la configuration backend et ne disposent pas d’un formulaire d’administration identifié dans le dépôt.
- Les règles de sanctions sont modifiables, mais leur création et leur suppression ne sont pas exposées par le contrôleur; seule la mise à jour d’une règle existante est définie.
- Le paramètre de mois sert à la consultation des données; il ne modifie pas les données persistées.

# 6. Références

| Élément documenté | Fichier source |
|---|---|
| Navigation des modules configurables | `apps/frontend/components/admin/admin-nav.tsx` |
| Formulaire et validations frontend des plannings | `apps/frontend/components/schedules/admin-schedules-manager.tsx`, `apps/frontend/components/schedules/schedule-manager.helpers.ts` |
| DTO et routes des plannings | `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts`, `apps/backend/src/modules/schedules/dto/update-schedule.dto.ts`, `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Page et formulaire du calendrier RH | `apps/frontend/app/calendar/page.tsx`, `apps/frontend/components/calendar/calendar-workspace.tsx` |
| DTO et routes du calendrier | `apps/backend/src/modules/calendar/dto/create-calendar-entry.dto.ts`, `apps/backend/src/modules/calendar/dto/update-calendar-entry.dto.ts`, `apps/backend/src/modules/calendar/calendar.controller.ts` |
| Page et règles de sanctions | `apps/frontend/app/sanctions/page.tsx`, `apps/frontend/components/sanctions/sanction-rules-panel.tsx` |
| DTO et routes des règles | `apps/backend/src/modules/sanctions/dto/update-sanction-rule.dto.ts`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` |
| Paramètres de sécurité chargés par configuration | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
