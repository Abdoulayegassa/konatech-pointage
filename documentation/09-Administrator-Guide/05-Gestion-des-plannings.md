Document ID : AG-005  
Titre : Gestion des plannings  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# 1. Présentation

Le module de gestion des plannings permet à l’administrateur de définir des horaires, des jours actifs et une marge de retard, puis de suivre l’utilisation de chaque planning par les employés.

# 2. Accès au module

Le module est accessible à la route frontend `/schedules`, depuis l’entrée « Plannings » de la navigation administrateur. La page exige une session `ADMIN`; un autre rôle est redirigé vers `/my-attendance` et l’absence de jeton vers `/login`.

Au chargement, la page récupère les plannings avec `GET /schedules`.

# 3. Liste des plannings

Chaque planning affiche son nom, sa date de création, son statut (`Actif` ou `Inactif`), son utilisation (`En service` ou `Libre`), sa plage horaire, sa marge de retard, ses jours actifs et le nombre d’employés affectés. Un aperçu des employés affectés est affiché; lorsqu’il n’y en a aucun, l’interface indique « Aucun employé assigné ».

La page présente également le nombre total de plannings, le nombre de plannings actifs, inactifs, en service ou libres, ainsi que le total des affectations.

La liste propose une recherche locale sur le nom, les heures, la marge, les jours et l’aperçu des employés. Des filtres locaux permettent de sélectionner le statut, l’utilisation et un jour de la semaine. Le bouton « Effacer les filtres » réinitialise ces critères.

# 4. Création d'un planning

Le bouton « Nouveau planning » ouvre le formulaire. Les champs et validations observés sont :

| Champ | Validation ou comportement observé |
|---|---|
| Nom | Requis; 80 caractères maximum côté DTO. |
| Début | Heure au format `HH:mm`, comprise entre `00:00` et `23:59`. |
| Fin | Heure au même format et postérieure à l’heure de début pour le même jour. |
| Marge de retard | Nombre entier compris entre 0 et 180 minutes; la valeur par défaut du formulaire est 0. |
| Jours | Au moins un jour; les valeurs possibles sont lundi à dimanche et les valeurs sont uniques. |
| Planning actif | Case cochée par défaut; correspond au champ `isActive`. |

La validation frontend est effectuée avant `POST /schedules`. En cas de succès, le planning est ajouté à la liste et le formulaire affiche l’état de création terminé.

# 5. Modification d'un planning

Le bouton « Modifier » charge le planning via `GET /schedules/:id` puis ouvre le formulaire d’édition. Les champs du planning peuvent être modifiés et sont envoyés à `PATCH /schedules/:id`. Le DTO de modification reprend les champs de création en optionnels. Une modification réussie remplace l’élément dans la liste.

# 6. Affectation aux employés

Le module des plannings affiche les employés déjà associés à chaque planning et leur nombre. L’association est sélectionnée dans le formulaire de gestion d’un employé, via le champ `Planning`, qui propose les plannings chargés par la page employés. Le planning peut aussi être retiré en sélectionnant « Aucun planning ». Le module des plannings ne contient pas de formulaire distinct d’affectation directe d’un employé.

# 7. Suppression ou désactivation

Chaque planning possède une action « Désactiver » lorsqu’il est actif et « Activer » lorsqu’il est inactif. L’action envoie `PATCH /schedules/:id/status` avec la nouvelle valeur `isActive`, puis met à jour la ligne et affiche « Planning désactivé avec succès. » ou « Planning réactivé avec succès. ».

Aucune route de suppression de planning n’est définie dans `SchedulesController`.

# 8. Limitations

- La recherche et les filtres sont appliqués uniquement dans la vue frontend.
- La plage horaire doit rester dans la même journée; une heure de fin inférieure ou égale à l’heure de début est refusée.
- Un planning doit comporter au moins un jour actif.
- Le service signale un conflit lorsqu’un autre planning possède le même nom.
- Les affectations sont visibles dans le module des plannings mais se configurent depuis la fiche employé.

# 9. Références

| Élément documenté | Fichier source |
|---|---|
| Page, accès administrateur et chargement initial | `apps/frontend/app/schedules/page.tsx` |
| Navigation vers le module | `apps/frontend/components/admin/admin-nav.tsx` |
| Recherche, filtres, liste, formulaire et actions | `apps/frontend/components/schedules/admin-schedules-manager.tsx` |
| Valeurs par défaut, jours, statuts et aperçu des affectations | `apps/frontend/components/schedules/schedule-manager.helpers.ts` |
| Appel frontend des plannings | `apps/frontend/lib/api.ts` |
| Routes API, rôle requis et désactivation | `apps/backend/src/modules/schedules/schedules.controller.ts` |
| Persistance, fenêtre horaire et conflit de nom | `apps/backend/src/modules/schedules/schedules.service.ts` |
| Validation de création | `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts` |
| Validation de modification | `apps/backend/src/modules/schedules/dto/update-schedule.dto.ts` |
| Validation du statut | `apps/backend/src/modules/schedules/dto/update-schedule-status.dto.ts` |
| Sélection d’un planning sur un employé | `apps/frontend/components/employees/admin-employees-manager.tsx` |
