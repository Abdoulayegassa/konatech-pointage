# Présentation

| Métadonnée | Valeur |
|---|---|
| Document ID | EUG-001 |
| Titre | Présentation |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Employee User Guide |
| Projet | Konatech Pointage |

# 1. Présentation

Konatech Pointage permet à un employé d'enregistrer son entrée et sa sortie, de consulter les heures enregistrées pour la journée et de retrouver un aperçu de ses pointages du mois en cours.

Deux accès employé sont implémentés :

- le parcours de pointage fixe `/attendance-entry`, ouvert depuis le QR Code et protégé par un code PIN à quatre chiffres ;
- l'espace personnel `/my-attendance`, accessible après une connexion par courriel et mot de passe avec un compte portant le rôle d'accès `EMPLOYEE`.

Les deux accès utilisent les mêmes opérations backend de pointage personnel. L'application détermine si l'entrée ou la sortie est disponible à partir du pointage de la journée.

# 2. Objectif de l'application

Du point de vue de l'employé, l'application assure les fonctions suivantes :

- identifier l'employé par son PIN dans le parcours QR ou par son compte dans l'espace personnel ;
- afficher l'état du pointage du jour ;
- enregistrer le début de journée par l'action « Entrée » ;
- enregistrer la fin de journée par l'action « Sortie » ;
- associer au pointage un selfie, une position lorsqu'elle est disponible et un commentaire éventuel ;
- appliquer la politique de localisation configurée par le backend lorsqu'elle est active ;
- restituer le résultat calculé après l'enregistrement : heure, retard, départ anticipé ou heures supplémentaires selon le cas ;
- afficher dans l'espace personnel des indicateurs et les pointages récents du mois courant.

Le backend reste la source du résultat enregistré. Il vérifie notamment l'ordre entrée-sortie, l'unicité quotidienne, l'horodatage, les preuves de sécurité employé et l'état actif du compte.

# 3. À qui s'adresse ce guide

Ce guide s'adresse aux utilisateurs dont le compte porte le rôle d'accès `EMPLOYEE` dans le modèle `Employee`.

Un compte employé peut utiliser :

- son code PIN pour une session dédiée au pointage sur `/attendance-entry` ;
- son courriel et son mot de passe sur `/login`, après quoi l'application le redirige vers `/my-attendance`.

Les écrans d'administration des employés, plannings, calendrier, sanctions, exports, historique RH et Dashboard ne font pas partie de l'expérience employé. Lorsqu'un compte `EMPLOYEE` atteint les pages concernées, leurs contrôles serveur le redirigent vers `/my-attendance`.

# 4. Fonctionnalités accessibles à l'employé

| Fonctionnalité | Description |
|---|---|
| Ouverture par QR Code | Le QR Code généré dans le Dashboard encode le lien fixe qui mène au parcours `/attendance-entry`. |
| Identification par PIN | Un clavier numérique permet de saisir et valider le code PIN employé à quatre chiffres. |
| Session de pointage PIN | Après validation du PIN, une session dédiée affiche l'identité de l'employé et les actions autorisées pour la journée. |
| Connexion par compte | Le formulaire `/login` reçoit courriel et mot de passe ; un utilisateur `EMPLOYEE` est dirigé vers `/my-attendance`. |
| Consultation du pointage du jour | L'espace personnel affiche les heures d'entrée et de sortie, ainsi que l'action actuellement disponible. |
| Enregistrement de l'entrée | L'action « Entrée » est active lorsque le backend indique `canCheckIn`. |
| Enregistrement de la sortie | L'action « Sortie » est active après une entrée non encore clôturée, lorsque le backend indique `canCheckOut`. |
| Capture du selfie | Le parcours d'enregistrement exige un selfie avant de poursuivre. |
| Acquisition de la position | Le navigateur tente d'obtenir latitude, longitude et précision avant la validation. Le backend exige ces données lorsque sa politique GPS est active. |
| Commentaire | Une étape permet de saisir jusqu'à 120 caractères, de choisir une suggestion rapide ou de passer l'étape. Hors de la zone autorisée, le backend exige une justification lorsque la politique GPS est active. |
| Vérification avant enregistrement | Un récapitulatif affiche le type de pointage, l'employé, la date, l'heure, l'état GPS et le commentaire avant l'action « Valider le pointage ». |
| Confirmation du pointage | L'écran de succès affiche l'heure enregistrée et le résultat calculé : à l'heure, retard, sortie à l'heure, départ anticipé ou heures supplémentaires. |
| Nouveau pointage | Après un succès dans le parcours PIN, le bouton « Nouveau pointage » ferme la session PIN et revient à la saisie du code. Dans l'espace personnel, il revient au choix de l'action. |
| Indicateurs mensuels personnels | `/my-attendance` affiche le nombre d'absences, les heures travaillées, les départs anticipés et les heures supplémentaires du mois courant. |
| Historique récent | `/my-attendance` affiche au maximum les huit premiers pointages de l'historique mensuel retourné, avec date, entrée, sortie et indication GPS validé lorsqu'elle s'applique. |
| État de la politique GPS | L'espace personnel indique « GPS actif » et le rayon autorisé, ou « Pointage direct » et « GPS non requis » lorsque la politique est désactivée. |
| Déconnexion | L'espace personnel propose « Se déconnecter ». Le parcours PIN permet de fermer sa session par l'action de nouveau pointage après confirmation. |

# 5. Parcours général

## 5.1 Parcours QR et PIN

```text
QR Code de pointage
        |
        v
/attendance-entry
        |
        v
Saisie du PIN à 4 chiffres
        |
        v
Identification de l'employé
        |
        v
Choix « Entrée » ou « Sortie » selon l'état du jour
        |
        v
Capture obligatoire du selfie
        |
        v
Commentaire facultatif
        |
        v
Acquisition de la position par le navigateur
        |
        v
Vérification des informations
        |
        v
Validation par le backend
        |
        +---- refus : message affiché dans l'étape de validation
        |
        +---- succès
                  |
                  v
           Résultat du pointage
                  |
                  v
           « Nouveau pointage »
                  |
                  v
           Fermeture de la session PIN
```

Le commentaire est facultatif dans l'interface, mais devient nécessaire pour justifier un pointage hors du rayon autorisé lorsque la politique GPS est active. Si cette politique est active, l'absence de position ou une précision insuffisante provoque également un refus du backend.

## 5.2 Parcours par compte employé

```text
/login
   |
   v
Courriel et mot de passe
   |
   v
Compte EMPLOYEE reconnu
   |
   v
/my-attendance
   |
   +---- heure courante et état GPS
   +---- entrée et sortie du jour
   +---- action de pointage disponible
   +---- indicateurs du mois courant
   +---- huit pointages récents au maximum
   |
   v
« Se déconnecter »
   |
   v
/login
```

# 6. Organisation du guide

Au moment de l'analyse du dépôt, `documentation/08-Employee-User-Guide/01-Presentation.md` est le seul chapitre présent dans l'Employee User Guide. Aucun titre ni contenu de chapitre suivant n'est donc établi par les fichiers existants.

Le présent chapitre organise les informations disponibles en quatre ensembles vérifiables : accès employé, actions de pointage, preuves demandées pendant l'enregistrement et consultation personnelle sur `/my-attendance`.

# 7. Références

| Élément documenté | Fichier ou répertoire source | Preuve observée |
|---|---|---|
| Positionnement fonctionnel | `README.md` | Pointage employé, routes frontend et sécurité GPS |
| Rôle employé | `apps/backend/prisma/schema.prisma` | Modèle `Employee` et valeur `EMPLOYEE` de `AccessRole` |
| Redirection après connexion | `apps/frontend/lib/redirect.ts` | Chemin par défaut `/my-attendance` pour `EMPLOYEE` |
| Protection de l'espace personnel | `apps/frontend/middleware.ts` | Protection de `/my-attendance` par cookie de session |
| Formulaire de connexion | `apps/frontend/components/auth/login-form.tsx` | Courriel, mot de passe et traitement de connexion |
| Page personnelle | `apps/frontend/app/my-attendance/page.tsx` | État du jour, actions, indicateurs, historique récent et déconnexion |
| Page fixe de pointage | `apps/frontend/app/attendance-entry/page.tsx` | Session PIN, contrôle du rôle et chargement du pointage |
| Saisie du PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` | Clavier numérique, quatre chiffres, validation et retours d'erreur |
| Session PIN frontend | `apps/frontend/app/api/auth/attendance-entry-session/route.ts` | Connexion PIN, cookie dédié et fermeture de session |
| Vue du parcours fixe | `apps/frontend/components/attendance/fixed-attendance-entry-view.tsx` | Identité employé et actions de pointage |
| Étapes du pointage | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Action, selfie, commentaire, vérification, soumission et succès |
| Capture selfie | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` | Capture et retour de la Data URL |
| Position navigateur | `apps/frontend/components/attendance/attendance-browser-security.ts` | Acquisition de la position et calcul de distance d'affichage |
| Proxies de pointage | `apps/frontend/app/api/attendance/me/check-in/route.ts`, `apps/frontend/app/api/attendance/me/check-out/route.ts` | Transmission aux routes backend employé |
| Routes backend employé | `apps/backend/src/modules/attendance/attendance.controller.ts` | Routes `/attendance/me` protégées par le rôle `EMPLOYEE` |
| Connexion PIN backend | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts` | Validation du PIN et émission de la session employé |
| État et historique personnels | `apps/backend/src/modules/attendance/attendance.service.ts` | Disponibilité des actions, pointage du jour et historique mensuel |
| Preuves de sécurité | `apps/backend/src/modules/attendance/attendance-security.service.ts` | Selfie employé, politique GPS et justification hors zone |
| Politique GPS | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Activation, rayons, coordonnées et précision maximale |
| Génération du QR Code | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` | QR du lien fixe de pointage |
| Exclusion des pages administratives | `apps/frontend/app/employees/page.tsx`, `apps/frontend/app/schedules/page.tsx`, `apps/frontend/app/calendar/page.tsx`, `apps/frontend/app/exports/page.tsx`, `apps/frontend/app/sanctions/page.tsx`, `apps/frontend/app/attendance-history/page.tsx` | Redirection des utilisateurs non administrateurs vers `/my-attendance` |
