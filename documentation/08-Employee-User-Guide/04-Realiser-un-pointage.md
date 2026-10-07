Document ID : EUG-004

Titre : Réaliser un pointage

Version : 1.0

Statut : Validé

Classification : Interne

Référence : Employee User Guide

Projet : Konatech Pointage

# 1. Présentation

Le pointage employé enregistre une entrée ou une sortie dans Konatech Pointage. Le parcours principal implémenté utilise le QR Code de pointage, la page `/attendance-entry` et l'identification de l'employé par un PIN à quatre chiffres.

Après l'identification, l'application détermine l'action disponible à partir du pointage du jour : « Entrée » lorsqu'aucune entrée n'est enregistrée, puis « Sortie » lorsqu'une entrée existe sans sortie. Chaque action employé comporte la capture d'un selfie, la collecte de la position lorsqu'elle est disponible, un commentaire facultatif et une vérification avant l'enregistrement.

# 2. Conditions préalables

| Condition | Comportement établi par le dépôt |
|---|---|
| Compte employé actif | L'authentification PIN et les endpoints de pointage personnel ne sont accessibles qu'au rôle applicatif `EMPLOYEE`. Le compte est relu lors de la validation de la session. |
| PIN configuré | L'identification sur `/attendance-entry` recherche uniquement les employés actifs possédant un PIN. |
| Session de pointage valide | Les routes frontend de pointage utilisent le cookie dédié `konatech_attendance_entry_session`. Sans jeton utilisable, la page présente de nouveau l'écran PIN. |
| Action disponible | L'entrée est disponible en l'absence d'une entrée du jour. La sortie est disponible uniquement après une entrée du jour et avant toute sortie. |
| Caméra disponible et autorisée | Le parcours employé exige un selfie pour une entrée comme pour une sortie. Le composant utilise la caméra frontale du navigateur. |
| Configuration de stockage photo opérationnelle | Hors environnement de test, le backend envoie la photo de vérification au service Cloudinary configuré avant d'enregistrer le pointage. |
| Géolocalisation, lorsque la politique est active | Le backend exige une position et contrôle sa précision lorsque `ATTENDANCE_SECURITY_ENABLED` active la politique avec des coordonnées d'entreprise configurées. |

L'interface tente d'obtenir la position du navigateur pendant la préparation de la validation. Lorsque la politique de sécurité géographique n'est pas active, l'absence de position ne bloque pas l'enregistrement ; le selfie reste obligatoire dans tous les pointages employés.

# 3. Procédure de pointage

## 3.1 Ouvrir la page de pointage

1. Scanner le QR Code de pointage.
2. Le lien encodé ouvre `/attendance-entry`.
3. Saisir le PIN à quatre chiffres avec le pavé numérique.
4. Activer « OK » lorsque les quatre chiffres sont renseignés.
5. Après identification, vérifier que les initiales affichées correspondent à l'employé attendu.

## 3.2 Choisir l'action

1. Consulter l'écran « Que souhaitez-vous faire ? ».
2. Activer « Entrée — Début de journée » pour enregistrer l'arrivée lorsque ce bouton est disponible.
3. Activer « Sortie — Fin de journée » pour enregistrer le départ lorsque ce bouton est disponible.

Le bouton « Entrée » est désactivé après l'enregistrement de l'entrée du jour. Le bouton « Sortie » reste désactivé avant l'entrée et après l'enregistrement de la sortie.

## 3.3 Capturer le selfie

1. Sur l'étape du selfie, activer « Ouvrir la caméra » ou la zone portant le libellé accessible « Ouvrir la caméra ».
2. Autoriser l'accès à la caméra dans le navigateur.
3. Cadrez le visage dans l'aperçu, puis activer « Capturer ».
4. Après la capture, activer « Reprendre » pour remplacer la photo ou « Continuer » pour la conserver.

Le navigateur produit une image JPEG carrée de 720 × 720 pixels. Sans selfie capturé, l'application revient à cette étape et affiche « Le selfie est obligatoire pour valider ce pointage. ».

## 3.4 Renseigner le commentaire

L'étape « Ajouter un commentaire » est facultative dans le parcours courant. Le champ accepte jusqu'à 120 caractères dans l'interface. Les suggestions affichées sont « Retard », « Mission externe », « Rendez-vous client » et « Autre ».

- « Continuer » conserve le texte renseigné.
- « Passer cette étape » poursuit le pointage sans commentaire.

Lorsque la politique GPS est active et que la position se trouve hors du rayon autorisé, le backend exige toutefois un commentaire pour justifier le pointage hors bureau.

## 3.5 Vérifier et valider

Lors du passage à l'étape de validation, le navigateur tente d'obtenir la latitude, la longitude et la précision GPS. L'écran récapitule ensuite :

- le type de pointage ;
- l'employé ;
- la date ;
- l'heure ;
- l'état de la position ;
- le commentaire ou la mention « Aucun ».

Activer « Modifier » pour revenir à l'étape du commentaire, ou « Valider le pointage » pour envoyer les données. Pendant l'envoi, le bouton affiche « Enregistrement... ».

# 4. Informations enregistrées

| Information | Description |
|---|---|
| Employé | Référence du compte authentifié. Le backend utilise l'identifiant issu du JWT et non un identifiant saisi dans le formulaire. |
| Date du pointage | Date normalisée utilisée avec l'employé comme clé unique du pointage journalier. |
| Heure d'entrée | Instant `clockInAt` transmis depuis l'heure capturée au début du parcours d'entrée. |
| Heure de sortie | Instant `clockOutAt` transmis depuis l'heure capturée au début du parcours de sortie. |
| Statut | Valeur calculée parmi `PRESENT`, `LATE`, `INCOMPLETE`, `ABSENT` et `NON_WORKING_DAY_WORK`, selon le pointage, le planning et le calendrier. |
| Retard | Nombre de minutes après l'heure de début du planning et sa marge de retard. |
| Départ anticipé | Indicateur et nombre de minutes calculés lorsque la sortie précède l'heure de fin planifiée. |
| Sortie tardive et heures supplémentaires | Indicateur, minutes et heures calculés lorsque la sortie dépasse l'heure planifiée ; hors jour planifié, la durée travaillée alimente les heures supplémentaires. |
| Travail hors planning | Indicateur calculé à la sortie pour un jour non ouvré ou non prévu au planning. |
| Commentaire | Texte facultatif envoyé dans `notes`. Le DTO backend accepte au maximum 200 caractères ; l'interface limite la saisie à 120 caractères. |
| Instantané du planning | Identifiant, nom, heures, jours travaillés et marge du planning applicables au moment de l'entrée. |
| Données de position | Latitude, longitude, précision et distance calculée, enregistrées séparément pour l'entrée et la sortie lorsqu'une position est fournie. |
| Vérification | Méthode, niveau et motif de vérification enregistrés séparément pour l'entrée et la sortie. Avec le selfie du parcours employé, la méthode enregistrée est `PHOTO`. |
| Photo de vérification | URL sécurisée et identifiant public renvoyés par le stockage Cloudinary, séparément pour l'entrée et la sortie. |
| Compteur d'absences | Nombre mensuel recalculé lors du pointage à partir des jours planifiés, des jours non ouvrés et des présences enregistrées. |

# 5. Résultat du pointage

Après une réponse backend réussie, l'application affiche l'écran « Pointage enregistré ! ». Le récapitulatif indique le type de pointage, l'employé, la date, l'heure, l'état GPS et le résultat calculé.

Pour une entrée, le résultat affiché est « À l'heure » ou « Retard » avec le nombre de minutes. Pour une sortie, il indique « Sortie à l'heure », « Départ anticipé » avec le nombre de minutes, ou « Heures supplémentaires » avec la durée.

Dans le parcours `/attendance-entry`, le bouton « Nouveau pointage » efface la session PIN courante, revient sur `/attendance-entry` et présente l'identification PIN pour l'employé suivant.

# 6. Cas particuliers

| Cas géré | Comportement observé | Source principale |
|---|---|---|
| Entrée déjà enregistrée pour la journée | L'action d'entrée est désactivée dans l'interface. Le backend rejette aussi une nouvelle entrée avec `A check-in has already been recorded for this attendance day.`. | `apps/frontend/components/attendance/employee-attendance-actions.tsx`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| Nouvelle entrée après une sortie | Le backend rejette l'opération avec `Cannot record a new check-in after the attendance has been checked out.`. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Sortie avant toute entrée | Le bouton de sortie est désactivé. Le backend rejette aussi la demande avec `Cannot check out before a check-in has been recorded.`. | `apps/frontend/components/attendance/employee-attendance-actions.tsx`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| Sortie déjà enregistrée | Le bouton de sortie est désactivé et le backend répond `A check-out has already been recorded for this attendance day.`. | `apps/frontend/components/attendance/employee-attendance-actions.tsx`, `apps/backend/src/modules/attendance/attendance.service.ts` |
| Heure de sortie antérieure à l'entrée | Le backend refuse l'enregistrement avec `Check-out time cannot be earlier than check-in time.`. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Heure fournie dans le futur | Le backend refuse l'opération avec `occurredAt cannot be in the future.`. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Retard | Le backend compare l'entrée à l'heure de début et à la marge du planning. Il enregistre `LATE` et le nombre de minutes lorsque le résultat est positif. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Pointage sans planning actif ou hors jour planifié | L'entrée reçoit initialement le statut `INCOMPLETE` et aucun retard. La sortie détermine si le travail est hors planning. | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Pointage un jour non ouvré | Le statut `NON_WORKING_DAY_WORK` est appliqué ; la sortie calcule la durée travaillée hors planning. | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/common/utils/attendance-checkout.util.ts` |
| Selfie absent ou invalide | Le frontend bloque la progression sans selfie. Le backend refuse aussi une preuve absente ou hors format avec « Selfie requis pour valider le pointage. ». | `apps/frontend/components/attendance/employee-attendance-actions.tsx`, `apps/backend/src/modules/attendance/attendance-security.service.ts`, `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts` |
| Caméra indisponible ou refusée | Le composant affiche « La caméra n'est pas disponible sur cet appareil. » ou « Autorisez la caméra pour valider le pointage. ». | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` |
| Politique GPS active sans position | Le backend refuse le pointage avec « Géolocalisation requise pour valider le pointage. ». | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Précision GPS insuffisante lorsque la politique est active | Le backend refuse le pointage avec « Précision GPS insuffisante. ». | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Position hors rayon autorisé sans commentaire | Le backend demande « Ajoutez un commentaire pour justifier ce pointage hors bureau. ». Avec un commentaire, le motif de vérification enregistré est `OFFSITE_LOCATION_JUSTIFIED`. | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Session PIN absente ou expirée | La route frontend renvoie « Session expiree. » ou la page revient à la saisie du PIN et efface la session devenue invalide. | `apps/frontend/lib/api-route.ts`, `apps/frontend/app/attendance-entry/page.tsx` |
| Stockage de la photo indisponible | Le backend n'enregistre pas le pointage et renvoie une erreur après les tentatives d'envoi configurées. | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Connexion indisponible pendant l'envoi | L'écran de validation affiche « Connexion indisponible. Réessayez dans quelques instants. ». | `apps/frontend/components/attendance/employee-attendance-actions.tsx` |

# 7. Flux fonctionnel

```text
QR Code
   |
   v
/attendance-entry
   |
   v
PIN à 4 chiffres
   |
   v
Employé identifié
   |
   v
Entrée disponible ? -------- non --------> Sortie disponible ?
   |                                      |
  oui                                    oui
   |                                      |
   +------------------+-------------------+
                      |
                      v
              Choix Entrée ou Sortie
                      |
                      v
               Selfie obligatoire
                      |
                      v
              Commentaire facultatif
                      |
                      v
             Collecte GPS disponible
                      |
                      v
             Vérification du résumé
                      |
                      v
              Valider le pointage
                      |
                      v
       Contrôles métier et de sécurité
                      |
                      v
           Enregistrement PostgreSQL
                      |
                      v
              Confirmation affichée
                      |
                      v
        « Nouveau pointage » -> écran PIN
```

# 8. Références

| Élément documenté | Fichier source | Preuve observée |
|---|---|---|
| Adresse du QR Code | `apps/frontend/app/page.tsx`, `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` | Construit et encode l'adresse `/attendance-entry`. |
| Identification PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`, `apps/backend/src/modules/auth/auth.service.ts` | Saisie de quatre chiffres et recherche d'un compte `EMPLOYEE` actif. |
| Chargement de la page de pointage | `apps/frontend/app/attendance-entry/page.tsx` | Vérifie la session dédiée, l'utilisateur et les données du jour. |
| Vue de pointage | `apps/frontend/components/attendance/fixed-attendance-entry-view.tsx` | Transmet l'état du jour, l'utilisateur et le mode de session au composant d'actions. |
| Parcours Entrée/Sortie | `apps/frontend/components/attendance/employee-attendance-actions.tsx` | Implémente le choix, le selfie, le commentaire, le GPS, la validation et la confirmation. |
| Capture de la photo | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` | Ouvre la caméra frontale et produit le selfie JPEG. |
| Collecte de la position | `apps/frontend/components/attendance/attendance-browser-security.ts` | Utilise la géolocalisation du navigateur et retourne coordonnées et précision. |
| Routes frontend de pointage | `apps/frontend/app/api/attendance/me/check-in/route.ts`, `apps/frontend/app/api/attendance/me/check-out/route.ts` | Transmettent les requêtes d'entrée et de sortie avec la session de pointage. |
| Transmission de la session | `apps/frontend/lib/api-route.ts` | Ajoute le JWT de la session dédiée dans l'en-tête `Authorization`. |
| Endpoints employé | `apps/backend/src/modules/attendance/attendance.controller.ts` | Expose `me/check-in` et `me/check-out` au rôle `EMPLOYEE`. |
| Règles de pointage | `apps/backend/src/modules/attendance/attendance.service.ts` | Contrôle l'ordre des actions et calcule retard, statut, départ anticipé, heures supplémentaires et absences. |
| Résultat de sortie | `apps/backend/src/common/utils/attendance-checkout.util.ts` | Calcule départ anticipé, sortie tardive et durée hors planning. |
| Preuves de sécurité | `apps/backend/src/modules/attendance/attendance-security.service.ts` | Valide selfie, position, précision et justification hors zone, puis construit les métadonnées. |
| Politique GPS | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` | Active les contrôles géographiques uniquement avec le paramètre et les coordonnées configurés. |
| Validation des requêtes | `apps/backend/src/modules/attendance/dto/self-check-in.dto.ts`, `apps/backend/src/modules/attendance/dto/self-check-out.dto.ts`, `apps/backend/src/modules/attendance/dto/check-in-security.dto.ts` | Valide l'instant, les notes, les coordonnées, la précision et le format du selfie. |
| Stockage de la photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` | Téléverse la photo vers Cloudinary et renvoie son URL sécurisée et son identifiant public. |
| Persistance du pointage | `apps/backend/prisma/schema.prisma` | Définit les heures, statuts, calculs, notes, instantanés de planning et preuves d'entrée/sortie. |
