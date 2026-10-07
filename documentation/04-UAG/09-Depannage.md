# Dépannage

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-TRB-001 |
| Titre | Dépannage |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif du guide de dépannage

Ce chapitre décrit les erreurs, refus et états d'échec effectivement gérés par
Konatech Pointage. Il permet d'identifier le contrôle qui a refusé une action
et le comportement visible de l'application.

Les libellés reproduits entre guillemets correspondent aux messages présents
dans le frontend ou le backend. Certains messages backend sont rédigés en
anglais et sont transmis tels quels par les routes proxy.

### 1.2 Périmètre couvert

Le périmètre comprend :

- la connexion principale par courriel et mot de passe ;
- la session et les droits d'accès ;
- la gestion administrative des employés ;
- l'identification du terminal par PIN ;
- l'entrée et la sortie d'un employé ;
- les preuves selfie et GPS ;
- les exports mensuels PDF ou CSV.

Il ne couvre pas des procédures techniques d'exploitation du serveur, de la
base PostgreSQL ou du déploiement.

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.

## 2. Problèmes de connexion

### 2.1 Identifiants invalides

Le formulaire principal transmet le courriel et le mot de passe à
`POST /auth/login`. Le backend répond « Invalid credentials. » dans chacun des
cas suivants :

- aucun compte ne correspond au courriel ;
- le compte est désactivé ;
- le mot de passe ne correspond pas au hash enregistré.

Le même message est volontairement utilisé pour ces trois situations. Le
frontend l'affiche dans le formulaire. Si la réponse n'apporte aucun message
exploitable, il affiche « Connexion impossible. ».

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/frontend/app/api/auth/login/route.ts`,
`apps/frontend/components/auth/login-form.tsx`.

### 2.2 Erreurs de validation

Le DTO de connexion exige :

| Champ | Validation |
| --- | --- |
| `email` | Adresse électronique valide |
| `password` | Chaîne d'au moins 8 caractères |

Le navigateur marque les deux champs comme obligatoires. La validation globale
du backend refuse également les propriétés non prévues.

Références :
`apps/backend/src/modules/auth/dto/login.dto.ts`,
`apps/backend/src/main.ts`,
`apps/frontend/components/auth/login-form.tsx`.

### 2.3 Erreurs d'authentification API

| Situation | Message backend |
| --- | --- |
| En-tête absent | `Missing Authorization header.` |
| En-tête différent de `Bearer <jeton>` | `Authorization header must use Bearer.` |
| Jeton mal formé, signé avec un autre secret ou expiré | `Invalid or expired token.` |
| Compte supprimé ou devenu inactif | `User is no longer active.` |

Ces contrôles sont réalisés par le guard JWT global avant l'exécution de la
route protégée.

Références :
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/auth.service.ts`.

### 2.4 Accès refusé

Lorsqu'un utilisateur authentifié appelle une route qui n'accepte pas son rôle,
le backend répond « Insufficient permissions for this resource. ».

Dans les pages :

- un utilisateur sans session valide est redirigé vers `/login` ;
- un employé ouvrant une page administrative est redirigé vers
  `/my-attendance` ;
- un administrateur n'utilise pas les routes personnelles `/attendance/me`.

Références :
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/frontend/lib/auth.ts`,
`apps/frontend/app/attendance-history/page.tsx`,
`apps/frontend/app/exports/page.tsx`.

### 2.5 Session invalide ou expirée

Le middleware frontend vérifie la présence du cookie, mais ne vérifie pas le
JWT. Une session expirée peut donc franchir ce premier contrôle. La page
demande ensuite `/auth/me` ; si le backend refuse le jeton,
`requireCurrentUser` redirige vers `/login`.

La déconnexion efface le cookie de session principal et le cookie du terminal,
puis redirige vers `/login`.

Références :
`apps/frontend/middleware.ts`,
`apps/frontend/lib/auth.ts`,
`apps/frontend/app/api/auth/logout/route.ts`.

### 2.6 PIN du terminal

| Situation | Comportement visible |
| --- | --- |
| Moins de quatre chiffres | Bouton de validation indisponible |
| Format différent de quatre chiffres | « Le code PIN doit contenir exactement 4 chiffres. » |
| PIN inconnu, compte inactif ou rôle non employé | « Code PIN invalide. » |
| Limite de tentatives atteinte | « Trop de tentatives. Réessayez dans quelques minutes. » |
| Erreur non reconnue ou réseau | « Impossible de vérifier ce code. » |

Le backend limite le terminal à cinq tentatives par minute et dix tentatives
par dix minutes. Une session terminal périmée ou appartenant à un rôle
incompatible est effacée par la page avant le retour à la saisie du PIN.

Références :
`apps/frontend/components/attendance/attendance-entry-pin-view.tsx`,
`apps/frontend/app/attendance-entry/page.tsx`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/app.module.ts`.

## 3. Problèmes liés aux employés

### 3.1 Employé introuvable

La consultation, la modification ou le changement d'état d'un identifiant
absent retourne « Employee not found. ». Dans l'interface :

- l'échec de chargement du formulaire affiche le message de l'API ou
  « Impossible de charger l'employé. » ;
- l'échec de mise à jour affiche le message de l'API ou
  « Impossible de mettre à jour l'employé. » ;
- l'échec de changement d'état affiche le message de l'API ou
  « Impossible de mettre à jour le statut du compte. ».

Les identifiants de route sont également validés comme UUID avant l'appel du
service.

Références :
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 3.2 Employé désactivé

L'administrateur peut désactiver ou réactiver un compte depuis la liste. Après
succès, l'interface affiche :

- « Compte employé désactivé. » ;
- ou « Compte employé réactivé. ».

Un compte désactivé reste visible dans l'administration, mais :

- sa connexion par mot de passe est refusée ;
- son PIN n'est pas retenu par la recherche du terminal ;
- un JWT existant est refusé au prochain contrôle ;
- une tentative d'entrée administrative le traite comme un employé
  introuvable.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 3.3 Données invalides

| Donnée | Cas refusé |
| --- | --- |
| Prénom ou nom | Valeur non textuelle ou plus de 80 caractères |
| Courriel | Format invalide |
| Fonction métier | Valeur non textuelle ou plus de 80 caractères |
| Rôle d'accès | Valeur autre que `ADMIN` ou `EMPLOYEE` |
| Mot de passe | Moins de 8 ou plus de 128 caractères |
| Département | Plus de 80 caractères |
| Planning | Identifiant non UUID ou planning absent |
| État actif | Valeur non booléenne |
| PIN employé | Format interdit, absence ou conflit |

Le frontend vérifie localement que le mot de passe est fourni à la création et
que le PIN d'un employé contient quatre chiffres. Le backend applique ensuite
l'ensemble des DTO.

Références :
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/src/modules/employees/dto/update-employee.dto.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 3.4 Conflits et dépendances

| Situation | Message observé |
| --- | --- |
| Courriel déjà présent | `An employee with the same email already exists.` |
| PIN déjà attribué | `Ce code PIN est deja utilise.` |
| Planning absent | `Assigned schedule not found.` |
| Échec de génération d'identifiant unique | `Impossible de generer un identifiant employe unique.` |
| Échec final de création | `Impossible de creer l'employe.` |

Une création réussie affiche « Employé créé avec succès. ». Une modification
réussie affiche « Employé mis à jour avec succès. ».

Références :
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 3.5 État du formulaire

L'interface refuse une mise à jour lorsqu'aucun employé n'a été chargé et
affiche « Aucun employé chargé pour la mise à jour. ». Après une création ou
une modification réussie, le formulaire revient à son état de création vide.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

## 4. Problèmes de pointage

### 4.1 Cycle de validation

```text
+----------------------------+
| Session EMPLOYEE valide    |
+-------------+--------------+
              |
              v
+----------------------------+
| Action autorisée ?         |
| Entrée ou sortie           |
+-------------+--------------+
              |
              v
+----------------------------+
| Selfie présent ?           |---- non ----> Refus
+-------------+--------------+
              | oui
              v
+----------------------------+
| Politique GPS active ?     |
+-------------+--------------+
              |
              v
+----------------------------+
| Position, précision, zone  |---- invalide -> Refus
| et commentaire contrôlés   |
+-------------+--------------+
              |
              v
+----------------------------+
| Règles entrée / sortie     |---- conflit -> Refus
+-------------+--------------+
              |
              v
+----------------------------+
| Enregistrement atomique    |
+----------------------------+
```

Références :
`apps/frontend/components/attendance/employee-attendance-actions.tsx`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 4.2 Double entrée

Une entrée est refusée si une entrée existe déjà pour le même employé et la
même journée. Le message est :
`A check-in has already been recorded for this attendance day.`

Une nouvelle entrée est également refusée lorsqu'une sortie existe déjà :
`Cannot record a new check-in after the attendance has been checked out.`

La contrainte unique en base et la mise à jour conditionnelle protègent aussi
contre deux opérations concurrentes.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 4.3 Double sortie

Une sortie déjà enregistrée produit :
`A check-out has already been recorded for this attendance day.`

Le même message est utilisé lorsqu'une mise à jour concurrente a enregistré la
sortie avant la fin de la requête en cours.

Référence :
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 4.4 Sortie sans entrée ou incohérente

| Situation | Message backend |
| --- | --- |
| Aucune entrée le même jour | `Cannot check out before a check-in has been recorded.` |
| Heure de sortie antérieure à l'entrée | `Check-out time cannot be earlier than check-in time.` |
| Date non interprétable | `occurredAt must be a valid ISO-8601 date-time string.` |
| Date future | `occurredAt cannot be in the future.` |

Référence :
`apps/backend/src/modules/attendance/attendance.service.ts`.

### 4.5 Planning absent ou non applicable

L'absence de planning n'empêche pas l'entrée. Le pointage est créé avec :

- un retard de zéro minute ;
- un statut initial `INCOMPLETE` ;
- aucun horaire de sortie planifié exploitable.

Lors de la sortie, l'absence de planning applicable fait traiter le temps
entre l'entrée et la sortie comme du travail hors planning. Le statut final
est `PRESENT`, sauf lorsqu'il s'agit d'un jour non ouvré, auquel cas il reste
`NON_WORKING_DAY_WORK`.

Aucun message d'erreur « planning absent » n'est produit par ce parcours.

Références :
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/common/utils/attendance-schedule-snapshot.util.ts`,
`apps/backend/src/common/utils/attendance-checkout.util.ts`.

### 4.6 Selfie, caméra et photo

| Situation | Message observé |
| --- | --- |
| Caméra non disponible | « La caméra n'est pas disponible sur cet appareil. » |
| Permission caméra refusée | « Autorisez la caméra pour valider le pointage. » |
| Caméra pas encore prête | « La caméra n'est pas encore prête. » |
| Capture impossible | « Impossible de capturer la photo. » |
| Selfie absent dans l'assistant | « Le selfie est obligatoire pour valider ce pointage. » |
| Selfie absent au backend | « Selfie requis pour valider le pointage. » |
| Format d'image invalide | `Verification photo must be a valid image.` |

L'envoi Cloudinary réessaie selon sa configuration. Un dépassement de délai
produit `Cloudinary photo upload timed out. Please retry verification.` ; un
autre échec produit le message Cloudinary reçu ou
`Cloudinary photo upload failed.`.

Références :
`apps/frontend/components/attendance/attendance-selfie-capture.tsx`,
`apps/frontend/components/attendance/employee-attendance-actions.tsx`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`,
`apps/backend/src/modules/attendance/attendance-photo-storage.service.ts`.

### 4.7 Géolocalisation

Lorsque la capture navigateur échoue, l'assistant continue jusqu'à l'écran de
validation avec un état de position indisponible. La décision finale dépend
du backend :

| Contrôle | Message de refus |
| --- | --- |
| Politique active et position absente | « Géolocalisation requise pour valider le pointage. » |
| Précision supérieure à la limite | « Précision GPS insuffisante. » |
| Position hors rayon sans commentaire | « Ajoutez un commentaire pour justifier ce pointage hors bureau. » |

Lorsque la politique GPS est désactivée, l'absence de position ne bloque pas
le pointage employé, mais le selfie reste obligatoire.

Références :
`apps/frontend/components/attendance/employee-attendance-actions.tsx`,
`apps/frontend/components/attendance/attendance-browser-security.ts`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`.

### 4.8 Réponse visible de l'assistant

Une erreur retournée par l'API est affichée dans l'étape de validation. Sans
message, l'interface utilise « Impossible de valider ce pointage. ». Une
exception réseau produit « Connexion indisponible. Réessayez dans quelques
instants. ».

Après succès, l'écran affiche « Pointage enregistré ! » avec l'heure et le
résultat calculé : à l'heure, retard, départ anticipé ou heures
supplémentaires.

Référence :
`apps/frontend/components/attendance/employee-attendance-actions.tsx`.

## 5. Problèmes d'export

### 5.1 Paramètres invalides

| Paramètre | Contrôle frontend | Contrôle backend |
| --- | --- | --- |
| Mois | « Sélectionnez un mois valide. » | Entier de 1 à 12 |
| Année | « Saisissez une année valide entre 2000 et 2100. » | Entier de 2000 à 2100 |
| Format | Interface fixée à `pdf` | `csv` ou `pdf` |
| Employé | Valeur de la liste | UUID facultatif |

La validation backend peut renvoyer plusieurs messages, conformément à la
`ValidationPipe` globale.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts`,
`apps/backend/src/main.ts`.

### 5.2 Absence de données

Le formulaire ne vérifie pas l'existence de données avant de générer le
fichier. Le backend peut construire :

- une synthèse d'équipe vide lorsqu'aucun employé actif ne correspond ;
- un journal quotidien vide lorsqu'aucun pointage n'existe pour l'employé et
  la période ;
- un rapport sans détail individuel lorsqu'un UUID valide ne correspond à
  aucun employé actif.

Les moteurs PDF affichent un état sans lignes dans leurs tableaux. L'absence
de données n'est pas traitée comme une erreur de validation.

Références :
`apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-puppeteer-pdf-renderer.service.ts`.

### 5.3 Génération impossible

L'interface affiche le message reçu de l'API ou
« Impossible de générer le rapport. ». La route proxy possède le message de
repli « Impossible de generer l'export mensuel. ».

Le PDF utilise normalement Puppeteer. Si ce moteur échoue :

- le générateur historique prend le relais seulement si la configuration
  l'autorise ;
- sinon le backend retourne une erreur interne indiquant que le moteur PDF
  premium est indisponible.

Les erreurs de génération ne déclenchent aucun téléchargement et le bouton
retrouve son état normal après la requête.

Références :
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`,
`apps/frontend/app/api/attendance/exports/monthly/route.ts`,
`apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts`.

### 5.4 Réponses de l'API

Une génération réussie fournit :

- le contenu du fichier ;
- le type MIME `application/pdf` ou `text/csv; charset=utf-8` ;
- un nom dans `Content-Disposition` ;
- `Cache-Control: no-store`.

Le frontend utilise le nom de l'en-tête ou construit un nom PDF de repli, puis
affiche « Rapport PDF téléchargé pour ... ».

Références :
`apps/backend/src/modules/attendance/attendance.controller.ts`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.

## 6. Messages observés

### 6.1 Authentification et autorisation

| Message | Contexte |
| --- | --- |
| `Invalid credentials.` | Courriel, mot de passe ou compte actif non valide |
| `Invalid or expired token.` | JWT invalide ou expiré |
| `User is no longer active.` | Compte associé au JWT désactivé ou absent |
| `Insufficient permissions for this resource.` | Rôle non autorisé |
| « Code PIN invalide. » | PIN terminal non reconnu |
| « Trop de tentatives. Réessayez dans quelques minutes. » | Limitation du PIN |
| « Connexion impossible. » | Échec générique du formulaire |

### 6.2 Employés

| Message | Contexte |
| --- | --- |
| `Employee not found.` | Employé absent ou inactif lors du pointage |
| `Assigned schedule not found.` | Planning demandé absent |
| `An employee with the same email already exists.` | Conflit d'unicité |
| `Ce code PIN est deja utilise.` | PIN déjà attribué |
| « Le code PIN doit contenir exactement 4 chiffres. » | PIN non conforme |
| « Le mot de passe est requis pour créer un compte employé. » | Création sans mot de passe |
| « Employé créé avec succès. » | Création réussie |
| « Employé mis à jour avec succès. » | Modification réussie |
| « Compte employé désactivé. » | Désactivation réussie |
| « Compte employé réactivé. » | Réactivation réussie |

### 6.3 Pointage

| Message | Contexte |
| --- | --- |
| `A check-in has already been recorded for this attendance day.` | Double entrée |
| `Cannot record a new check-in after the attendance has been checked out.` | Entrée après sortie |
| `Cannot check out before a check-in has been recorded.` | Sortie sans entrée |
| `A check-out has already been recorded for this attendance day.` | Double sortie |
| `Check-out time cannot be earlier than check-in time.` | Chronologie invalide |
| `occurredAt cannot be in the future.` | Date future |
| « Selfie requis pour valider le pointage. » | Preuve photo backend absente |
| « Géolocalisation requise pour valider le pointage. » | Position obligatoire absente |
| « Précision GPS insuffisante. » | Position trop imprécise |
| « Ajoutez un commentaire pour justifier ce pointage hors bureau. » | Hors zone non justifié |
| « Connexion indisponible. Réessayez dans quelques instants. » | Erreur réseau de l'assistant |
| « Pointage enregistré ! » | Action réussie |

### 6.4 Export

| Message | Contexte |
| --- | --- |
| « Sélectionnez un mois valide. » | Mois hors plage |
| « Saisissez une année valide entre 2000 et 2100. » | Année hors plage |
| « Impossible de générer le rapport. » | Échec générique |
| « Rapport PDF téléchargé pour ... » | Téléchargement réussi |

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/modules/attendance/attendance.service.ts`,
`apps/backend/src/modules/attendance/attendance-security.service.ts`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.

## 7. Traçabilité

| Comportement | Fichiers concernés |
| --- | --- |
| Connexion principale | `apps/backend/src/modules/auth/auth.service.ts` |
| Validation des identifiants | `apps/backend/src/modules/auth/dto/login.dto.ts` |
| Formulaire et erreurs de connexion | `apps/frontend/components/auth/login-form.tsx` |
| Création du cookie principal | `apps/frontend/app/api/auth/login/route.ts` |
| JWT absent, invalide ou expiré | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts` |
| Refus de rôle | `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| Redirection sans session | `apps/frontend/lib/auth.ts` |
| Contrôle initial du cookie | `apps/frontend/middleware.ts` |
| Authentification PIN | `apps/frontend/components/attendance/attendance-entry-pin-view.tsx` |
| Limitation des tentatives PIN | `apps/backend/src/app.module.ts` |
| Gestion administrative des employés | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Validation des employés | `apps/backend/src/modules/employees/dto/create-employee.dto.ts` |
| Conflits et comptes absents | `apps/backend/src/modules/employees/employees.service.ts` |
| Règles d'entrée et de sortie | `apps/backend/src/modules/attendance/attendance.service.ts` |
| Unicité du pointage journalier | `apps/backend/prisma/schema.prisma` |
| Assistant de pointage | `apps/frontend/components/attendance/employee-attendance-actions.tsx` |
| Erreurs de caméra | `apps/frontend/components/attendance/attendance-selfie-capture.tsx` |
| Validation des preuves | `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Stockage des photos | `apps/backend/src/modules/attendance/attendance-photo-storage.service.ts` |
| Formulaire d'export | `apps/frontend/components/dashboard/monthly-attendance-export-card.tsx` |
| Validation de l'export | `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| Données du rapport | `apps/backend/src/modules/attendance/exports/monthly-attendance-export.service.ts` |
| Rendu PDF | `apps/backend/src/modules/attendance/exports/monthly-attendance-pdf-exporter.service.ts` |
| Proxy d'export | `apps/frontend/app/api/attendance/exports/monthly/route.ts` |

## 8. Observations

### 8.1 Comportements existants

- les messages backend sont généralement transmis au frontend par les routes
  proxy ;
- les formulaires possèdent des messages de repli lorsque l'API n'en fournit
  pas ;
- les doubles pointages sont protégés par des contrôles de service, des mises
  à jour conditionnelles et une contrainte de base ;
- une session invalide entraîne une nouvelle authentification ;
- l'absence de planning n'empêche pas le pointage ;
- l'échec de localisation est toléré par l'assistant, puis évalué selon la
  politique backend ;
- l'absence de données n'empêche pas la génération d'un export ;
- le bouton d'export est désactivé uniquement pendant la génération.

### 8.2 Limitations observées

- les messages sont mélangés entre français et anglais ;
- l'erreur de connexion ne distingue pas un compte absent, désactivé ou un mot
  de passe incorrect ;
- le middleware frontend ne détecte pas lui-même un JWT expiré ;
- aucune page dédiée ne regroupe les incidents applicatifs ;
- aucun identifiant d'erreur visible n'est associé aux messages ;
- l'échec de chargement de la liste des employés dans le formulaire d'export
  ne produit pas de message spécifique ;
- le rapport peut être généré sans données sans avertissement préalable ;
- aucun bouton de nouvelle tentative automatique n'est présent dans le
  formulaire d'export ;
- aucune correction manuelle d'un pointage n'est disponible dans l'historique.

### 8.3 Cas non pris en charge

Le dépôt ne contient pas :

- de récupération autonome d'un mot de passe oublié ;
- de déverrouillage manuel d'un compte depuis une page de sécurité ;
- de diagnostic guidé de connexion ;
- de centre de notifications d'erreurs ;
- de reprise d'un téléchargement interrompu ;
- d'aperçu du rapport permettant de détecter une période vide ;
- de correction ou suppression d'un double pointage depuis l'interface ;
- de mode hors ligne pour enregistrer un pointage ;
- de file d'attente locale pour rejouer un pointage après une perte réseau.

Références :
`apps/frontend/app/login/page.tsx`,
`apps/frontend/components/attendance/employee-attendance-actions.tsx`,
`apps/frontend/components/attendance-history/attendance-history-table.tsx`,
`apps/frontend/components/dashboard/monthly-attendance-export-card.tsx`.
