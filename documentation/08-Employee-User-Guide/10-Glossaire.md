Document ID : EUG-010

Titre : Glossaire

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# Glossaire

| Terme | Définition |
|---|---|
| Absence | Journée planifiée sans entrée enregistrée, comptée par le backend dans le compteur mensuel lorsque le jour n'est pas déclaré non ouvré. L'espace personnel l'affiche sous l'indicateur `ABS.`. |
| Administrateur | Valeur de rôle d'accès `ADMIN`. Les contrôleurs de gestion des employés, des plannings et des opérations administratives exigent ce rôle. |
| API | Interface HTTP utilisée par le frontend pour transmettre les demandes d'authentification, de pointage et d'historique au backend. |
| Authentification | Vérification d'un compte par email et mot de passe, ou identification d'un employé par PIN dans le parcours `/attendance-entry`, suivie de l'émission d'un JWT. |
| Caméra | API média du navigateur utilisée par `AttendanceSelfieCapture` pour ouvrir la caméra frontale et produire la photo de vérification. |
| Commentaire | Texte transmis dans le champ `notes` d'une entrée ou d'une sortie. Il est facultatif dans l'interface et peut être exigé par la politique GPS pour justifier un pointage hors zone. |
| Compte | Enregistrement `Employee` utilisé pour l'identité, l'email, le mot de passe, le rôle d'accès, l'état actif et les relations de pointage. |
| Déconnexion | Action frontend qui supprime les cookies de session et redirige vers `/login`, ou qui supprime la session PIN depuis le parcours QR. |
| Départ anticipé | Résultat calculé lorsque l'heure de sortie est antérieure à l'heure de fin du planning ; le nombre de minutes est enregistré dans `earlyExitMinutes`. |
| Employé | Compte portant le rôle d'accès `EMPLOYEE`, autorisé à utiliser les endpoints personnels de présence et le parcours de pointage par PIN. |
| Entrée | Action qui enregistre `clockInAt` pour la journée de l'employé via `POST /attendance/me/check-in`. |
| GPS | Position et précision obtenues par la géolocalisation du navigateur ; lorsque la politique est active, le backend calcule aussi la distance par rapport aux coordonnées de l'entreprise. |
| Heures supplémentaires | Durée calculée lorsqu'une sortie dépasse l'heure de fin planifiée, ou durée travaillée hors planning dans le cas prévu par le service de présence. |
| Historique | Liste des pointages personnels renvoyée pour le mois demandé par `GET /attendance/me/history` et affichée dans `/my-attendance`. |
| JWT | Jeton signé contenant notamment l'identifiant et l'email du compte ainsi que ses dates d'émission et d'expiration. Il est transmis au backend avec le schéma `Bearer`. |
| PIN | Code numérique de quatre chiffres utilisé pour créer la session dédiée au pointage sur `/attendance-entry`. |
| Planning | Enregistrement `Schedule` contenant les heures de début et de fin, les jours travaillés, la marge de retard et l'état actif d'un programme de travail. |
| Pointage | Enregistrement `Attendance` associé à un employé et à une date, contenant notamment les heures d'entrée et de sortie, le statut et les métadonnées de vérification. |
| Présence | État de pointage enregistré pour un employé. Le statut `PRESENT` correspond à une journée complète selon le service de présence. |
| QR Code | Code généré depuis le dashboard et contenant le lien fixe vers `/attendance-entry`. |
| Retard | Nombre de minutes calculé lorsque l'entrée dépasse l'heure de début du planning après prise en compte de la marge de retard ; le statut devient `LATE`. |
| Session | Jeton conservé dans un cookie frontend après authentification. Le compte et le parcours PIN utilisent respectivement `konatech_session` et `konatech_attendance_entry_session`. |
| Sortie | Action qui enregistre `clockOutAt` pour une entrée existante via `POST /attendance/me/check-out`. |
| Selfie | Image JPEG capturée par la caméra du navigateur, obligatoire pour les actions de pointage employé et envoyée comme preuve de vérification. |
| Utilisateur | Identité publique de l'employé authentifié, chargée par `GET /auth/me` ou par la session PIN. Les condensats de mot de passe et données PIN n'en font pas partie. |
| Validation | Contrôle appliqué par les DTO NestJS et par l'écran de vérification frontend avant l'envoi ou l'enregistrement d'une action. |
| Zone autorisée | Rayon calculé par la politique GPS autour des coordonnées de l'entreprise. Un pointage hors de ce rayon exige un commentaire lorsque la politique est active. |

# Références

| Terme | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Absence | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/frontend/app/my-attendance/page.tsx` | Calcul du compteur mensuel et affichage de l'indicateur `ABS.`. |
| Administrateur | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` | Contrôleur protégé par `ADMIN` et contrôle des rôles requis. |
| API | `apps/frontend/lib/api.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Fonctions frontend et routes HTTP NestJS. |
| Authentification | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `apps/frontend/app/login/page.tsx` | Routes de connexion par compte et par PIN. |
| Caméra | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` | Appel de `navigator.mediaDevices.getUserMedia` et capture sur canvas. |
| Commentaire | `apps/frontend/components/attendance/employee-attendance-actions.tsx`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | Saisie `notes` et exigence hors zone. |
| Compte | `apps/backend/prisma/schema.prisma` | Modèle `Employee` et ses champs d'identité et d'accès. |
| Déconnexion | `apps/frontend/app/api/auth/logout/route.ts`, `apps/frontend/components/attendance/attendance-entry-session-button.tsx` | Suppression des cookies et retour aux routes de connexion ou PIN. |
| Départ anticipé | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/common/utils/attendance-checkout.util.ts` | Calcul et enregistrement de `earlyExit` et `earlyExitMinutes`. |
| Employé | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Enum `AccessRole.EMPLOYEE` et routes personnelles protégées. |
| Entrée | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Endpoint `me/check-in` et écriture de `clockInAt`. |
| GPS | `apps/frontend/components/attendance/attendance-browser-security.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Géolocalisation navigateur et configuration de la politique. |
| Heures supplémentaires | `apps/backend/src/common/utils/attendance-checkout.util.ts`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Calcul de la durée et affichage du résultat. |
| Historique | `apps/frontend/app/my-attendance/page.tsx`, `apps/frontend/lib/api.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Chargement du mois courant et endpoint `me/history`. |
| JWT | `apps/backend/src/common/security/jwt.util.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` | Signature, expiration et lecture du schéma `Bearer`. |
| PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`, `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` | Pavé numérique et validation de quatre chiffres. |
| Planning | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/attendance/attendance.service.ts` | Modèle `Schedule` et utilisation pour les horaires et retards. |
| Pointage | `apps/backend/prisma/schema.prisma`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Modèle `Attendance` et parcours entrée/sortie. |
| Présence | `apps/backend/prisma/schema.prisma`, `apps/backend/src/modules/attendance/attendance.service.ts` | Enum `AttendanceStatus` et statut `PRESENT`. |
| QR Code | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`, `apps/frontend/app/page.tsx` | Génération et encodage du lien `/attendance-entry`. |
| Retard | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Calcul de `minutesLate` et affichage du statut « Retard ». |
| Session | `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Noms, attributs et création des cookies de session. |
| Sortie | `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Endpoint `me/check-out` et écriture de `clockOutAt`. |
| Selfie | `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts` | Vérification obligatoire et stockage des métadonnées de photo. |
| Utilisateur | `apps/backend/src/common/prisma/selects.ts`, `apps/backend/src/modules/auth/auth.controller.ts` | Sélection publique et endpoint `auth/me`. |
| Validation | `apps/backend/src/main.ts`, `apps/backend/src/modules/attendance/dto/self-check-in.dto.ts`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Validation globale des DTO et récapitulatif avant envoi. |
| Zone autorisée | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` | Rayon configuré, distance calculée et commentaire hors zone. |
