Document ID : AG-004  
Titre : Gestion des employés  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# 1. Présentation

Le module de gestion des employés permet à un administrateur de consulter les comptes, d’en créer, de modifier leurs informations, de changer leur statut actif et d’affecter un rôle d’accès, un département ou un planning.

# 2. Accès au module

Le module est accessible à la route frontend `/employees`, depuis l’entrée « Employés » de la navigation administrateur. La page exige une session dont le rôle est `ADMIN`; un autre rôle est redirigé vers `/my-attendance` et l’absence de jeton vers `/login`.

Au chargement, la page récupère la liste des employés et les plannings via `GET /employees` et `GET /schedules`.

# 3. Liste des employés

La liste affiche, pour chaque compte :

- le prénom, le nom et l’identifiant employé ;
- l’adresse e-mail ;
- le statut du compte (`Actif` ou `Inactif`) ;
- l’état du code PIN ;
- le rôle d’accès (`Administrateur` ou `Employé`) et le rôle métier ;
- le département ;
- le planning affecté, ses horaires et l’état d’affectation.

La vue fournit une recherche locale portant sur le nom, l’e-mail, l’identifiant, le département, le rôle métier et le nom du planning. Des filtres locaux permettent de sélectionner le statut, le rôle d’accès et l’affectation à un planning. La page affiche aussi le nombre de comptes, les comptes actifs, les comptes sans planning, les administrateurs, les départements distincts et le taux de couverture des plannings.

# 4. Création d'un employé

Le bouton « Nouveau collaborateur » ouvre le formulaire « Compte employé ». Les champs proposés sont :

| Champ | Validation ou comportement observé |
|---|---|
| Code PIN | Requis pour un accès `EMPLOYEE`; quatre chiffres exactement côté interface, avec les contraintes de format et les valeurs interdites du DTO. Désactivé pour un accès `ADMIN`. |
| Prénom | Requis; chaîne de 80 caractères maximum côté DTO. |
| Nom | Requis; chaîne de 80 caractères maximum côté DTO. |
| Email | Requis et validé comme adresse e-mail. |
| Rôle métier | Requis; chaîne de 80 caractères maximum côté DTO. |
| Rôle d’accès | Sélection `EMPLOYEE` ou `ADMIN`; valeur d’énumération côté DTO. |
| Département | Facultatif; 80 caractères maximum. |
| Planning | Facultatif; sélection d’un planning existant par identifiant UUID. |
| Compte actif | Case cochée par défaut dans le formulaire. |
| Mot de passe initial | Requis à la création; entre 8 et 128 caractères côté DTO. |

La validation du formulaire est effectuée avant l’appel `POST /employees`. En cas de succès, le nouvel employé est ajouté à la liste et le message « Employé créé avec succès. » est affiché.

# 5. Consultation d'un employé

Le bouton « Modifier » charge la fiche d’un employé via `GET /employees/:id` et ouvre le formulaire d’édition. La fiche reprend le prénom, le nom, l’e-mail, le rôle métier, le rôle d’accès, le département, le planning et le statut actif. Le code PIN n’est pas prérempli; le mot de passe n’est pas prérempli.

# 6. Modification

Le bouton « Enregistrer » envoie les champs modifiés à `PATCH /employees/:id`. Les champs de la fiche peuvent être mis à jour selon les validations de `UpdateEmployeeDto`. Le mot de passe est envoyé uniquement lorsqu’une nouvelle valeur est saisie; un champ vide conserve le mot de passe existant. Une modification réussie remplace l’enregistrement dans la liste et affiche « Employé mis à jour avec succès. ».

# 7. Activation / Désactivation

Chaque ligne comporte le bouton « Désactiver » pour un compte actif et « Activer » pour un compte inactif. L’action envoie `PATCH /employees/:id/status` avec `isActive` inversé. Le statut est alors mis à jour dans la liste et l’interface affiche « Compte employé désactivé. » ou « Compte employé réactivé. ».

# 8. Affectation

Le formulaire permet d’associer ou de retirer un planning parmi les plannings chargés, ainsi que de renseigner un département et un rôle d’accès. Le backend expose également les opérations dédiées `PATCH /employees/:id/role`, `PATCH /employees/:id/department` et `PATCH /employees/:id/schedule`; ces opérations sont protégées par le rôle `ADMIN` et valident respectivement le rôle, le département ou l’identifiant de planning.

# 9. Limitations

- La recherche et les filtres de la liste sont appliqués uniquement dans la vue frontend.
- Aucun endpoint de suppression d’employé n’est défini dans `EmployeesController`.
- Un planning sélectionné doit exister; le service renvoie une erreur si le planning affecté est introuvable.
- Les messages d’erreur affichés par l’interface proviennent de la réponse de l’API ou d’un message local lorsque la validation préalable échoue.

# 10. Références

| Élément documenté | Fichier source |
|---|---|
| Page, session administrateur et chargement initial | `apps/frontend/app/employees/page.tsx` |
| Navigation vers le module | `apps/frontend/components/admin/admin-nav.tsx` |
| Recherche, filtres, liste, formulaire et actions | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Valeurs initiales, mapping et statuts affichés | `apps/frontend/components/employees/employee-manager.helpers.ts` |
| Appels frontend vers les employés | `apps/frontend/lib/api.ts`, `apps/frontend/app/api/employees/route.ts`, `apps/frontend/app/api/employees/[id]/route.ts`, `apps/frontend/app/api/employees/[id]/status/route.ts` |
| Routes API, rôle requis et opérations disponibles | `apps/backend/src/modules/employees/employees.controller.ts` |
| Persistance, affectations et erreurs de planning | `apps/backend/src/modules/employees/employees.service.ts` |
| Champs et validations de création | `apps/backend/src/modules/employees/dto/create-employee.dto.ts` |
| Champs et validations de modification | `apps/backend/src/modules/employees/dto/update-employee.dto.ts` |
| Validation du statut | `apps/backend/src/modules/employees/dto/update-employee-status.dto.ts` |
| Affectation de rôle, département et planning | `apps/backend/src/modules/employees/dto/assign-employee-role.dto.ts`, `apps/backend/src/modules/employees/dto/assign-employee-department.dto.ts`, `apps/backend/src/modules/employees/dto/assign-employee-schedule.dto.ts` |
