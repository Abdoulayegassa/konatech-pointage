Document ID : EUG-007

Titre : Messages et erreurs

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# 1. Présentation

Konatech Pointage affiche des messages pour indiquer l'état d'une session, guider les étapes du pointage, confirmer un enregistrement ou signaler un échec. Les parcours employé concernés sont la connexion par compte, l'identification PIN, le pointage, l'historique personnel et la fermeture de session.

Les messages proviennent soit directement des composants frontend, soit des réponses du backend relayées par les routes API Next.js. Lorsqu'une erreur métier backend est relayée sans traduction, son texte d'origine est visible dans l'écran de validation du pointage.

# 2. Messages d'information

| Situation | Message | Description |
|---|---|---|
| Saisie du PIN | « Entrez votre code PIN à 4 chiffres » | Instruction affichée en haut de `/attendance-entry` sans session PIN valide. |
| Accès PIN | « Accès réservé aux employés autorisés » | Information placée sous le pavé numérique. |
| Vérification du PIN en cours | « Vérification... » | Libellé accessible associé à l'indicateur d'attente pendant l'envoi du PIN. |
| Horloge de pointage | « Heure actuelle » et « Synchronisé » | Libellés affichés avec l'heure et la date locales mises à jour chaque seconde. |
| Choix du pointage | « Que souhaitez-vous faire ? » | Introduit les boutons « Entrée — Début de journée » et « Sortie — Fin de journée ». |
| Preuves annoncées | « GPS obligatoire » et « Selfie obligatoire » | Libellés visibles sur l'écran de choix de l'action. L'obligation GPS effective dépend de la politique backend active ; le selfie est contrôlé pour chaque pointage employé. |
| Capture de la photo | « Touchez pour ouvrir la caméra » et « Cadrez votre visage » | Instructions de l'étape selfie. |
| Aide à la capture | « Regardez la caméra et restez dans un endroit bien éclairé. » | Texte du bloc « Conseil » dans le composant de capture. |
| Commentaire | « Ce commentaire est facultatif. Il sera visible par votre responsable. » | Information affichée avant le champ de commentaire. Le backend peut toutefois exiger un commentaire pour une position hors zone lorsque la politique GPS est active. |
| Vérification finale | « Vérifiez les informations avant d'enregistrer. » | Instruction de l'écran « Validation ». |
| Envoi du pointage | « Enregistrement... » | Libellé du bouton pendant la requête d'entrée ou de sortie. |
| Position disponible | « Position enregistrée » | État utilisé lorsque les coordonnées sont présentes sans autre qualification. |
| Position dans le rayon | « Dans la zone autorisée » | État calculé lorsque la position se trouve dans le rayon configuré. |
| Position hors rayon avec commentaire | « Pointage hors bureau justifié » | État calculé lorsqu'une position hors zone est accompagnée d'un commentaire. |
| Position hors rayon sans commentaire | « Hors bureau - commentaire requis » | État affiché dans le récapitulatif avant la validation backend. |
| Historique vide | « Aucun pointage enregistré » et « Vos derniers pointages apparaîtront ici. » | État de la section Historique de `/my-attendance` lorsqu'aucun enregistrement mensuel n'est renvoyé. |

# 3. Messages de confirmation

| Action | Confirmation |
|---|---|
| PIN accepté | La zone de retour affiche une coche, le nom complet de l'employé et sa fonction avant l'ouverture de la vue de pointage. |
| Entrée enregistrée | L'écran affiche « Pointage enregistré ! », l'heure d'entrée et « À l'heure » ou « Retard » avec le nombre de minutes. |
| Sortie enregistrée à l'heure | L'écran affiche « Pointage enregistré ! », l'heure de sortie et « Sortie à l'heure ». |
| Sortie anticipée enregistrée | L'écran affiche « Pointage enregistré ! » et « Départ anticipé » avec le nombre de minutes. |
| Sortie avec heures supplémentaires | L'écran affiche « Pointage enregistré ! » et « Heures supplémentaires » avec la durée. |
| Validation de la position dans le résultat | Le récapitulatif de succès affiche l'état calculé de la position à côté du libellé « GPS ». |

Après la confirmation, le bouton « Nouveau pointage » est affiché. Dans le parcours QR, son activation efface la session PIN puis revient à l'écran d'identification de `/attendance-entry`.

# 4. Messages d'erreur

| Situation | Message affiché | Comportement |
|---|---|---|
| Identifiants de compte incorrects ou compte inactif | `Invalid credentials.` | Le formulaire `/login` reste affiché et présente la réponse du backend. |
| Backend inaccessible pendant la connexion | « Connexion impossible. » | La connexion n'est pas créée et le formulaire reste disponible. |
| PIN incorrect ou compte PIN non admissible | « Code PIN invalide. » | Le frontend traduit la réponse backend `Identifiants invalides.` et conserve l'écran PIN. |
| PIN de format invalide | « Le code PIN doit contenir exactement 4 chiffres. » | La validation backend refuse toute valeur ne contenant pas exactement quatre chiffres. Le bouton frontend reste déjà désactivé avant quatre chiffres. |
| Trop de tentatives PIN | « Trop de tentatives. Réessayez dans quelques minutes. » | Le garde de limitation bloque la requête et l'écran PIN affiche le message adapté. |
| Échec non reconnu de la vérification PIN | « Impossible de vérifier ce code. » | Aucune session PIN n'est créée. |
| Caméra non prise en charge | « La caméra n'est pas disponible sur cet appareil. » | La capture ne démarre pas. |
| Autorisation caméra refusée ou ouverture impossible | « Autorisez la caméra pour valider le pointage. » | L'étape selfie reste affichée. |
| Caméra pas encore initialisée | « La caméra n'est pas encore prête. » | La photo n'est pas produite. |
| Échec de création de l'image | « Impossible de capturer la photo. » | Le selfie n'est pas transmis à l'étape suivante. |
| Progression sans selfie | « Le selfie est obligatoire pour valider ce pointage. » | Le parcours revient à l'étape selfie. |
| Selfie absent ou invalide côté backend | « Selfie requis pour valider le pointage. » | Le backend refuse l'entrée ou la sortie. Le message est relayé à l'écran de validation. |
| Politique GPS active sans position | « Géolocalisation requise pour valider le pointage. » | Le backend refuse l'enregistrement et le récapitulatif reste affiché. |
| Précision GPS non conforme à la politique active | « Précision GPS insuffisante. » | Le backend refuse l'enregistrement et le message est affiché. |
| Position hors rayon sans justification | « Ajoutez un commentaire pour justifier ce pointage hors bureau. » | Le pointage n'est pas enregistré ; l'utilisateur reste sur la validation et peut revenir avec « Modifier ». |
| Entrée déjà enregistrée | `A check-in has already been recorded for this attendance day.` | La demande est refusée ; l'erreur est affichée dans l'écran de validation. |
| Nouvelle entrée après une sortie | `Cannot record a new check-in after the attendance has been checked out.` | La demande est refusée sans modifier le pointage existant. |
| Sortie avant une entrée | `Cannot check out before a check-in has been recorded.` | La sortie n'est pas enregistrée. |
| Sortie déjà enregistrée | `A check-out has already been recorded for this attendance day.` | La nouvelle sortie est refusée. |
| Heure de sortie antérieure à l'entrée | `Check-out time cannot be earlier than check-in time.` | La sortie n'est pas enregistrée. |
| Heure de pointage dans le futur | `occurredAt cannot be in the future.` | L'entrée ou la sortie est refusée. |
| Session de pointage absente | `Session expiree.` | La route frontend refuse l'envoi sans jeton de session dédié. |
| Backend inaccessible pendant l'entrée | « Impossible de pointer l entree. » | La route frontend renvoie l'erreur et le pointage reste sur l'étape de validation. |
| Backend inaccessible pendant la sortie | « Impossible de pointer la sortie. » | La route frontend renvoie l'erreur et le pointage reste sur l'étape de validation. |
| Échec réseau dans le composant de pointage | « Connexion indisponible. Réessayez dans quelques instants. » | Le parcours revient à l'état de validation. |
| Réponse d'échec sans message exploitable | « Impossible de valider ce pointage. » | Le pointage reste sur l'écran de validation. |
| Échec de fermeture de la session PIN | « Impossible de fermer cette session PIN. » | Le composant conserve l'écran courant et affiche l'erreur sous le bouton. |
| Erreur de rendu sur `/attendance-entry` | « La page de pointage QR n'a pas pu se charger correctement » puis « Une erreur inattendue a interrompu le chargement de votre entrée de présence. Aucun pointage n'a été modifié. » | L'écran affiche l'erreur reçue et les boutons « Réessayer » et « Recharger la page ». |
| Erreur de rendu sur `/my-attendance` | « Votre page de pointage n'a pas pu se charger correctement » puis « Une erreur inattendue a interrompu le chargement de vos données personnelles de présence. Aucun pointage n'a été modifié. » | L'écran affiche l'erreur reçue et les boutons « Réessayer » et « Recharger la page ». |

# 5. Cas particuliers

## 5.1 Accès refusé

L'accès sans cookie de compte à `/my-attendance` déclenche une redirection vers `/login` sans afficher un message intermédiaire. Un rôle `ADMIN` ouvrant cette page est redirigé vers `/`. Les endpoints personnels de présence sont protégés par le rôle `EMPLOYEE` ; le backend utilise `Insufficient permissions for this resource.` lorsqu'un rôle authentifié n'est pas admis.

## 5.2 Session expirée ou compte inactif

Pour la session de compte, une identité qui ne peut plus être chargée provoque une redirection vers `/login`. Le backend distingue `Invalid or expired token.` et `User is no longer active.`, mais `getCurrentUser` intercepte l'échec avant la redirection et ces textes ne sont pas rendus par `/my-attendance`.

Pour la session PIN, `/attendance-entry` efface la session invalide et réaffiche le pavé numérique. Une réponse `401` reçue pendant un appel de pointage efface également le cookie PIN dans la route frontend.

## 5.3 Données invalides

Les DTO de connexion, de PIN et de pointage sont traités par la validation globale NestJS. Le message personnalisé du PIN et celui du format de selfie sont explicitement définis dans leurs DTO. Les autres erreurs métier listées dans ce chapitre sont produites par les services d'authentification, de présence ou de sécurité.

## 5.4 Affichage d'une erreur de pointage

La route frontend extrait le champ `message` de la réponse backend et le renvoie sous la propriété `error`. Le composant d'actions affiche cette valeur dans une zone d'erreur de l'écran de validation. Il ne passe à l'écran de succès qu'après une réponse HTTP réussie contenant le pointage enregistré.

# 6. Références

| Groupe de messages | Fichier source | Preuve observée |
|---|---|---|
| Formulaire de connexion | `apps/frontend/components/auth/login-form.tsx` | Affiche l'erreur renvoyée ou « Connexion impossible. ». |
| Transmission des erreurs de connexion | `apps/frontend/app/api/auth/login/route.ts` | Extrait le message backend et conserve le statut HTTP. |
| Erreurs d'identifiants et de jeton | `apps/backend/src/modules/auth/auth.service.ts` | Produit les erreurs de compte, d'identifiants et de JWT. |
| Validation des données de compte | `apps/backend/src/modules/auth/dto/login.dto.ts` | Déclare les contraintes sur l'email et le mot de passe. |
| Messages de l'écran PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Affiche les instructions, confirmations et traductions d'erreurs PIN. |
| Validation du PIN | `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` | Définit le message personnalisé pour les quatre chiffres. |
| Limitation des tentatives PIN | `apps/backend/src/common/security/app-throttler.guard.ts`, `apps/backend/src/modules/auth/constants/attendance-entry.constants.ts` | Produit puis adapte le message de limitation du parcours PIN. |
| Messages du parcours de pointage | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Affiche les étapes, états de position, confirmations et erreurs d'envoi. |
| Messages de caméra | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` | Gère l'absence de caméra, l'autorisation, l'initialisation et la capture. |
| Horloge | `apps/frontend/components/attendance/attendance-live-clock.tsx` | Affiche « Heure actuelle » et « Synchronisé ». |
| Fin de session PIN | `apps/frontend/components/attendance/attendance-entry-session-button.tsx` | Affiche l'erreur lorsque la suppression de session échoue. |
| Relais des erreurs de pointage | `apps/frontend/lib/api-route.ts` | Extrait les messages backend, gère la session absente et les erreurs de connexion au backend. |
| Routes frontend d'entrée et sortie | `apps/frontend/app/api/attendance/me/check-in/route.ts`, `apps/frontend/app/api/attendance/me/check-out/route.ts` | Définissent les messages de repli propres à l'entrée et à la sortie. |
| Règles métier du pointage | `apps/backend/src/modules/attendance/attendance.service.ts` | Produit les conflits d'entrée/sortie et les erreurs temporelles. |
| Règles de sécurité | `apps/backend/src/modules/attendance/attendance-security.service.ts` | Produit les erreurs de selfie, de géolocalisation, de précision et de justification. |
| Validation de la preuve | `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts` | Définit les contraintes et le message du selfie. |
| État vide de l'historique | `apps/frontend/app/my-attendance/page.tsx` | Affiche les deux messages lorsqu'aucun pointage n'est disponible. |
| Erreur de la page QR | `apps/frontend/app/attendance-entry/error.tsx` | Affiche le contexte, indique qu'aucun pointage n'a été modifié et propose deux nouvelles tentatives. |
| Erreur de l'espace personnel | `apps/frontend/app/my-attendance/error.tsx` | Affiche le contexte, indique qu'aucun pointage n'a été modifié et propose deux nouvelles tentatives. |
| Redirections de session | `apps/frontend/middleware.ts`, `apps/frontend/lib/auth.ts`, `apps/frontend/app/attendance-entry/page.tsx` | Redirige ou réaffiche le PIN lorsque la session n'est pas utilisable. |
| Contrôle des rôles | `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Protège les endpoints personnels avec le rôle `EMPLOYEE`. |
