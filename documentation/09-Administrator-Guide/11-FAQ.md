Document ID : AG-011  
Titre : FAQ  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# Présentation

Cette FAQ répond aux questions courantes liées aux fonctionnalités administrateur effectivement disponibles dans Konatech Pointage.

## Comment accéder au tableau de bord administrateur ?

Ouvrez `/` avec une session dont le rôle d’accès est `ADMIN`.

## Où se trouve la gestion des employés ?

La gestion des employés est accessible sur `/employees`, depuis l’entrée « Employés ».

## Quels rôles d’accès peuvent être attribués à un compte ?

Les valeurs disponibles sont `ADMIN` et `EMPLOYEE`.

## Peut-on rechercher un employé ?

Oui. La liste permet une recherche locale sur le nom, l’e-mail, l’identifiant, le département, le rôle métier et le planning.

## Peut-on désactiver un compte employé ?

Oui. Chaque ligne propose « Désactiver » pour un compte actif et « Activer » pour un compte inactif.

## Comment affecter un planning à un employé ?

Dans le formulaire de l’employé, sélectionnez un planning dans le champ « Planning »; « Aucun planning » retire l’affectation.

## Où gérer les plannings ?

Le module est accessible sur `/schedules`, depuis l’entrée « Plannings ».

## Quels éléments composent un planning ?

Un planning contient un nom, une heure de début, une heure de fin, une marge de retard, des jours actifs et un statut actif.

## Quelle contrainte s’applique aux horaires d’un planning ?

L’heure de fin doit être postérieure à l’heure de début et respecter le format `HH:mm`.

## Peut-on désactiver un planning ?

Oui. L’action « Désactiver » ou « Activer » modifie son champ `isActive`.

## Où consulter les pointages des employés ?

La consultation se fait sur `/attendance-history`, depuis « Historique RH ».

## Quelles périodes sont disponibles dans l’historique ?

Les filtres proposent « Aujourd’hui », « Cette semaine » et « Ce mois ».

## Quelles informations sont visibles dans une ligne de pointage ?

La table affiche notamment la date, l’employé, les heures d’entrée et de sortie, le retard, le départ anticipé, les heures supplémentaires, le GPS, le selfie, le commentaire et le statut.

## Comment afficher le détail d’un pointage ?

Cliquez sur une ligne de la table pour ouvrir la « Fiche Pointage ».

## Pourquoi un pointage peut-il être incomplet ?

Le statut est incomplet lorsqu’une entrée existe sans sortie ou lorsque l’enregistrement porte le statut `INCOMPLETE`.

## Où générer un rapport mensuel ?

La page `/exports`, accessible via « Exports PDF », permet de générer un rapport RH mensuel.

## Quels paramètres sont nécessaires pour un export ?

L’export demande un mois, une année et éventuellement un `employeeId`; sans identifiant, le rapport porte sur l’équipe.

## Quels formats d’export sont disponibles ?

Le backend produit les formats `pdf` et `csv`; l’écran `/exports` utilise le format PDF.

## Existe-t-il une page générale de paramètres ?

Non. Les paramètres modifiables sont répartis entre les plannings, le calendrier RH et les règles de sanctions.

## Comment modifier une règle de sanction ?

Depuis `/sanctions?tab=rules`, utilisez « Modifier », puis enregistrez les champs de la règle existante.

## Que signifie une erreur d’accès administrateur ?

Un compte qui ne possède pas le rôle `ADMIN` est redirigé vers `/my-attendance` côté frontend et reçoit une réponse `403` pour une route backend protégée.

## Que se passe-t-il si les identifiants sont invalides ?

Le backend renvoie `401 Unauthorized` et le formulaire affiche le message d’erreur retourné, ou « Connexion impossible. » s’il n’y en a pas.

# Références

| Sujet | Fichiers analysés |
|---|---|
| Authentification, rôles et accès | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/frontend/lib/redirect.ts` |
| Tableau de bord d'organisation | `apps/frontend/app/dashboard/page.tsx`, `apps/backend/src/modules/dashboard/dashboard.controller.ts`, `apps/backend/src/modules/dashboard/dashboard.service.ts` |
| Employés | `apps/frontend/components/employees/admin-employees-manager.tsx`, `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/employees/employees.service.ts` |
| Plannings | `apps/frontend/components/schedules/admin-schedules-manager.tsx`, `apps/backend/src/modules/schedules/schedules.controller.ts`, `apps/backend/src/modules/schedules/schedules.service.ts` |
| Pointages et historique | `apps/frontend/app/attendance-history/page.tsx`, `apps/frontend/components/attendance-history/attendance-history-table.tsx`, `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Exports | `apps/frontend/app/exports/page.tsx`, `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`, `apps/backend/src/modules/attendance/exports/monthly-attendance-csv-exporter.service.ts`, `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Paramètres fonctionnels et sanctions | `apps/frontend/app/calendar/page.tsx`, `apps/frontend/app/sanctions/page.tsx`, `apps/frontend/components/sanctions/sanction-rules-panel.tsx`, `apps/backend/src/modules/calendar/calendar.controller.ts`, `apps/backend/src/modules/sanctions/sanctions.controller.ts` |
