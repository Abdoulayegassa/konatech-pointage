Document ID : EUG-008

Titre : Questions fréquentes

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# Questions fréquentes

## Comment accéder à mon espace personnel ?

Ouvrez `/login`, saisissez l'adresse électronique et le mot de passe du compte, puis activez « Se connecter ». Un compte dont le rôle applicatif est `EMPLOYEE` est redirigé vers `/my-attendance` après une authentification réussie.

## Quelles informations sont demandées pour la connexion par compte ?

Le formulaire demande « Email » et « Mot de passe ». Le backend valide le format de l'adresse électronique et exige un mot de passe d'au moins huit caractères avant de vérifier le compte.

## Comment ouvrir le parcours de pointage ?

Le QR Code de pointage encode l'adresse `/attendance-entry`. Après son ouverture, la page demande un PIN à quatre chiffres lorsqu'aucune session de pointage valide n'est présente.

## Pourquoi le code PIN comporte-t-il quatre chiffres ?

Le DTO backend du parcours `attendance-entry/login` n'accepte qu'une chaîne correspondant exactement à quatre chiffres. Le bouton « OK » de l'écran PIN reste désactivé avant la saisie des quatre chiffres.

## Que se passe-t-il si le PIN est incorrect ?

Le backend renvoie `Identifiants invalides.` et l'écran affiche « Code PIN invalide. ». La session PIN n'est pas créée et le pavé reste disponible.

## Que se passe-t-il après un PIN accepté ?

Une confirmation affiche le nom complet de l'employé et un détail issu du compte, puis `/attendance-entry` charge la vue de pointage pour un compte portant le rôle `EMPLOYEE`.

## Comment choisir entre une entrée et une sortie ?

Dans la vue de pointage, « Entrée — Début de journée » est disponible lorsqu'aucune entrée du jour n'est enregistrée. « Sortie — Fin de journée » devient disponible après une entrée et avant toute sortie.

## Pourquoi le bouton Entrée ou Sortie est-il désactivé ?

L'entrée est désactivée lorsqu'une entrée existe déjà pour le jour. La sortie est désactivée avant l'entrée ou après une sortie. Le backend applique les mêmes contrôles et refuse également les demandes incohérentes.

## Le selfie est-il demandé pour chaque pointage ?

Oui. Le parcours employé exige une photo de vérification pour l'entrée comme pour la sortie. Sans selfie, le frontend revient à l'étape de capture et le backend refuse la demande avec « Selfie requis pour valider le pointage. ».

## Que faire si la caméra ne s'ouvre pas ?

Le composant affiche « La caméra n'est pas disponible sur cet appareil. » lorsque l'API caméra est absente, ou « Autorisez la caméra pour valider le pointage. » lorsque l'ouverture échoue. La capture ne peut pas être validée sans photo.

## La position GPS est-elle toujours bloquante ?

La page affiche le libellé « GPS obligatoire » et tente de collecter la position du navigateur. Le backend n'exige la géolocalisation que lorsque la politique de sécurité est active et que les coordonnées de l'entreprise sont configurées. Le selfie reste obligatoire même lorsque cette politique n'est pas active.

## Que se passe-t-il hors de la zone autorisée ?

Lorsque la politique GPS active calcule une distance supérieure au rayon autorisé, le backend exige un commentaire. Sans commentaire, le message « Ajoutez un commentaire pour justifier ce pointage hors bureau. » est renvoyé. Avec un commentaire, le pointage est enregistré avec le motif `OFFSITE_LOCATION_JUSTIFIED`.

## Le commentaire est-il obligatoire ?

Le champ est présenté comme facultatif et le bouton « Passer cette étape » permet de continuer sans texte. Dans le parcours affiché, la saisie est limitée à 120 caractères. Une justification devient obligatoire lorsque la politique GPS active détecte un pointage hors du rayon autorisé.

## Comment le retard est-il déterminé ?

Le backend compare l'heure d'entrée à l'heure de début du planning et à sa marge de retard. Lorsque le nombre de minutes calculé est positif, le pointage reçoit le statut `LATE` et l'écran de succès affiche « Retard » avec le nombre de minutes.

## Comment les départs anticipés et les heures supplémentaires sont-ils affichés ?

À la sortie, l'heure est comparée à l'heure de fin planifiée. Une sortie plus tôt affiche « Départ anticipé » et le nombre de minutes. Une sortie plus tard affiche « Heures supplémentaires » avec la durée calculée. Le travail effectué hors planning utilise la durée entre l'entrée et la sortie.

## Où consulter mon historique ?

L'historique personnel est intégré à `/my-attendance`, après la connexion par compte. La page demande automatiquement le mois UTC courant à `GET /attendance/me/history` et l'affiche sous les indicateurs mensuels. La vue QR `/attendance-entry` sert au pointage et ne rend pas cette section historique.

## Combien de pointages sont affichés dans l'historique ?

Le badge « Historique » indique le nombre total de résultats du mois courant. La liste visible conserve au maximum les huit éléments les plus récents, déjà triés par date décroissante puis par date de création décroissante.

## Que signifie l'état « Aucun pointage enregistré » ?

Il indique que l'API n'a renvoyé aucun pointage pour le mois courant. La page affiche aussi « Vos derniers pointages apparaîtront ici. » et le badge de la section vaut zéro.

## Puis-je modifier les informations de mon profil ?

Le dépôt ne contient pas de page de profil employé ni de formulaire employé pour modifier le prénom, le nom, l'adresse électronique, la fonction ou le mot de passe. Les routes de gestion des employés sont protégées par le rôle `ADMIN`. Les écrans employé affichent seulement l'identité utile au parcours courant.

## Comment fermer ma session ?

Dans `/my-attendance`, le bouton « Se déconnecter » appelle la route frontend de déconnexion, efface les cookies de session de compte et de pointage, puis redirige vers `/login`. Après un pointage QR réussi, « Nouveau pointage » efface la session PIN et revient à la saisie du PIN.

## Que se passe-t-il si ma session expire ?

Une session de compte absente ou invalide redirige vers `/login`. Une session PIN absente, invalide ou expirée fait revenir `/attendance-entry` à l'écran de saisie du PIN et efface la session dédiée devenue inutilisable.

## Que faire lorsqu'une page de pointage ne se charge pas ?

Les pages d'erreur `/attendance-entry` et `/my-attendance` affichent le contexte de l'erreur, indiquent qu'aucun pointage n'a été modifié et proposent « Réessayer » ainsi que « Recharger la page ».

# Références

| Questions couvertes | Fichiers analysés | Preuve observée |
|---|---|---|
| Connexion, session de compte et redirection employé | `apps/frontend/app/login/page.tsx`, `apps/frontend/components/auth/login-form.tsx`, `apps/frontend/app/api/auth/login/route.ts`, `apps/frontend/lib/redirect.ts` | Formulaire email/mot de passe, création de `konatech_session` et destination `/my-attendance` pour `EMPLOYEE`. |
| Validation du compte | `apps/backend/src/modules/auth/dto/login.dto.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Contraintes de l'email et du mot de passe, contrôle du compte actif et vérification des identifiants. |
| QR Code et accès `/attendance-entry` | `apps/frontend/app/page.tsx`, `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`, `apps/frontend/app/attendance-entry/page.tsx` | Adresse du QR, lecture de la session PIN et sélection de la vue employé. |
| PIN et limitation des tentatives | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts`, `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/common/security/app-throttler.guard.ts` | Saisie de quatre chiffres, messages d'erreur, session dédiée et contrôle des tentatives. |
| Choix entrée/sortie et selfie | `apps/frontend/components/attendance/employee-attendance-actions.tsx`, `apps/frontend/components/attendance/attendance-selfie-capture.tsx` | Disponibilité des boutons, étapes de capture et messages liés à la caméra et au selfie. |
| Règles entrée/sortie | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` | Contrôle des doublons, ordre entrée/sortie, rôle `EMPLOYEE` et erreurs métier. |
| GPS et justificatif hors zone | `apps/frontend/components/attendance/attendance-browser-security.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Collecte de la position, activation conditionnelle de la politique et commentaire hors rayon. |
| Validation des preuves et commentaire | `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts`, `apps/backend/src/modules/attendance/dto/self-check-in.dto.ts`, `apps/backend/src/modules/attendance/dto/self-check-out.dto.ts` | Format du selfie, coordonnées et longueur backend des notes. |
| Retard et sortie | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/common/utils/attendance-checkout.util.ts`, `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Calcul du retard, du départ anticipé et des heures supplémentaires, puis affichage du résultat. |
| Historique employé | `apps/frontend/app/my-attendance/page.tsx`, `apps/frontend/lib/api.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Mois courant, endpoint personnel, huit éléments récents et état vide. |
| Profil et accès administratif | `apps/frontend/app/employees/page.tsx`, `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/modules/employees/dto/update-employee.dto.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` | Redirection de l'employé et protection `ADMIN` des opérations de gestion des comptes. |
| Déconnexion et expiration | `apps/frontend/components/auth/logout-form.tsx`, `apps/frontend/app/api/auth/logout/route.ts`, `apps/frontend/components/attendance/attendance-entry-session-button.tsx`, `apps/frontend/lib/auth.ts`, `apps/frontend/middleware.ts` | Effacement des cookies, redirections et contrôle des sessions. |
| Pages d'erreur | `apps/frontend/app/attendance-entry/error.tsx`, `apps/frontend/app/my-attendance/error.tsx` | Messages de rendu, indication qu'aucun pointage n'a été modifié et actions de reprise. |
