# Système de pointage

| Métadonnée | Valeur |
| --- | --- |
| Document ID | DG-007 |
| Titre | Système de pointage |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | Developer Guide |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif

Ce chapitre décrit l'implémentation actuelle du système de pointage de Konatech Pointage. Il couvre les interfaces frontend, les routes HTTP, les validations, la logique métier NestJS et la persistance Prisma/PostgreSQL qui participent à l'enregistrement et à la consultation des entrées et sorties.

La description porte sur le code présent dans le dépôt. Elle distingue le parcours employé sur le terminal de pointage, les opérations administratives exposées par l'API et les traitements mensuels exécutés par le backend.

### 1.2 Rôle du système de pointage

Le système remplit les fonctions observables suivantes :

- authentifier un employé sur l'interface de pointage au moyen de son PIN ;
- déterminer si l'employé peut enregistrer une entrée ou une sortie pour la date courante ;
- collecter une photo avant une action employé ;
- tenter de collecter une position géographique depuis le navigateur ;
- appliquer, lorsqu'elle est activée et configurée, la politique de sécurité géographique ;
- enregistrer l'heure d'entrée ou de sortie ;
- confronter le pointage au planning et au calendrier des jours non ouvrés ;
- calculer le retard à l'entrée et les résultats de sortie ;
- conserver un instantané du planning applicable au moment de l'entrée ;
- restituer le pointage du jour et l'historique de l'employé ;
- permettre à un administrateur d'enregistrer une entrée ou une sortie par les routes backend dédiées.

L'interface publique de pointage ne crée pas directement un enregistrement. Elle ouvre un parcours d'identification employé, puis utilise une session courte protégée avant d'appeler les routes de pointage.

## 2. Architecture fonctionnelle

### 2.1 Composants

| Couche | Composants réellement impliqués | Responsabilité |
| --- | --- | --- |
| Interface de pointage | `attendance-entry/page.tsx`, `attendance-entry-pin-view.tsx`, `fixed-attendance-entry-view.tsx`, `employee-attendance-actions.tsx` | Saisie du PIN, choix de l'action disponible, capture de la photo, tentative de géolocalisation, commentaire et affichage du résultat |
| Session frontend | Route Next.js `api/auth/attendance-entry-session`, utilitaires de session | Création, lecture et suppression du cookie de session courte utilisé par le terminal |
| Proxy frontend | Routes Next.js `api/attendance/me/check-in` et `api/attendance/me/check-out` | Transmission des actions employé au backend avec la session de terminal |
| API backend | `AttendanceController`, `AttendanceEntryService` | Exposition des routes de pointage, résolution de l'employé authentifié et redirection vers le terminal |
| Validation | DTO NestJS et validation globale de l'application | Validation des identifiants, dates, notes et preuves de sécurité reçues |
| Logique métier | `AttendanceService` | Contrôle de l'ordre des actions, application du planning et du calendrier, calcul des statuts et métriques |
| Sécurité du pointage | Services de politique, de vérification et de stockage photo | Exigence de photo, contrôle géographique conditionnel et dépôt de la photo |
| Données | Prisma Client et PostgreSQL | Lecture des employés et plannings, puis création ou mise à jour des pointages |
| Traitement mensuel | `AttendanceMonthlyMetricsService` | Recalcul mensuel et matérialisation des absences selon le planning et le calendrier |

### 2.2 Diagramme d'architecture

```text
┌─────────────────────────────────────────────┐
│ Interface Next.js /attendance-entry         │
│ PIN → action → photo → commentaire → GPS    │
└─────────────────────┬───────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────┐
│ Routes API Next.js                          │
│ session courte + proxy check-in/check-out   │
└─────────────────────┬───────────────────────┘
                      │ JWT
                      v
┌─────────────────────────────────────────────┐
│ AttendanceController NestJS                 │
│ Guards de rôle + DTO + validation globale   │
└─────────────────────┬───────────────────────┘
                      v
┌─────────────────────────────────────────────┐
│ AttendanceService                           │
│ règles métier + calendrier + sécurité       │
└─────────────────────┬───────────────────────┘
                      v
┌─────────────────────────────────────────────┐
│ Prisma Client                               │
└─────────────────────┬───────────────────────┘
                      v
┌─────────────────────────────────────────────┐
│ PostgreSQL                                  │
│ Employee / Schedule / Attendance            │
│ CalendarEntry                               │
└─────────────────────────────────────────────┘
```

### 2.3 Interfaces et API

Le backend applique le préfixe global `/api/v1`. Les routes du contrôleur de pointage sont les suivantes :

| Méthode et route backend | Accès | Fonction |
| --- | --- | --- |
| `GET /api/v1/attendance/entry` | Public | Redirige vers l'URL frontend `/attendance-entry` construite avec `FRONTEND_URL` |
| `GET /api/v1/attendance/summary` | `ADMIN` | Retourne la synthèse de la journée |
| `GET /api/v1/attendance/history` | `ADMIN` | Retourne l'historique mensuel, avec un mois optionnel |
| `GET /api/v1/attendance/exports/monthly` | `ADMIN` | Génère l'export mensuel demandé |
| `POST /api/v1/attendance/check-in` | `ADMIN` | Enregistre l'entrée d'un employé désigné |
| `POST /api/v1/attendance/check-out` | `ADMIN` | Enregistre la sortie d'un employé désigné |
| `GET /api/v1/attendance/me/today` | `EMPLOYEE` | Retourne l'état du jour et les actions permises |
| `GET /api/v1/attendance/me/security-policy` | `EMPLOYEE` | Retourne la politique de sécurité effective |
| `GET /api/v1/attendance/me/history` | `EMPLOYEE` | Retourne l'historique mensuel de l'employé courant |
| `POST /api/v1/attendance/me/check-in` | `EMPLOYEE` | Enregistre l'entrée de l'employé authentifié |
| `POST /api/v1/attendance/me/check-out` | `EMPLOYEE` | Enregistre la sortie de l'employé authentifié |

Les routes frontend `/api/attendance/me/check-in` et `/api/attendance/me/check-out` sont des proxies vers les deux routes employé du backend. Elles demandent explicitement la session courte du terminal de pointage.

## 3. Parcours de pointage

### 3.1 Accès au terminal

Le tableau de bord administrateur contient une carte QR de pointage. Cette carte encode l'adresse frontend `/attendance-entry`. Le composant permet également de produire, dans le navigateur, une affiche PDF contenant le QR code.

L'ouverture de `/attendance-entry` suit le comportement observé :

1. En l'absence de session courte valide, l'écran affiche le pavé de saisie du PIN.
2. Le PIN est transmis à la route frontend `/api/auth/attendance-entry-session`.
3. Cette route appelle l'authentification backend du terminal.
4. Seul un utilisateur actif de rôle `EMPLOYEE` peut obtenir cette session.
5. Le JWT court est conservé dans un cookie HTTP-only.
6. Le terminal charge l'utilisateur, le pointage du jour et son historique.
7. Le backend expose `canCheckIn` et `canCheckOut`, qui déterminent les boutons utilisables.

La durée par défaut de la session courte définie dans le backend est de quinze minutes.

### 3.2 Action employé

Le composant `EmployeeAttendanceActions` met en œuvre le parcours suivant :

1. l'employé choisit l'entrée ou la sortie parmi les actions autorisées ;
2. le navigateur capture l'instant de début du parcours, ensuite envoyé comme `occurredAt` ;
3. une photo est capturée avec la caméra frontale ;
4. l'employé peut saisir un commentaire ou utiliser une suggestion affichée ;
5. le navigateur tente d'obtenir la position géographique ;
6. un écran récapitulatif présente les éléments collectés ;
7. la confirmation déclenche l'appel au proxy Next.js ;
8. le backend valide et enregistre l'action ;
9. l'interface affiche le résultat ;
10. depuis le mode terminal, l'action « Nouveau pointage » supprime la session courte et revient à l'identification par PIN.

Le flux de composants comporte les étapes internes `selfie`, `comment`, `validation`, `submitting` et `success`. Lorsqu'une erreur de soumission survient, le composant conserve le message et revient à l'étape de validation.

### 3.3 Diagramme du parcours réellement implémenté

```text
QR code ou ouverture de /attendance-entry
                    |
                    v
              Saisie du PIN
                    |
                    v
       Création d'une session courte
                    |
                    v
      Chargement du pointage du jour
                    |
                    v
       Entrée ou sortie autorisée
                    |
                    v
             Capture selfie
                    |
                    v
       Commentaire facultatif*
                    |
                    v
       Tentative de géolocalisation
                    |
                    v
           Écran de validation
                    |
                    v
        Enregistrement par l'API
                    |
                    v
             Résultat affiché

* Le commentaire devient obligatoire hors zone lorsque
  la politique géographique active l'exige.
```

### 3.4 Collecte effectuée par le navigateur

| Élément | Comportement observé |
| --- | --- |
| Photo | Caméra orientée utilisateur, rendu carré jusqu'à 720 pixels, image JPEG encodée en Data URL avec une qualité de `0,78` |
| Géolocalisation | Haute précision demandée, délai maximal de 6 secondes et position en cache acceptée jusqu'à 60 secondes |
| Commentaire frontend | Saisie limitée à 120 caractères ; suggestions « Retard », « Mission externe », « Rendez-vous client » et « Autre » |
| Horodatage | Capturé au démarrage de l'action puis transmis dans `occurredAt` |
| Distance affichée | Calcul Haversine côté navigateur à titre d'information ; le backend recalcule la distance servant à la validation |

L'échec de géolocalisation n'interrompt pas à lui seul le passage vers l'écran de validation. Le backend décide ensuite si une position est obligatoire selon la politique de sécurité effective.

### 3.5 Surface `my-attendance`

La page `/my-attendance` charge l'état du jour, l'historique et le même composant d'actions. Les routes Next.js de soumission employées par ce composant sélectionnent cependant explicitement la session `attendance-entry`. En l'absence du cookie court du terminal, elles retournent une erreur d'authentification. Le parcours complet directement opérationnel et relié à cette session est donc celui de `/attendance-entry`.

## 4. Cycle de traitement

### 4.1 Chaîne d'exécution

```text
Utilisateur
    |
    v
Interface Next.js
    |
    v
Route API Next.js
    |
    v
JWT court + rôle EMPLOYEE
    |
    v
Controller NestJS
    |
    v
Validation DTO
    |
    v
AttendanceService
    |
    +----> CalendarService
    |
    +----> AttendanceSecurityService
    |          |
    |          +----> AttendancePhotoStorageService
    |
    v
Prisma Client
    |
    v
PostgreSQL
    |
    v
Réponse HTTP
    |
    v
Résultat affiché
```

### 4.2 Traitement d'une entrée

Le service exécute les opérations suivantes :

1. recherche l'employé actif et charge son planning éventuel ;
2. valide `occurredAt`, ou utilise l'heure courante lorsqu'il est absent ;
3. refuse un horodatage invalide ou futur ;
4. normalise la date selon les utilitaires UTC du module ;
5. recherche le pointage unique de l'employé pour cette date ;
6. détermine si la date est un jour non ouvré ;
7. détermine si le planning est actif et si le jour fait partie des jours travaillés ;
8. calcule le retard par rapport à l'heure de début et à la marge du planning ;
9. prépare un instantané du planning et l'heure de sortie planifiée ;
10. calcule le nombre d'absences du mois jusqu'à la date considérée ;
11. contrôle les conflits d'entrée et de sortie existantes ;
12. applique la sécurité du pointage ;
13. met à jour une ligne existante sans entrée, notamment une ligne d'absence matérialisée, ou crée une nouvelle ligne ;
14. retourne le pointage enregistré.

La contrainte unique Prisma sur `(employeeId, date)` complète le contrôle applicatif. Une collision Prisma `P2002` est convertie en conflit de pointage.

### 4.3 Traitement d'une sortie

Le service exécute les opérations suivantes :

1. valide l'horodatage et normalise la date ;
2. recherche le pointage du même employé pour cette date ;
3. vérifie qu'une entrée existe ;
4. vérifie qu'aucune sortie n'est déjà enregistrée ;
5. vérifie que la sortie n'est pas antérieure à l'entrée ;
6. applique la sécurité du pointage ;
7. résout le planning à partir de l'instantané conservé à l'entrée, avec repli sur le planning actif actuel ;
8. vérifie le caractère ouvré ou non de la date ;
9. détermine si le travail est effectué hors planning ;
10. calcule la sortie anticipée ou les heures supplémentaires ;
11. met à jour conditionnellement la ligne dont l'entrée existe et la sortie est encore vide ;
12. fixe le statut final et retourne le pointage.

La mise à jour conditionnelle empêche deux requêtes concurrentes de valider deux sorties sur la même ligne.

### 4.4 Sécurité appliquée

Les routes employé appellent le service avec la sécurité imposée. Les routes administratives appellent le même traitement sans imposer les preuves de sécurité.

| Cas | Photo | Position | Commentaire |
| --- | --- | --- | --- |
| Action employé, politique géographique inactive | Obligatoire | Facultative | Facultatif |
| Action employé, politique géographique active | Obligatoire | Obligatoire avec précision acceptable | Obligatoire si la position est hors du rayon autorisé |
| Action administrateur | Non imposée | Non imposée | Selon le DTO de l'opération |

La politique géographique est active seulement lorsque son indicateur d'activation est vrai et que les coordonnées de l'entreprise sont configurées. Les valeurs par défaut observées sont un rayon de confiance de 100 mètres, un rayon d'avertissement de 300 mètres et une précision maximale de 200 mètres. Le rayon autorisé utilise la valeur configurée lorsqu'elle existe, sinon le rayon d'avertissement.

Une photo transmise est validée comme Data URL JPEG, PNG ou WebP, puis déposée dans Cloudinary par le backend. L'URL sécurisée et l'identifiant public sont enregistrés avec le pointage. En environnement de test, le service de stockage retourne une référence de test sans appel externe.

## 5. Règles métier

### 5.1 Règles d'enregistrement et de calcul

| Domaine | Règle réellement implémentée | Effet |
| --- | --- | --- |
| Employé | L'employé ciblé doit exister et être actif lors de l'entrée | Une entrée n'est pas créée pour un employé absent ou inactif |
| Unicité | Un seul enregistrement `Attendance` est permis par employé et par date | La base applique la contrainte unique `(employeeId, date)` |
| Première action | L'entrée est possible quand `clockInAt` est vide | `canCheckIn` est vrai |
| Sortie | La sortie est possible seulement après une entrée et avant toute sortie | `canCheckOut` est vrai uniquement dans cet état |
| Double entrée | Une entrée déjà enregistrée interdit une nouvelle entrée | Réponse de conflit |
| Entrée après sortie | Une ligne comportant déjà une sortie ne peut pas recevoir une entrée | Réponse de conflit |
| Double sortie | Une sortie déjà enregistrée interdit une nouvelle sortie | Réponse de conflit |
| Ordre horaire | Une sortie ne peut pas précéder l'entrée | Requête refusée |
| Horodatage | Un horodatage invalide ou futur est refusé | Requête refusée avant persistance |
| Jour non ouvré | Une entrée un jour non ouvré reçoit `NON_WORKING_DAY_WORK` et aucun retard | La sortie conserve ce statut |
| Jour hors planning | Une entrée sans planning actif ou sur un jour non planifié reçoit initialement `INCOMPLETE` | La sortie transforme ce pointage en `PRESENT` et marque le travail hors planning |
| Retard | Sur un jour planifié, le service compare l'entrée au début du planning augmenté de sa marge | Le retard est arrondi en minutes ; une valeur positive donne `LATE` |
| Entrée à l'heure | Une entrée planifiée sans retard reste `INCOMPLETE` jusqu'à la sortie | La sortie la transforme en `PRESENT` |
| Sortie anticipée | Une sortie avant l'heure de fin planifiée active `earlyExit` | Le nombre de minutes anticipées est arrondi |
| Sortie à l'heure | Une sortie égale à l'heure prévue ne crée ni sortie anticipée ni heure supplémentaire | Les métriques de sortie restent à zéro |
| Sortie tardive | Une sortie après l'heure prévue active `lateExit` | Les minutes supplémentaires sont arrondies et les heures calculées avec deux décimales |
| Travail hors planning | La durée complète entre entrée et sortie est comptée comme temps supplémentaire | `outsideScheduleWork` est vrai et l'heure de sortie planifiée est vide |
| Instantané du planning | Le planning applicable est copié dans le pointage lors de l'entrée | Les calculs ultérieurs privilégient cet instantané |
| Calendrier | Les jours non ouvrés sont exclus des absences attendues | Le calendrier influence la synthèse, le décompte et le recalcul mensuel |
| Absences mensuelles | Les jours planifiés écoulés sans présence, hors jours non ouvrés, sont comptés | `absenceCount` est enregistré et restitué |
| Photo employé | Une action employé sans photo est refusée | Entrée et sortie suivent la même règle |
| Position conditionnelle | La position et sa précision sont exigées lorsque la politique géographique est active | Une précision supérieure au maximum est refusée |
| Hors zone | Une position au-delà du rayon autorisé exige un commentaire | Le pointage justifié peut ensuite être accepté |

### 5.2 Statuts

| Statut Prisma | Signification dans le traitement observé |
| --- | --- |
| `INCOMPLETE` | Entrée présente sans sortie finalisée, y compris une entrée hors planning avant sa sortie |
| `LATE` | Entrée planifiée enregistrée après l'heure de début augmentée de la marge |
| `PRESENT` | Pointage terminé sur un jour planifié sans retard, ou pointage terminé hors planning |
| `ABSENT` | Absence matérialisée par le recalcul mensuel pour un jour attendu sans pointage |
| `NON_WORKING_DAY_WORK` | Travail enregistré un jour déclaré non ouvré |

Lors d'une sortie planifiée, le statut final reste `LATE` si `minutesLate` est positif ; il devient sinon `PRESENT`. Les indicateurs de sortie anticipée et tardive sont indépendants de ce statut.

### 5.3 Recalcul mensuel

`AttendanceMonthlyMetricsService` démarre un intervalle quotidien lors de son initialisation. Le premier jour UTC du mois, il recalcule le mois précédent :

- il sélectionne les employés actifs ;
- il ignore ceux qui n'ont pas de planning actif ;
- il identifie les jours attendus à partir du planning ;
- il exclut les jours non ouvrés fournis par le calendrier ;
- il crée les lignes `ABSENT` manquantes ;
- il recalcule le nombre d'absences et les résultats de sortie des lignes présentes.

La méthode publique `recalculateMonth` existe dans ce service. Aucun endpoint du contrôleur de pointage ne l'expose ; son déclenchement observé est l'intervalle interne au service.

## 6. Données manipulées

### 6.1 Entités principales

| Entité Prisma | Rôle dans le système | Données utilisées |
| --- | --- | --- |
| `Employee` | Identifie la personne qui pointe | Identifiant, nom, rôle, état actif, PIN haché, relation au planning et aux pointages |
| `Schedule` | Définit les horaires attendus | Heure de début, heure de fin, marge de retard, jours travaillés, état actif |
| `Attendance` | Porte le pointage quotidien | Date, entrée, sortie, statut, retard, résultats de sortie, absences, notes, instantané de planning et preuves de sécurité |
| `CalendarEntry` | Représente les événements calendaires pris en compte | Date, type et informations utilisées par le service calendrier |

La relation `Employee` vers `Attendance` est utilisée pour restituer l'identité avec les pointages. La suppression d'un employé entraîne la suppression en cascade de ses pointages selon le schéma Prisma.

### 6.2 Principaux groupes de champs de `Attendance`

| Groupe | Champs observés |
| --- | --- |
| Identité et date | `id`, `employeeId`, `date` |
| Horaires | `clockInAt`, `clockOutAt`, `scheduledExitAt` |
| Situation | `status`, `minutesLate`, `absenceCount`, `outsideScheduleWork`, `notes` |
| Résultats de sortie | `earlyExit`, `earlyExitMinutes`, `lateExit`, `overtimeMinutes`, `overtimeHours` |
| Instantané planning | Identifiant, nom, heures, marge, jours et état du planning copiés dans le pointage |
| Sécurité entrée | Coordonnées, précision, distance, méthode, niveau, motif, URL photo et identifiant public |
| Sécurité sortie | Équivalents de sortie préfixés par les champs de sortie |
| Audit technique | `createdAt`, `updatedAt` |

Les preuves d'entrée et de sortie sont stockées séparément. L'énumération `AttendanceVerificationMethod` permet les valeurs `NONE`, `GPS` et `PHOTO`. L'implémentation courante du service de sécurité produit le niveau `OK` pour une preuve acceptée et renseigne un motif décrivant la combinaison de photo et de position.

### 6.3 Contrats de saisie

| Contrat | Champs |
| --- | --- |
| Entrée administrateur | `employeeId`, `occurredAt`, `notes`, `security` |
| Sortie administrateur | `employeeId`, `occurredAt`, `security` |
| Entrée employé | `occurredAt`, `notes`, `security` |
| Sortie employé | `occurredAt`, `notes`, `security` |
| Preuve de sécurité | `latitude`, `longitude`, `accuracyMeters`, `photoDataUrl` |

Les champs `occurredAt`, `notes` et `security` sont optionnels dans les DTO. L'exigence effective de photo et, selon la politique, de position est appliquée dans le service métier pour les routes employé. Le backend accepte au maximum 200 caractères pour les notes.

## 7. Gestion des erreurs

### 7.1 Erreurs backend

| Catégorie | Condition observée | Réponse ou comportement |
| --- | --- | --- |
| Validation DTO | UUID, date ISO, coordonnées, précision, longueur ou format photo invalide | HTTP `400 Bad Request` par la validation NestJS |
| Horodatage | Date invalide ou future | HTTP `400 Bad Request` |
| Ordre de sortie | Sortie sans entrée ou antérieure à l'entrée | HTTP `400 Bad Request` |
| Sécurité | Photo employé manquante | HTTP `400 Bad Request` |
| Sécurité | Position ou précision manquante lorsque la politique est active | HTTP `400 Bad Request` |
| Sécurité | Précision géographique supérieure au maximum | HTTP `400 Bad Request` |
| Sécurité | Position hors zone sans commentaire | HTTP `400 Bad Request` |
| Employé | Employé introuvable ou inactif au moment de l'entrée | HTTP `404 Not Found` |
| Conflit | Double entrée, entrée après sortie ou double sortie | HTTP `409 Conflict` |
| Concurrence | Collision unique Prisma ou mise à jour conditionnelle perdue | HTTP `409 Conflict` |
| Authentification | Session courte absente, invalide ou expirée | HTTP `401 Unauthorized` |
| Autorisation | Utilisateur ne possédant pas le rôle demandé | HTTP `403 Forbidden` |
| PIN | PIN invalide ou utilisateur non autorisé au terminal | Échec d'authentification ; les tentatives sont soumises au throttling |
| Limitation | Trop de tentatives sur l'authentification du terminal | HTTP `429 Too Many Requests` |
| Stockage photo | Configuration Cloudinary absente hors test | HTTP `500 Internal Server Error` |
| Stockage photo | Échec de téléversement Cloudinary | HTTP `502 Bad Gateway` |
| Stockage photo | Délai de téléversement dépassé | HTTP `504 Gateway Timeout` |

### 7.2 Gestion frontend

Le frontend applique les comportements suivants :

- le bouton d'action est désactivé lorsque `canCheckIn` ou `canCheckOut` est faux ;
- la validation ne progresse pas sans photo ;
- les erreurs de caméra et de géolocalisation sont présentées dans le parcours ;
- les erreurs du proxy ou du backend sont converties en message visible ;
- une erreur de soumission ramène l'utilisateur à la validation pour conserver le contexte ;
- une réponse backend `401` sur les proxies employé entraîne la suppression du cookie de session courte ;
- l'écran de terminal revient à la saisie du PIN lorsque le chargement de session ou d'utilisateur échoue ;
- les fichiers `error.tsx` et `loading.tsx` fournissent les états de route de `/attendance-entry` et `/my-attendance`.

Le fichier `attendance-security.exception.ts` déclare des classes d'exception spécialisées. La recherche des usages dans le module montre que le service courant lève directement des `BadRequestException` ; ces classes ne constituent donc pas le chemin d'erreur actif du pointage.

## 8. Traçabilité

### 8.1 Correspondance entre fonctions et fichiers

| Sujet documenté | Fichiers de référence |
| --- | --- |
| Page terminal et résolution de session | `apps/frontend/app/attendance-entry/page.tsx`, `apps/frontend/components/attendance/fixed-attendance-entry-view.tsx` |
| Saisie du PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx`, `apps/frontend/app/api/auth/attendance-entry-session/route.ts` |
| Actions entrée et sortie | `apps/frontend/components/attendance/employee-attendance-actions.tsx`, `apps/frontend/components/attendance/attendance-action-flow.ts` |
| Capture photo et géolocalisation | `apps/frontend/components/attendance/attendance-selfie-capture.tsx`, `apps/frontend/components/attendance/attendance-browser-security.ts` |
| Proxies frontend de pointage | `apps/frontend/app/api/attendance/me/check-in/route.ts`, `apps/frontend/app/api/attendance/me/check-out/route.ts`, `apps/frontend/lib/api-route.ts` |
| Types et appels API frontend | `apps/frontend/lib/api.ts`, `apps/frontend/components/attendance/attendance-display.ts` |
| QR code d'accès | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` |
| Routes backend | `apps/backend/src/modules/attendance/attendance.controller.ts` |
| Assemblage du module | `apps/backend/src/modules/attendance/attendance.module.ts` |
| Redirection publique | `apps/backend/src/modules/attendance/attendance-entry.service.ts` |
| Règles d'entrée et de sortie | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Calculs de sortie | `apps/backend/src/common/utils/attendance-checkout.util.ts` |
| Normalisation des dates | `apps/backend/src/common/utils/attendance-date.util.ts` |
| Instantanés de planning | `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` |
| Politique de sécurité | `apps/backend/src/modules/attendance/attendance-security-policy.service.ts` |
| Validation de sécurité | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Stockage photo | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| DTO de pointage | `apps/backend/src/modules/attendance/dto/check-in.dto.ts`, `check-out.dto.ts`, `self-check-in.dto.ts`, `self-check-out.dto.ts`, `check-in-security.dto.ts` |
| Calcul mensuel et absences | `apps/backend/src/modules/attendance/attendance-monthly-metrics.service.ts` |
| Calendrier non ouvré | `apps/backend/src/modules/calendar/calendar.service.ts`, `apps/backend/src/modules/calendar/calendar.types.ts` |
| Modèles et énumérations | `apps/backend/prisma/schema.prisma` |
| Évolution du stockage de pointage | Migrations `apps/backend/prisma/migrations/*attendance*/migration.sql`, migrations de PIN et de calendrier associées |
| Bootstrap, préfixe et validation globale | `apps/backend/src/main.ts` |
| Authentification du terminal et rôles | `apps/backend/src/modules/auth/auth.controller.ts`, `apps/backend/src/modules/auth/auth.service.ts`, `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |

### 8.2 Migrations directement liées

| Migration | Élément traçable |
| --- | --- |
| `20260416140000_init` | Structure initiale |
| `20260416190000_refine_attendance_status_flow` | Évolution du flux de statuts |
| `20260420120000_smart_attendance_security` | Données de sécurité |
| `20260420170000_attendance_verification_levels` | Niveaux de vérification |
| `20260420190000_attendance_photo_cloudinary_metadata` | Métadonnées photo |
| `20260421100000_checkout_smart_security` | Preuves de sécurité à la sortie |
| `20260423100000_attendance_exit_outcomes` | Résultats de sortie |
| `20260423110000_attendance_absence_count_indexes` | Décompte des absences et index |
| `20260424120000_checkout_outcome_clarity` | Clarification des indicateurs de sortie |
| `20260427120000_add_employee_pin_code` | PIN employé |
| `20260506153000_add_employee_pin_code_hash` | Stockage haché du PIN |
| `20260507110000_add_attendance_outside_schedule_work` | Travail hors planning |
| `20260507123000_add_attendance_schedule_snapshots` | Instantané du planning |
| `20260623143000_add_hr_calendar_entries` | Calendrier RH |
| `20260623162000_add_non_working_day_work_status` | Statut de travail un jour non ouvré |

## 9. Observations

### 9.1 Architecture et séparation des responsabilités

- Le frontend orchestre le parcours, collecte les preuves du navigateur et affiche les résultats ; il ne décide pas du statut persistant.
- Les routes Next.js servent de frontière de session et de proxy vers l'API NestJS.
- Le contrôleur backend reste centré sur les contrats HTTP, les rôles et l'audit des mutations administratives.
- La logique d'entrée, de sortie, de retard et d'absence est concentrée dans les services backend et les utilitaires communs.
- Prisma fournit l'accès aux données et la contrainte d'unicité quotidienne ; la logique métier n'est pas placée dans le schéma.
- Le calendrier et le planning sont des dépendances de calcul distinctes du module de pointage.

### 9.2 Particularités constatées

- Le parcours employé actuellement relié de bout en bout est le terminal `/attendance-entry` avec PIN et JWT court.
- La photo est obligatoire pour toute entrée ou sortie employé, même lorsque la politique géographique est inactive.
- La géolocalisation est collectée de manière opportuniste par l'interface, mais elle n'est imposée par le backend que lorsque la politique est active et complètement configurée.
- Le commentaire est généralement facultatif ; il devient nécessaire pour justifier un pointage hors du rayon autorisé.
- Les opérations administratives utilisent le même service de pointage sans imposer la sécurité photo et GPS.
- Le DTO de sortie administrateur ne contient pas de note, tandis que le DTO de sortie employé accepte `notes`.
- Le statut `INCOMPLETE` décrit l'état après l'entrée ; il est remplacé lors de la sortie selon le contexte du pointage.
- L'instantané de planning protège les calculs de sortie contre une modification ultérieure du planning courant.
- Les absences peuvent exister sous forme de lignes `Attendance` créées par le traitement mensuel ; une entrée ultérieure sur une ligne sans horaires utilise une mise à jour conditionnelle.
- Le recalcul mensuel repose sur un intervalle interne au processus backend et n'est pas exposé par une route du contrôleur de pointage.
- La page `/my-attendance` présente les actions, mais les proxies de soumission demandent la session courte du terminal.
- Aucune collecte de vidéo continue n'est implémentée ; seule une image fixe encodée est transmise lors de la confirmation.
- Aucun champ de commentaire distinct n'existe dans le modèle `Attendance` pour l'entrée et la sortie : le champ `notes` est partagé.
