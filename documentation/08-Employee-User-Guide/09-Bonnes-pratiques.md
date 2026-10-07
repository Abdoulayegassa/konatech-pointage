Document ID : EUG-009

Titre : Bonnes pratiques

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# 1. Présentation

Les pratiques décrites ici correspondent aux contrôles, écrans et validations réellement présents dans Konatech Pointage. Elles décrivent la manière d'utiliser les parcours existants afin que les informations saisies correspondent à l'action souhaitée et que le résultat puisse être vérifié dans l'application.

# 2. Avant de pointer

- Ouvrir le QR Code qui mène à `/attendance-entry`, puis attendre l'écran de saisie du PIN lorsqu'aucune session de pointage valide n'est présente.
- Saisir exactement les quatre chiffres du PIN. Le bouton « OK » n'est activé qu'une fois ces quatre chiffres présents.
- Vérifier le nom complet et le détail affichés après l'acceptation du PIN avant de continuer vers la vue de pointage.
- Utiliser le bouton disponible correspondant à l'action réelle : « Entrée — Début de journée » ou « Sortie — Fin de journée ». L'état désactivé des boutons reflète le pointage déjà enregistré pour la journée.
- Lorsque l'écran demande une preuve, ouvrir la caméra et capturer un selfie. Le backend exige cette photo pour les actions employé.

# 3. Pendant le pointage

- Cadrer le visage dans l'aperçu de la caméra ; le composant affiche ce libellé et fournit une capture carrée.
- Vérifier la photo capturée. « Reprendre » remplace la photo ; « Continuer » la conserve pour l'étape suivante.
- Utiliser le commentaire uniquement lorsque le contexte doit être transmis. Le champ est facultatif dans l'interface et propose « Retard », « Mission externe », « Rendez-vous client » et « Autre ».
- Lorsque la politique GPS active détecte une position hors du rayon autorisé, renseigner un commentaire : le backend refuse alors une demande sans justification.
- Sur l'écran « Validation », relire le type de pointage, l'employé, la date, l'heure, l'état GPS et le commentaire avant d'activer « Valider le pointage ».
- Utiliser « Modifier » pour revenir au commentaire lorsque le récapitulatif ne correspond pas aux informations à envoyer.
- Laisser la collecte de position du navigateur se terminer lorsque la politique GPS est active ; le backend contrôle la présence de la position et sa précision dans ce cas.

# 4. Après le pointage

- Vérifier l'écran « Pointage enregistré ! », le type d'action et l'heure affichée.
- Lire le résultat calculé : « À l'heure », « Retard », « Sortie à l'heure », « Départ anticipé » ou « Heures supplémentaires », selon le pointage enregistré.
- Vérifier l'état affiché à la ligne « GPS » lorsque la position a été collectée.
- Pour l'espace personnel, consulter la section « Historique » de `/my-attendance`. Elle charge automatiquement le mois UTC courant et affiche les huit pointages les plus récents.
- Après un pointage sur le parcours QR, utiliser « Nouveau pointage » pour effacer la session PIN courante et revenir à la saisie du PIN.

# 5. Sécurité du compte

- La connexion par compte utilise l'adresse électronique et le mot de passe validés par `LoginDto`. La session résultante est conservée dans le cookie HTTP-only `konatech_session`.
- La session de pointage PIN est distincte, dans `konatech_attendance_entry_session`, et n'est pas confondue avec la session de compte.
- Le backend vérifie le statut actif du compte lors de l'authentification et lors de la lecture d'un JWT existant.
- Les routes personnelles de présence exigent un JWT `Bearer` et le rôle applicatif `EMPLOYEE`.
- Le bouton « Se déconnecter » du compte efface les deux cookies de session et redirige vers `/login`.
- Une session PIN devenue invalide est effacée par le parcours `/attendance-entry`, qui revient alors à l'écran PIN.

# 6. Erreurs à éviter

| Situation | Conséquence observée |
|---|---|
| Saisir un PIN qui ne contient pas exactement quatre chiffres | Le bouton de validation reste désactivé ou le backend renvoie « Le code PIN doit contenir exactement 4 chiffres. ». |
| Utiliser un PIN qui ne correspond pas à un employé actif autorisé | L'écran affiche « Code PIN invalide. » et aucune session PIN n'est créée. |
| Sélectionner « Entrée » alors qu'une entrée existe déjà | Le bouton est désactivé ; le backend refuse aussi la demande avec `A check-in has already been recorded for this attendance day.`. |
| Sélectionner « Sortie » avant l'entrée | Le bouton est désactivé ; le backend refuse la sortie avec `Cannot check out before a check-in has been recorded.`. |
| Valider sans selfie | Le parcours revient à l'étape selfie ou le backend renvoie « Selfie requis pour valider le pointage. ». |
| Refuser la caméra ou utiliser un appareil sans caméra | La capture affiche un message d'erreur et l'action ne peut pas être validée sans photo. |
| Envoyer une position hors zone sans commentaire lorsque la politique est active | Le backend renvoie « Ajoutez un commentaire pour justifier ce pointage hors bureau. » et ne crée pas le pointage. |
| Envoyer une position dont la précision est insuffisante lorsque la politique est active | Le backend renvoie « Précision GPS insuffisante. » et refuse l'enregistrement. |
| Fermer ou quitter la session avant la confirmation | Aucun écran de succès n'est produit ; le résultat n'est considéré comme enregistré qu'après la réponse réussie et l'affichage de « Pointage enregistré ! ». |
| Utiliser une session absente ou expirée | `/my-attendance` redirige vers `/login`, tandis que `/attendance-entry` efface la session PIN et réaffiche le pavé. |
| Ouvrir la gestion des employés avec un rôle `EMPLOYEE` | La page frontend redirige vers `/my-attendance` et le contrôleur backend réserve ses routes au rôle `ADMIN`. |
| Quitter un écran d'erreur sans utiliser ses actions | Les pages d'erreur fournissent « Réessayer » et « Recharger la page » ; aucun pointage n'est modifié par l'erreur de rendu affichée. |

# 7. Références

| Pratique ou comportement | Fichier source | Preuve observée |
|---|---|---|
| Accès QR et saisie du PIN | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Sélection de la vue PIN sans session et contrôle de quatre chiffres. |
| Identification de l'employé | `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/dto/attendance-entry-login.dto.ts` | Recherche d'un employé actif `EMPLOYEE`, validation du PIN et émission de la session. |
| Sélection entrée/sortie | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Activation conditionnelle des boutons à partir de `canCheckIn` et `canCheckOut`. |
| Capture du selfie | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` | Caméra, capture JPEG, reprise et messages d'erreur. |
| Commentaire et validation | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Étape facultative, suggestions, limite d'interface, récapitulatif et bouton de validation. |
| Collecte et politique GPS | `apps/frontend/components/attendance/attendance-browser-security.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Position navigateur, obligation conditionnelle, précision et justification hors rayon. |
| Règles métier entrée/sortie | `apps/backend/src/modules/attendance/attendance.service.ts` | Doublons, ordre entrée/sortie, dates futures, retards et résultats de sortie. |
| Confirmation du pointage | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Écran de succès, heures et statuts calculés. |
| Historique personnel | `apps/frontend/app/my-attendance/page.tsx`, `apps/frontend/lib/api.ts`, `apps/backend/src/modules/attendance/attendance.service.ts` | Mois courant, huit éléments récents et données filtrées par employé. |
| Sessions et déconnexion | `apps/frontend/lib/auth-session.ts`, `apps/frontend/app/api/auth/logout/route.ts`, `apps/frontend/components/auth/logout-form.tsx`, `apps/frontend/components/attendance/attendance-entry-session-button.tsx` | Cookies distincts, effacement et retour vers les écrans de connexion ou PIN. |
| Protection des routes | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts`, `apps/backend/src/modules/attendance/attendance.controller.ts` | JWT `Bearer` et restriction des routes personnelles au rôle `EMPLOYEE`. |
| Gestion des erreurs de rendu | `apps/frontend/app/attendance-entry/error.tsx`, `apps/frontend/app/my-attendance/error.tsx` | Messages d'erreur, absence de modification du pointage et actions de reprise. |
| Accès administratif | `apps/frontend/app/employees/page.tsx`, `apps/backend/src/modules/employees/employees.controller.ts` | Redirection frontend et rôle `ADMIN` requis par le contrôleur. |
