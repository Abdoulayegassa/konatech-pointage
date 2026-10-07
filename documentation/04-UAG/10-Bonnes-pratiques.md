# Bonnes pratiques

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-BEST-001 |
| Titre | Bonnes pratiques |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif des bonnes pratiques

Ce chapitre formalise les usages cohérents avec les fonctions actuellement
disponibles dans Konatech Pointage. Les pratiques décrites reposent sur les
formulaires, contrôles d'accès, validations et calculs réellement présents.

Elles concernent la gestion :

- des employés ;
- des plannings ;
- des pointages ;
- des accès administratifs ;
- des rapports ;
- des sessions et identifiants.

### 1.2 Importance d'une utilisation cohérente

Les données saisies dans les modules Employés, Plannings et Calendrier sont
utilisées dans les calculs de pointage, d'absence, de retard et d'export. Leur
cohérence a donc un effet direct sur l'historique RH et les rapports mensuels.

```text
+-----------------------+
| Employé actif         |
| identité et accès     |
+-----------+-----------+
            |
            v
+-----------------------+
| Planning affecté      |
| horaires et jours     |
+-----------+-----------+
            |
            v
+-----------------------+
| Entrée puis sortie    |
| preuves et horaires   |
+-----------+-----------+
            |
            v
+-----------------------+
| Historique RH         |
+-----------+-----------+
            |
            v
+-----------------------+
| Rapport mensuel       |
+-----------------------+
```

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`.

## 2. Gestion des employés

### 2.1 Création

La création d'un employé doit utiliser le formulaire du module Employés avec
les informations prises en charge :

| Information | Usage dans l'application |
| --- | --- |
| Prénom et nom | Identification dans les listes, historiques et rapports |
| Courriel | Connexion principale et unicité du compte |
| Fonction métier | Information descriptive affichée |
| Rôle d'accès | Autorisations `ADMIN` ou `EMPLOYEE` |
| Département | Filtres et regroupement visible |
| Planning | Horaires attendus et calculs |
| Mot de passe | Connexion du compte |
| PIN | Identification d'un compte `EMPLOYEE` au terminal |
| État actif | Autorisation de connexion et de pointage |

Le formulaire distingue le rôle métier libre du rôle d'accès. Les permissions
sont déterminées uniquement par `accessRole`.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/prisma/schema.prisma`.

### 2.2 Cohérence des informations

Les comportements existants permettent de maintenir les informations depuis
l'action « Modifier ». Les données doivent rester dans les contraintes
appliquées par l'application :

- prénom, nom, fonction et département : 80 caractères au maximum ;
- courriel au format valide et unique ;
- mot de passe : de 8 à 128 caractères ;
- rôle d'accès parmi `ADMIN` et `EMPLOYEE` ;
- planning choisi parmi les plannings existants ;
- PIN employé de quatre chiffres, valide et non déjà attribué.

L'identifiant employé n'est pas saisi : il est généré par le backend.

Références :
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/src/modules/employees/dto/update-employee.dto.ts`,
`apps/backend/src/modules/employees/employees.service.ts`.

### 2.3 Activation et désactivation

Le module distingue visuellement les comptes actifs et inactifs et permet de
les filtrer. L'action d'état :

- désactive un compte actif ;
- réactive un compte inactif ;
- met immédiatement à jour la ligne et le formulaire ouvert ;
- affiche une confirmation.

La désactivation est le mécanisme existant pour empêcher un ancien compte de
se connecter et de pointer tout en conservant son enregistrement. Aucune
suppression d'employé n'est disponible.

Un compte désactivé est refusé lors de la connexion, de la vérification d'un
JWT existant et de l'identification PIN.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 2.4 Rôle et PIN

Le formulaire active le champ PIN uniquement pour `EMPLOYEE`. Le service :

- exige un PIN pour un employé ;
- contrôle son unicité parmi les employés ;
- le stocke sous forme de hash ;
- retire le PIN lorsque le compte devient `ADMIN`.

La cohérence permise par le système consiste donc à associer le PIN au rôle
employé et à utiliser le mot de passe pour l'accès administrateur.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/common/validation/pin-code.validation.ts`.

### 2.5 Affectation du planning

Le planning peut être choisi pendant la création ou la modification d'un
employé. L'option « Aucun planning » est présente et le backend accepte une
absence d'affectation.

Pour les employés soumis à des horaires, l'affectation disponible dans ce
formulaire fournit au module Pointages l'heure de début, l'heure de fin, la
marge de retard et les jours actifs. L'absence de planning n'empêche pas le
pointage, mais celui-ci ne dispose pas d'horaires planifiés pour ses calculs.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

## 3. Gestion des plannings

### 3.1 Création des horaires

Le formulaire Planning permet de définir :

- un nom ;
- une heure de début ;
- une heure de fin ;
- une marge de retard ;
- un ou plusieurs jours actifs ;
- l'état actif.

Les validations imposent :

| Élément | Règle |
| --- | --- |
| Nom | Obligatoire, 80 caractères au maximum |
| Heure de début | Format `HH:mm` |
| Heure de fin | Format `HH:mm` et postérieure au début le même jour |
| Marge | Entier de 0 à 180 minutes |
| Jours actifs | Au moins un jour |
| État | Booléen |

Les horaires de nuit dans lesquels l'heure de fin est antérieure ou égale à
l'heure de début ne sont pas acceptés par le modèle actuel.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/dto/create-schedule.dto.ts`,
`apps/backend/src/modules/schedules/schedules.service.ts`.

### 3.2 Vérification avant enregistrement

Le formulaire affiche directement les incohérences suivantes :

- nom absent ;
- marge non entière ou hors limites ;
- aucun jour actif ;
- heure de fin non postérieure à l'heure de début.

Après succès, le planning est ajouté ou mis à jour dans la liste et le
formulaire revient au mode création.

Référence :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`.

### 3.3 Affectation et utilisation

La liste des plannings affiche le nombre d'employés affectés et un aperçu de
leurs noms. L'affectation elle-même est réalisée depuis le formulaire Employés.

Lors d'une entrée, les paramètres du planning actif et applicable sont copiés
dans le pointage. Une modification ultérieure du planning ne remplace donc pas
l'instantané déjà capturé sur ce pointage.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`.

### 3.4 Activation et désactivation

Un planning peut être activé ou désactivé depuis sa ligne. Le module affiche
son état et son utilisation.

Un planning inactif n'est pas appliqué comme horaire attendu lors d'une
nouvelle entrée. La désactivation ne supprime ni le planning ni les
instantanés déjà enregistrés dans les anciens pointages.

Aucune suppression de planning n'est présente.

Références :
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/backend/src/modules/schedules/schedules.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

## 4. Gestion des pointages

### 4.1 Utilisation du QR Code

Le dashboard permet d'afficher et de télécharger le poster officiel contenant
le QR Code du point d'entrée. Ce QR Code conduit vers
`/attendance-entry` et n'identifie pas un employé.

Le parcours existant consiste à ouvrir ce point d'entrée fixe, puis à
identifier l'employé par son PIN.

Références :
`apps/frontend/components/dashboard/attendance-entry-qr-card.tsx`,
`apps/backend/src/modules/attendance/attendance-entry.service.ts`.

### 4.2 Utilisation du PIN

Le terminal attend exactement quatre chiffres. Le bouton de validation reste
indisponible tant que les quatre positions ne sont pas remplies.

Seuls les comptes `EMPLOYEE` actifs disposant d'un PIN peuvent ouvrir une
session de terminal. Les tentatives sont limitées à cinq par minute et dix par
dix minutes.

Le terminal masque les chiffres saisis et permet de les effacer. Après
l'identification, il affiche le nom de l'employé avant d'ouvrir les actions de
pointage.

Références :
`apps/frontend/components/attendance/attendance-entry-pin-view.tsx`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/app.module.ts`.

### 4.3 Respect du cycle d'entrée et de sortie

L'écran active les actions selon l'état journalier :

1. avant l'entrée, l'action Entrée est disponible ;
2. après l'entrée, la sortie devient disponible ;
3. après la sortie, aucune seconde sortie n'est acceptée.

Chaque action personnelle suit le parcours :

- choix de l'action ;
- selfie obligatoire ;
- commentaire facultatif, sauf hors zone lorsque la politique l'exige ;
- tentative de capture GPS ;
- vérification ;
- enregistrement ;
- confirmation.

Le backend refuse une double entrée, une double sortie, une sortie sans entrée,
une sortie antérieure à l'entrée et une date future.

Références :
`apps/frontend/components/attendance/employee-attendance-actions.tsx`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`.

### 4.4 Preuves de pointage

Le selfie est obligatoire pour les routes personnelles. Lorsque la politique
GPS est active, le backend contrôle la présence de la position, sa précision
et la distance par rapport au site configuré. Un pointage hors rayon exige un
commentaire.

Le frontend capture les preuves, mais le backend décide de leur validité. Les
preuves acceptées sont conservées avec les métadonnées du pointage et sont
consultables dans le détail administrateur lorsqu'elles sont disponibles.

Références :
`apps/frontend/components/attendance/attendance-selfie-capture.tsx`,
`apps/frontend/components/attendance/attendance-browser-security.ts`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`,
`apps/frontend/components/attendance-history/attendance-detail-panel.tsx`.

### 4.5 Consultation des historiques

L'administrateur peut utiliser les contrôles effectivement présents :

- période : aujourd'hui, cette semaine ou ce mois ;
- recherche par nom ou identifiant d'employé ;
- filtre par département ;
- sélection multiple des états fonctionnels ;
- ouverture du détail d'une ligne ;
- réinitialisation des filtres.

Le panneau de détail permet de rapprocher les horaires réels, le planning
capturé, les écarts, le GPS, le commentaire, le selfie et l'analyse de
sanction.

L'historique n'offre aucune modification, suppression ou correction manuelle.

Références :
`apps/frontend/components/attendance-history/attendance-history-filters.tsx`,
`apps/frontend/components/attendance-history/attendance-history-table.tsx`,
`apps/frontend/components/attendance-history/attendance-detail-panel.tsx`.

## 5. Administration

### 5.1 Comptes administrateurs

Un compte administrateur se gère dans le même module Employés que les autres
comptes. Le rôle d'accès « Administrateur » donne accès aux pages et routes
administratives.

La création et la modification sont elles-mêmes réservées à un compte
`ADMIN`. Le système ne fournit pas d'inscription libre.

Références :
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/frontend/app/employees/page.tsx`.

### 5.2 Rôles et privilèges

Les deux rôles disponibles doivent être utilisés selon les permissions
implémentées :

| Rôle | Périmètre |
| --- | --- |
| `ADMIN` | Dashboard, employés, plannings, calendrier, sanctions, historique et rapports |
| `EMPLOYEE` | Journée personnelle, historique personnel, entrée et sortie |

Le champ libre « Rôle métier » est descriptif. Il ne remplace pas le choix
« Rôle d'accès ».

Les pages administratives contrôlent le rôle et le backend applique les guards
JWT et de rôles. Un masquage de navigation ne constitue donc pas le contrôle
d'autorisation principal.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/frontend/components/admin/admin-nav.tsx`.

### 5.3 Utilisation des privilèges

Les actions administratives disponibles sont limitées aux fonctions exposées :

- création, modification et changement d'état des employés ;
- création, modification et changement d'état des plannings ;
- gestion des entrées de calendrier ;
- configuration des règles de sanction ;
- consultation et export des pointages ;
- pointage administratif par les routes backend dédiées.

Ces actions produisent des événements avec `AuditLogService` dans les
contrôleurs concernés. Aucun écran ne permet de consulter ces événements.

Références :
`apps/backend/src/common/audit/audit-log.service.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/attendance/attendance.controller.ts`.

### 5.4 Protection des identifiants

Le mot de passe est saisi dans un champ de type `password`. Il est haché avec
`scrypt` avant stockage et n'est pas renvoyé dans les réponses publiques.

Le PIN est masqué sur le terminal, haché avant stockage et n'est pas renvoyé à
l'administration. L'interface expose uniquement l'état « PIN défini » ou
« PIN manquant ».

Les cookies de session sont `HttpOnly`, `SameSite=Lax` et deviennent
`Secure` en production.

Références :
`apps/frontend/components/auth/login-form.tsx`,
`apps/backend/src/common/security/password.util.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/lib/auth-session.ts`.

## 6. Rapports

### 6.1 Consultation du périmètre

Le formulaire de rapport permet de vérifier avant génération :

- le mois ;
- l'année ;
- le périmètre « Toute l'équipe » ou un employé précis.

Les valeurs initiales correspondent au mois et à l'année UTC courants, avec
toute l'équipe. L'interface ne fournit pas d'aperçu du contenu avant le
téléchargement.

Référence :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.

### 6.2 Export

L'interface génère uniquement un PDF mensuel. La sélection d'un employé produit
un rapport individuel avec journal quotidien ; toute l'équipe produit une
synthèse consolidée.

Le backend accepte également le CSV par son API. L'interface ne présente pas
ce choix.

Pendant la génération, le bouton est désactivé. Le succès est confirmé par un
message indiquant la période et, lorsqu'il est choisi, l'employé.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`.

### 6.3 Données des rapports

Les rapports utilisent uniquement les employés actifs du périmètre et les
pointages du mois. Ils consolident les jours planifiés, présences, absences,
retards, entrées, sorties, heures, travail hors planning, sorties anticipées,
sanctions et contrôles GPS.

Les jours non ouvrés du calendrier et le planning influencent les calculs.
Pour un mois en cours, les absences ne sont pas comptées au-delà de la date
d'analyse du service.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/modules/calendar/calendar.service.ts`.

### 6.4 Archivage

Le navigateur télécharge le fichier généré vers l'environnement de
l'utilisateur. L'application :

- ne conserve pas une bibliothèque de rapports ;
- ne présente pas d'historique des téléchargements ;
- ne fournit pas de classement ou d'archivage interne ;
- ne permet pas de retrouver un ancien fichier généré ;
- ne programme pas d'exports récurrents.

L'archivage n'est donc pas une fonctionnalité permise par l'application
actuelle.

Références :
`apps/frontend/app/exports/page.tsx`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.

## 7. Sécurité

### 7.1 Authentification

La connexion principale utilise le courriel et le mot de passe. Le terminal
utilise une session séparée obtenue avec le PIN d'un employé actif.

Le backend vérifie la signature et l'expiration du JWT, puis recharge le
compte depuis la base. Un compte inactif est refusé même si son jeton n'a pas
encore atteint sa date d'expiration.

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`.

### 7.2 Déconnexion

L'action « Déconnexion » appelle la route frontend dédiée. Celle-ci efface :

- la session principale ;
- la session du terminal ;
- puis redirige vers `/login`.

Le terminal possède aussi une action qui ferme uniquement la session PIN et
revient à l'identification d'un autre employé.

Références :
`apps/frontend/components/auth/logout-form.tsx`,
`apps/frontend/app/api/auth/logout/route.ts`,
`apps/frontend/components/attendance/attendance-entry-session-button.tsx`.

### 7.3 Gestion des accès

Les contrôles présents doivent rester cohérents avec l'état du compte et son
rôle :

- `ADMIN` pour les fonctions d'administration ;
- `EMPLOYEE` pour les fonctions personnelles ;
- état actif pour toute authentification ;
- désactivation disponible lorsqu'un compte ne doit plus accéder au système.

Les pages redirigent les rôles incompatibles et les guards backend refusent
l'appel même si une route est appelée directement.

Références :
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/frontend/lib/auth.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 7.4 Protection des comptes

Les mécanismes disponibles comprennent :

| Mécanisme | Comportement |
| --- | --- |
| Mot de passe | Minimum de 8 caractères, hash `scrypt` |
| PIN | Quatre chiffres, valeurs triviales exclues, unicité contrôlée |
| JWT | Signature HMAC SHA-256 et expiration |
| Cookies | `HttpOnly`, `SameSite=Lax`, `Secure` en production |
| Connexion | Limitation de débit configurable |
| PIN terminal | Deux fenêtres de limitation de débit |
| Compte | Désactivation contrôlée par l'administrateur |
| API | Authentification et rôles globaux |

Le dépôt ne contient ni récupération autonome de mot de passe, ni
authentification multifacteur, ni gestion visible des sessions actives.

Références :
`apps/backend/src/common/security/password.util.ts`,
`apps/backend/src/common/security/jwt.util.ts`,
`apps/backend/src/app.module.ts`,
`apps/frontend/lib/auth-session.ts`.

## 8. Traçabilité

| Thème | Fichiers concernés |
| --- | --- |
| Modèle employé et rôles | `apps/backend/prisma/schema.prisma` |
| Formulaire des employés | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Validation des employés | `apps/backend/src/modules/employees/dto/create-employee.dto.ts` |
| Gestion des comptes et PIN | `apps/backend/src/modules/employees/employees.service.ts` |
| Activation des comptes | `apps/backend/src/modules/employees/employees.controller.ts` |
| Formulaire des plannings | `apps/frontend/components/schedules/admin-schedules-manager.tsx` |
| Validation des plannings | `apps/backend/src/modules/schedules/dto/create-schedule.dto.ts` |
| Gestion des plannings | `apps/backend/src/modules/schedules/schedules.service.ts` |
| Instantané du planning | `apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts` |
| QR Code de pointage | `apps/frontend/components/dashboard/attendance-entry-qr-card.tsx` |
| Identification PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Cycle entrée et sortie | `apps/frontend/components/attendance/employee-attendance-actions.tsx` |
| Règles de pointage | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Preuves selfie et GPS | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Consultation de l'historique | `apps/frontend/components/attendance-history/attendance-history-table.tsx` |
| Détail du pointage | `apps/frontend/components/attendance-history/attendance-detail-panel.tsx` |
| Rôles backend | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Navigation administrateur | `apps/frontend/components/admin/admin-nav.tsx` |
| Journalisation administrative | `apps/backend/src/common/audit/audit-log.service.ts` |
| Formulaire de rapport | `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx` |
| Construction des rapports | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` |
| Authentification | `apps/backend/src/modules/auth/auth.service.ts` |
| Hachage des secrets | `apps/backend/src/common/security/password.util.ts` |
| Cookies et sessions | `apps/frontend/lib/auth-session.ts` |
| Déconnexion | `apps/frontend/app/api/auth/logout/route.ts` |

## 9. Observations

### 9.1 Comportements existants

- les employés et plannings sont conservés lorsqu'ils sont désactivés ;
- les comptes et plannings sont gérés par changement d'état, sans suppression
  dans leurs interfaces ;
- l'affectation du planning est réalisée depuis la fiche employé ;
- le planning applicable est capturé dans le pointage lors de l'entrée ;
- le QR Code désigne un point d'entrée fixe, puis le PIN identifie l'employé ;
- l'entrée doit précéder la sortie ;
- le selfie est obligatoire pour le pointage personnel ;
- le contrôle GPS dépend de la politique configurée ;
- l'historique permet la consultation, pas la correction ;
- les rapports sont générés à la demande et téléchargés immédiatement ;
- les rôles et l'état actif sont contrôlés par le backend.

### 9.2 Limites observées

- aucun employé ou planning ne peut être supprimé depuis l'interface ;
- aucun planning traversant minuit n'est accepté ;
- aucune affectation collective d'un planning n'est présente ;
- aucune correction de pointage n'est disponible ;
- aucune pagination ni commande de tri n'est présente dans l'historique RH ;
- aucun aperçu de rapport n'est disponible ;
- aucun archivage interne des rapports n'est présent ;
- aucun export récurrent n'est présent ;
- aucune permission fine au-delà de `ADMIN` et `EMPLOYEE` n'est présente ;
- aucun écran de consultation des événements d'audit n'est présent.

### 9.3 Fonctionnalités absentes

Les pratiques de ce chapitre n'incluent pas les mécanismes absents suivants :

- suppression d'employés ou de plannings ;
- import collectif d'employés ou de pointages ;
- affectation en masse ;
- correction ou validation manuelle d'un pointage ;
- workflow d'approbation ;
- programmation et envoi automatique de rapports ;
- bibliothèque d'archives ;
- récupération autonome du mot de passe ;
- authentification multifacteur ;
- rôles et permissions personnalisables ;
- gestion des sessions actives.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/components/schedules/admin-schedules-manager.tsx`,
`apps/frontend/components/attendance-history/attendance-history-table.tsx`,
`apps/frontend/app/exports/page.tsx`,
`apps/backend/src/modules/auth/auth.controller.ts`.
