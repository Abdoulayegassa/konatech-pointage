Document ID : AG-010  
Titre : Dépannage et résolution des problèmes  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Administrator Guide  
Projet : Konatech Pointage

# 1. Présentation

Ce chapitre recense les erreurs, validations et comportements de traitement effectivement présents dans les parcours administrateur et dans les services backend correspondants. Il ne décrit pas de mécanisme externe au dépôt.

# 2. Problèmes de connexion

La connexion administrateur utilise l’e-mail et le mot de passe. Le formulaire affiche la réponse d’erreur de `/api/auth/login` ou « Connexion impossible. » lorsque le backend ne renvoie pas de message. Le backend renvoie `401 Unauthorized` pour des identifiants invalides, un compte inactif, un jeton invalide ou expiré, ou un en-tête Bearer absent ou mal formé.

Le parcours d’entrée par PIN accepte uniquement un code de quatre chiffres. L’interface traduit les identifiants invalides en « Code PIN invalide. ».

# 3. Problèmes liés aux employés

La création et la modification d’un employé contrôlent notamment le mot de passe initial, le format du PIN, l’e-mail, le rôle d’accès et l’identifiant de planning. Le formulaire affiche les erreurs locales avant l’appel API et relaie ensuite le message renvoyé par le backend.

Le service signale aussi les conflits de PIN ou d’e-mail, l’absence de l’employé ciblé et l’absence du planning affecté. Les actions de chargement, de statut et d’enregistrement affichent respectivement leurs messages d’échec dédiés dans le composant de gestion.

# 4. Problèmes liés aux plannings

Le formulaire refuse un nom vide, une marge non entière ou hors de l’intervalle 0–180, l’absence de jour actif et une heure de fin antérieure ou égale à l’heure de début. Le service renvoie une erreur si le planning demandé n’existe pas et un conflit si son nom est déjà utilisé.

Les erreurs de chargement, de mise à jour du statut, de création et de modification sont affichées dans `AdminSchedulesManager`.

# 5. Problèmes liés aux pointages

Le service Attendance refuse notamment :

- un second pointage d’entrée le même jour ;
- une entrée après l’enregistrement d’une sortie ;
- une sortie sans entrée ;
- une sortie antérieure à l’entrée ;
- une date `occurredAt` invalide ou future ;
- un mois d’historique qui ne respecte pas le format `YYYY-MM` ;
- un employé inexistant ou inactif.

Lorsque la sécurité est active, le pointage peut aussi être refusé pour selfie manquant, géolocalisation manquante, précision GPS insuffisante ou absence de commentaire pour un pointage hors du rayon autorisé. L’interface affiche alors le message retourné ou ses messages de validation tels que « Le selfie est obligatoire pour valider ce pointage. » et « Impossible de valider ce pointage. ».

# 6. Tableau récapitulatif

| Problème | Cause observée | Comportement de l'application |
|---|---|---|
| Connexion refusée | Identifiants invalides, compte inactif ou jeton invalide | Réponse `401`; le formulaire affiche l’erreur reçue. |
| Accès administrateur refusé | Rôle différent de `ADMIN` | Redirection frontend vers `/my-attendance` ou réponse `403` pour une route protégée. |
| PIN employé refusé | Code absent, non numérique, non conforme ou déjà utilisé | Validation DTO ou conflit `409`; affichage « Code PIN invalide. ». |
| E-mail employé déjà présent | Contrainte d’unicité Prisma | Conflit `409` signalé par le service. |
| Planning introuvable | Identifiant de planning inexistant | Réponse `404` « Assigned schedule not found. ». |
| Planning incohérent | Fin non postérieure au début | Validation frontend ou `400` backend. |
| Double entrée | Une entrée existe déjà pour le jour | Conflit `409` renvoyé par Attendance. |
| Sortie sans entrée | Aucun `clockInAt` enregistré | Réponse `400` « Cannot check out before a check-in has been recorded. ». |
| Sortie antérieure | Heure de sortie avant l’entrée | Réponse `400` par Attendance. |
| Sécurité de pointage incomplète | Selfie, GPS ou précision requis manquant | Réponse `400` avec le message de sécurité correspondant. |
| Historique mal formé | Mois différent de `YYYY-MM` | Réponse `400` « month must be in YYYY-MM format. ». |

# 7. Références

| Élément documenté | Fichier source |
|---|---|
| Formulaire et erreurs de connexion | `apps/frontend/components/auth/login-form.tsx`, `apps/frontend/app/api/auth/login/route.ts` |
| Authentification et erreurs JWT | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Validation du login et du PIN | `apps/backend/src/modules/auth/dto/login.dto.ts`, `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Erreurs et validations employés | `apps/frontend/components/employees/admin-employees-manager.tsx`, `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/employees/dto/create-employee.dto.ts`, `apps/backend/src/modules/employees/dto/update-employee.dto.ts` |
| Erreurs et validations plannings | `apps/frontend/components/schedules/admin-schedules-manager.tsx`, `apps/backend/src/modules/schedules/schedules.service.ts`, `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts` |
| Règles et erreurs Attendance | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/dto/attendance-history-query.dto.ts`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` |
| Validation de l’image de vérification | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`, `apps/frontend/components/attendance/attendance-selfie-capture.tsx` |
