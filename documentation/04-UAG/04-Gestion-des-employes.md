# Gestion des employés

| Métadonnée | Valeur |
| --- | --- |
| Document ID | UAG-EMP-001 |
| Titre | Gestion des employés |
| Version | 1.0 |
| Statut | Validé |
| Classification | Interne |
| Référence | UAG |
| Date de génération | 30 juillet 2026 |

## 1. Présentation

### 1.1 Objectif de la gestion des employés

Le module Employés centralise les comptes et les affectations des
collaborateurs de Konatech Pointage. Il permet de consulter le registre,
rechercher et filtrer les comptes, créer ou modifier un employé, changer son
état et l'associer à un planning.

Les informations gérées par l'écran comprennent :

- l'identité ;
- l'adresse électronique ;
- l'identifiant employé généré par le backend ;
- le rôle métier ;
- le rôle d'accès ;
- le département ;
- le planning ;
- l'état actif ou inactif ;
- le code PIN des comptes employés ;
- le mot de passe de connexion.

Le module ne contient aucune fonction de suppression d'un employé.

Références :
`apps/frontend/app/employees/page.tsx`,
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/prisma/schema.prisma`.

### 1.2 Rôle de l'administrateur

Toutes les routes du contrôleur `EmployeesController` sont réservées au rôle
d'accès `ADMIN`. L'administrateur peut :

- consulter tous les comptes ;
- consulter un compte précis ;
- créer un compte ;
- modifier un compte ;
- activer ou désactiver un compte ;
- modifier le rôle métier ;
- modifier le département ;
- affecter ou retirer un planning.

Dans l'interface actuelle, les informations d'un compte sont modifiées ensemble
par le formulaire principal. L'activation et la désactivation disposent aussi
d'une action directe dans chaque ligne.

Les créations, modifications, changements d'état, changements de rôle métier,
de département et de planning sont transmis au service de journalisation
d'audit par leurs endpoints backend respectifs.

Références :
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/common/audit/audit-log.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 1.3 Données chargées par le module

Avant d'afficher le module, la page charge en parallèle :

```text
GET /api/v1/employees
GET /api/v1/schedules
```

La liste des employés contient les informations du compte et, lorsqu'il
existe, le planning associé. La liste des plannings alimente le sélecteur du
formulaire.

Les codes PIN et leurs empreintes ne sont pas retournés au frontend. La réponse
contient uniquement le booléen `pinConfigured`.

Références :
`apps/frontend/lib/api.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/common/prisma/selects.ts`.

## 2. Accès au module

### 2.1 Parcours réel

Le parcours administrateur est :

```text
+---------------------------+
| Connexion                 |
| /login                    |
+-------------+-------------+
              |
              v
+---------------------------+
| Dashboard                 |
| /                         |
+-------------+-------------+
              |
              | menu Équipe
              v
+---------------------------+
| Employés                  |
| /employees                |
+---------------------------+
```

L'administrateur peut ouvrir `/employees` depuis :

- le lien `Employés` du groupe `Équipe` dans la navigation ;
- l'action rapide `Créer un employé` du tableau de bord.

Ces deux accès ouvrent la page générale. L'action rapide ne transmet pas de
paramètre demandant l'ouverture d'une section spécifique.

Références :
`apps/frontend/components/admin/admin-nav.tsx`,
`apps/frontend/components/dashboard/quick-actions-section.tsx`,
`apps/frontend/app/employees/page.tsx`.

### 2.2 Contrôle d'accès

La page exécute les contrôles suivants :

1. récupération de l'utilisateur courant ;
2. redirection vers `/login` en l'absence d'une session valide ;
3. redirection vers `/my-attendance` lorsque le rôle n'est pas `ADMIN` ;
4. récupération du jeton de session ;
5. chargement des employés et des plannings.

Le backend vérifie aussi le JWT et le rôle `ADMIN` avant d'exécuter une route
du contrôleur des employés.

Références :
`apps/frontend/app/employees/page.tsx`,
`apps/frontend/lib/auth.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`.

### 2.3 En-tête du module

L'en-tête affiche :

- la navigation administrateur ;
- le bouton de déconnexion ;
- la date du jour ;
- une salutation avec le prénom de l'administrateur ;
- le titre `Gestion des collaborateurs` ;
- le nom et le département ou rôle de la session active ;
- le nombre total de comptes ;
- le nombre de comptes administrateurs.

Référence : `apps/frontend/app/employees/page.tsx`.

## 3. Liste des employés

### 3.1 Présentation de la liste

La liste n'est pas rendue sous forme de tableau HTML. Chaque employé est
affiché dans une carte structurée en quatre zones visuelles.

| Zone | Informations affichées |
| --- | --- |
| Identité | Prénom, nom, identifiant employé et email |
| État | Badge `Actif` ou `Inactif`, badge `PIN défini` ou `PIN manquant` |
| Accès et organisation | `Administrateur` ou `Employé`, rôle métier, département |
| Planning | Nom, horaire et badge `Affecté` ou `Non assigné` |
| Actions | `Modifier` et `Activer` ou `Désactiver` |

Lorsqu'une carte correspond au compte chargé dans le formulaire, elle reçoit
le badge `En édition`.

En l'absence de département, le texte `Sans département` est affiché. En
l'absence de planning, la carte affiche `Sans planning`, `Non assigné` et
`Affectation requise`.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/components/employees/employee-manager.helpers.ts`.

### 3.2 Cartes de synthèse

Au-dessus de la liste, quatre cartes présentent :

| Carte | Valeur |
| --- | --- |
| Comptes | Nombre total de comptes chargés |
| Actifs | Nombre de comptes actifs et nombre d'inactifs |
| Sans planning | Nombre sans planning et taux de couverture |
| Admins | Nombre de comptes `ADMIN` et nombre de départements distincts |

Le taux de couverture est calculé par le frontend comme le nombre de comptes
avec planning divisé par le nombre total de comptes, arrondi au pourcentage
entier. Il vaut zéro lorsque la liste est vide.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 3.3 Recherche

La recherche est appliquée dans le navigateur sur les employés déjà chargés.
Elle est insensible à la casse et cherche la saisie dans la concaténation des
champs suivants :

- prénom ;
- nom ;
- identifiant employé ;
- email ;
- département ;
- rôle métier ;
- nom du planning.

La saisie est normalisée avec `trim()` et `toLowerCase()`. Aucune requête
backend supplémentaire n'est déclenchée par la recherche.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 3.4 Filtres

Trois filtres sont présents :

| Filtre | Valeurs |
| --- | --- |
| Statut | Tous, Actifs, Inactifs |
| Accès | Tous, Administrateur, Employé |
| Planning | Tous, Affectés, Sans planning |

Les filtres se combinent avec la recherche. Le compteur de résultats visibles
est recalculé après chaque changement.

Le bouton `Effacer les filtres` remet la recherche et les trois filtres à leur
état initial. Il est désactivé lorsqu'aucun filtre ni recherche n'est actif.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 3.5 Pagination

Aucune pagination n'est implémentée :

- l'endpoint `GET /employees` ne reçoit pas de page ni de limite ;
- le service utilise `findMany` sans `skip` ni `take` ;
- le composant rend l'ensemble des employés correspondant aux filtres.

Références :
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 3.6 Tri

Aucun sélecteur ni bouton de tri n'est présent dans l'interface.

Le backend applique un ordre fixe :

1. date de création décroissante ;
2. nom croissant ;
3. prénom croissant.

La création réussie insère le nouveau compte au début de l'état local du
frontend. Les filtres conservent ensuite l'ordre de cette liste locale.

Références :
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/components/employees/employee-manager.helpers.ts`.

### 3.7 Actions disponibles

Les actions directement accessibles depuis la liste sont :

| Action | Comportement |
| --- | --- |
| `Modifier` | Recharge le compte par identifiant puis remplit le formulaire |
| `Désactiver` | Envoie `isActive: false` |
| `Activer` | Envoie `isActive: true` |

Pendant le chargement ou le changement d'état d'une ligne :

- le libellé devient `Chargement...` ou `Mise à jour...` ;
- les actions de toutes les lignes sont désactivées tant que `rowAction` est
  défini.

Les actions de suppression, d'export individuel, d'envoi d'invitation et de
réinitialisation autonome d'un mot de passe ne sont pas présentes dans la
liste.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

## 4. Création d'un employé

### 4.1 Ouverture du formulaire

Le formulaire se trouve dans la même page que la liste. Son état initial est
le mode création. Les actions suivantes le remettent également en mode
création avec des valeurs vides :

- `Nouveau collaborateur` ;
- `Réinitialiser` ;
- `Créer un employé` dans l'état sans données ;
- `Annuler` lorsqu'un compte était en édition.

Les valeurs initiales observées sont :

| Champ | Valeur initiale |
| --- | --- |
| Code PIN | Vide |
| Prénom | Vide |
| Nom | Vide |
| Email | Vide |
| Rôle métier | Vide |
| Rôle d'accès | `EMPLOYEE` |
| Mot de passe | Vide |
| Département | Vide |
| Planning | Aucun |
| Compte actif | Oui |

Références :
`apps/frontend/components/employees/employee-manager.helpers.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 4.2 Champs du formulaire

| Section | Champ | Type ou choix | Présence en création |
| --- | --- | --- | --- |
| Identité | Code PIN | Quatre chiffres | Requis pour `EMPLOYEE`, désactivé pour `ADMIN` |
| Identité | Prénom | Texte | Requis |
| Identité | Nom | Texte | Requis |
| Identité | Email | Email | Requis |
| Organisation | Rôle métier | Texte | Requis |
| Organisation | Rôle d'accès | `EMPLOYEE` ou `ADMIN` | Valeur par défaut `EMPLOYEE` |
| Organisation | Département | Texte | Facultatif |
| Planning | Planning | Aucun ou un planning chargé | Facultatif |
| Planning | Compte actif | Case à cocher | Coché par défaut |
| Sécurité | Mot de passe initial | Mot de passe | Requis par la logique de soumission |

Le formulaire affiche un résumé du planning sélectionné avec son nom, son
heure de début et son heure de fin. Sans sélection, il affiche
`Sans planning`.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 4.3 Validations frontend

Le frontend applique :

- les attributs HTML `required` sur prénom, nom, email et rôle métier ;
- `type="email"` sur l'adresse électronique ;
- `minLength=8` sur le mot de passe ;
- une vérification explicite de présence du mot de passe à la création ;
- une normalisation du PIN qui retire les caractères non numériques et limite
  la valeur à quatre chiffres ;
- une vérification explicite du format exact de quatre chiffres pour un compte
  `EMPLOYEE`.

Le champ PIN est requis et actif uniquement lorsque le rôle d'accès vaut
`EMPLOYEE`. Pour `ADMIN`, il est désactivé et le payload envoie `pinCode:
null`.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 4.4 Validations backend

Le DTO et le service appliquent les règles suivantes :

| Champ ou règle | Validation |
| --- | --- |
| PIN | Quatre chiffres et valeur non interdite |
| Prénom | Chaîne, 80 caractères au maximum |
| Nom | Chaîne, 80 caractères au maximum |
| Email | Adresse électronique valide |
| Rôle métier | Chaîne, 80 caractères au maximum |
| Rôle d'accès | Valeur de l'enum `AccessRole` |
| Mot de passe | De 8 à 128 caractères |
| Département | Chaîne facultative, 80 caractères au maximum |
| État | Booléen facultatif |
| Planning | UUID facultatif |

Pour la création d'un compte `EMPLOYEE`, le service exige un PIN valide même
si le DTO déclare le champ comme facultatif. Les valeurs explicitement
interdites par le code sont :

```text
0000
1111
1234
4321
9999
```

Le service vérifie aussi que le PIN n'est pas déjà utilisé par un autre compte
employé. Il vérifie l'existence du planning lorsqu'un identifiant de planning
est fourni.

L'email et l'identifiant employé sont uniques dans le modèle Prisma.

Références :
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/src/common/validation/pin-code.validation.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/prisma/schema.prisma`.

### 4.5 Création

Après validation, le frontend envoie :

```text
POST /api/employees
        |
        v
POST /api/v1/employees
```

Le backend :

1. valide le PIN selon le rôle d'accès ;
2. vérifie le planning éventuel ;
3. calcule l'empreinte du mot de passe avec `scrypt` ;
4. génère un identifiant employé ;
5. crée le compte dans une transaction Prisma ;
6. retourne le compte avec son planning éventuel et `pinConfigured`.

L'identifiant généré suit le format observé :

```text
EMP-<année UTC>-<séquence sur trois chiffres>
```

Le service recherche la plus grande séquence existante de l'année et tente
jusqu'à trois fois en cas de conflit d'identifiant.

Le mot de passe et le PIN sont stockés sous forme d'empreintes. Le PIN en clair
et son empreinte ne sont pas renvoyés dans la réponse.

Références :
`apps/frontend/app/api/employees/route.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/src/common/security/password.util.ts`.

### 4.6 Messages de création

Pendant la soumission, le bouton affiche `Création...` et est désactivé.

Les messages propres au frontend sont :

| Situation | Message |
| --- | --- |
| Mot de passe vide | `Le mot de passe est requis pour créer un compte employé.` |
| PIN employé au mauvais format | `Le code PIN doit contenir exactement 4 chiffres.` |
| Succès | `Employé créé avec succès.` |
| Échec sans détail exploitable | `Impossible de créer l'employé.` |

Les erreurs backend sont relayées lorsqu'elles contiennent un message. Elles
comprennent notamment :

- `Code PIN invalide.` ;
- `Ce code PIN est deja utilise.` ;
- `An employee with the same email already exists.` ;
- `Assigned schedule not found.` ;
- l'erreur de génération d'un identifiant unique.

Après un succès, le compte est ajouté en tête de la liste locale et le
formulaire revient au mode création vide.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/lib/client-error.ts`,
`apps/backend/src/modules/employees/employees.service.ts`.

## 5. Modification

### 5.1 Chargement d'un compte

L'action `Modifier` appelle :

```text
GET /api/employees/<id>
        |
        v
GET /api/v1/employees/<id>
```

L'identifiant est validé comme UUID par le backend. Si le compte existe, le
formulaire passe en mode édition et affiche son nom ainsi que son identifiant
dans la zone `Sélection`.

La carte correspondante est signalée par `En édition`.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/app/api/employees/[id]/route.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`.

### 5.2 Informations modifiables

Le formulaire d'édition permet de modifier :

- le code PIN pour un compte `EMPLOYEE` ;
- le prénom ;
- le nom ;
- l'email ;
- le rôle métier ;
- le rôle d'accès ;
- le département ;
- le planning ;
- l'état actif ou inactif ;
- le mot de passe.

L'identifiant employé n'est pas modifiable dans le formulaire. Il est
uniquement affiché dans la sélection et dans la liste.

Le champ mot de passe est vide lors du chargement. S'il reste vide, le frontend
ne l'inclut pas dans la requête et le mot de passe existant est conservé. Une
valeur saisie devient un nouveau mot de passe dont le backend calcule
l'empreinte.

Références :
`apps/frontend/components/employees/employee-manager.helpers.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.service.ts`.

### 5.3 Gestion du PIN en modification

Le backend ne retourne pas le PIN existant ; il retourne uniquement
`pinConfigured`. Par conséquent, le formulaire initialise toujours le champ
PIN à une valeur vide lorsqu'un compte est chargé.

Dans l'interface actuelle :

- le PIN est requis lorsque le rôle sélectionné est `EMPLOYEE` ;
- la logique de soumission exige quatre chiffres pour ce rôle ;
- l'administrateur doit donc saisir un PIN lors de l'enregistrement d'un compte
  `EMPLOYEE`, même si `pinConfigured` indique qu'un PIN existe déjà ;
- le nouveau PIN remplace l'empreinte précédente ;
- si le rôle est changé en `ADMIN`, le frontend envoie `null` et le backend
  supprime le PIN et son empreinte ;
- si un compte `ADMIN` devient `EMPLOYEE`, un PIN de quatre chiffres est
  nécessaire.

Le service backend sait conserver un PIN existant lorsqu'aucune nouvelle
valeur n'est fournie, mais le formulaire actuel bloque la soumission d'un rôle
`EMPLOYEE` avec un champ PIN vide.

Références :
`apps/frontend/components/employees/employee-manager.helpers.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.service.ts`.

### 5.4 Validations

Le DTO de modification rend tous les champs facultatifs et applique, lorsqu'un
champ est présent :

- le format et les valeurs interdites du PIN ;
- les longueurs maximales de prénom, nom, rôle et département ;
- le format email ;
- l'enum du rôle d'accès ;
- la longueur du mot de passe ;
- le type booléen de l'état ;
- le format UUID du planning.

Une chaîne vide pour le département ou le planning est transformée en `null`
par le DTO. Le frontend normalise déjà le département vide en `null` et le
planning vide en `null`.

Le service refuse un compte absent et un planning inexistant. Les contraintes
d'unicité de l'email et du PIN restent appliquées.

Références :
`apps/backend/src/modules/employees/dto/update-employee.dto.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 5.5 Sauvegarde

La sauvegarde appelle :

```text
PATCH /api/employees/<id>
        |
        v
PATCH /api/v1/employees/<id>
```

Le frontend envoie les valeurs partagées du formulaire et n'ajoute le mot de
passe que s'il n'est pas vide.

Pendant la requête :

- le bouton principal affiche `Mise à jour...` ;
- les boutons de soumission et de réinitialisation sont désactivés.

Après un succès :

- l'élément correspondant est remplacé dans l'état local ;
- le message `Employé mis à jour avec succès.` est affiché ;
- le formulaire revient en mode création.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/app/api/employees/[id]/route.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`.

### 5.6 Messages

| Situation | Message frontend |
| --- | --- |
| Aucun identifiant chargé en mode édition | `Aucun employé chargé pour la mise à jour.` |
| PIN employé au mauvais format | `Le code PIN doit contenir exactement 4 chiffres.` |
| Échec de chargement sans détail | `Impossible de charger l'employé.` |
| Échec de mise à jour sans détail | `Impossible de mettre à jour l'employé.` |
| Succès | `Employé mis à jour avec succès.` |

Les erreurs de validation, d'unicité, de compte absent et de planning absent
produites par le backend peuvent remplacer les messages de repli lorsqu'elles
sont relayées.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/lib/client-error.ts`,
`apps/backend/src/modules/employees/employees.service.ts`.

## 6. Activation / Désactivation

### 6.1 Action directe

Chaque carte affiche :

- `Désactiver` lorsque `isActive` vaut `true` ;
- `Activer` lorsque `isActive` vaut `false`.

L'action inverse la valeur courante et appelle :

```text
PATCH /api/employees/<id>/status
        |
        v
PATCH /api/v1/employees/<id>/status
```

Le payload contient uniquement le booléen `isActive`.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/app/api/employees/[id]/status/route.ts`,
`apps/backend/src/modules/employees/dto/update-employee-status.dto.ts`.

### 6.2 Activation

Après une activation réussie :

- le compte reçu remplace le compte dans la liste locale ;
- le badge devient `Actif` ;
- le bouton devient `Désactiver` ;
- le compteur de comptes actifs est recalculé ;
- le message `Compte employé réactivé.` est affiché.

Si le compte était ouvert dans le formulaire, les valeurs du formulaire sont
reconstruites depuis la réponse.

Référence :
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 6.3 Désactivation

Après une désactivation réussie :

- le badge devient `Inactif` ;
- le bouton devient `Activer` ;
- le compteur d'inactifs est recalculé ;
- le message `Compte employé désactivé.` est affiché.

La désactivation ne supprime ni le compte, ni son planning, ni ses pointages.
Elle modifie uniquement `isActive`.

Références :
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/backend/prisma/schema.prisma`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 6.4 Conséquences observables

Le service d'authentification refuse :

- un compte inactif lors d'une connexion par email et mot de passe ;
- un compte devenu inactif lors de la validation ultérieure d'un JWT ;
- un compte inactif dans la recherche des comptes autorisés à utiliser le
  terminal de pointage par PIN.

Une session dont le jeton existe encore ne permet donc plus d'utiliser les
routes protégées après rechargement du compte par le backend.

Le service du tableau de bord compte uniquement les employés actifs dans ses
agrégations de population et de planning.

Références :
`apps/backend/src/modules/auth/auth.service.ts`,
`apps/backend/src/modules/dashboard/dashboard.service.ts`.

### 6.5 Changement d'état dans le formulaire

La case `Compte actif` du formulaire permet aussi de modifier `isActive` lors
d'une création ou d'une sauvegarde complète. Son texte indique qu'elle
représente le même état que l'action rapide de la liste.

L'action directe produit un événement d'audit
`employee.status.update`. Une modification complète produit
`employee.update`, y compris lorsque `isActive` fait partie des champs envoyés.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/backend/src/modules/employees/employees.controller.ts`.

## 7. Association avec les plannings

### 7.1 Liste disponible

La page charge tous les plannings retournés par `GET /schedules` et les affiche
dans le sélecteur sous la forme :

```text
Nom (heure de début - heure de fin)
```

Le choix `Aucun planning` utilise une valeur vide. Le frontend la convertit en
`null` dans la requête.

Le sélecteur n'exclut pas les plannings inactifs dans le composant : il parcourt
directement la liste reçue.

Références :
`apps/frontend/lib/api.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 7.2 Affectation à la création

Lorsqu'un planning est sélectionné :

- son UUID est envoyé dans `scheduleId` ;
- le service vérifie que le planning existe ;
- Prisma connecte le compte au planning.

Sans planning sélectionné, aucun lien de planning n'est créé.

Références :
`apps/backend/src/modules/employees/dto/create-employee.dto.ts`,
`apps/backend/src/modules/employees/employees.service.ts`.

### 7.3 Modification et retrait

Lors d'une modification :

- un UUID de planning provoque une connexion au planning correspondant ;
- `scheduleId: null` provoque la déconnexion du planning actuel ;
- un planning inexistant produit `Assigned schedule not found.`.

Le contrôleur backend possède aussi une route spécialisée
`PATCH /employees/:id/schedule`. L'interface de gestion actuelle n'appelle pas
cette route spécialisée ; elle envoie `scheduleId` dans la modification
complète `PATCH /employees/:id`.

Références :
`apps/backend/src/modules/employees/dto/update-employee.dto.ts`,
`apps/backend/src/modules/employees/dto/assign-employee-schedule.dto.ts`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

### 7.4 Affichage de l'affectation

Dans la liste :

- un compte affecté affiche le nom, les heures et le badge `Affecté` ;
- un compte sans planning affiche `Sans planning`, `Non assigné` et
  `Affectation requise`.

Les cartes de synthèse affichent le nombre de comptes sans planning et le taux
de couverture. Le filtre Planning distingue les comptes affectés et sans
planning.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/components/employees/employee-manager.helpers.ts`.

## 8. Comportements observés

### 8.1 Erreurs initiales

La page charge les employés et les plannings avec `Promise.all`. Si l'une des
deux requêtes échoue, le rendu du module échoue dans son ensemble.

La frontière d'erreur Employés affiche :

- `Erreur de rendu` ;
- le contexte `Employés` ;
- le message de l'erreur ;
- `Réessayer` ;
- `Recharger la page`.

Le rechargement renvoie vers `/employees`.

Références :
`apps/frontend/lib/api.ts`,
`apps/frontend/app/employees/error.tsx`.

### 8.2 Erreurs des actions

Les actions de chargement, sauvegarde et changement d'état lisent le corps JSON
de la réponse et affichent le message backend lorsqu'il est exploitable. Sinon,
elles utilisent un message propre à l'opération.

Le composant place les remises à zéro d'état de soumission et d'action dans des
blocs `finally`. Les boutons reviennent donc à leur état normal après une
réponse positive ou négative.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/lib/client-error.ts`.

### 8.3 Accès refusés

| Situation | Comportement |
| --- | --- |
| Session absente ou invalide | Redirection frontend vers `/login` |
| Rôle `EMPLOYEE` sur la page | Redirection frontend vers `/my-attendance` |
| API sans bearer token valide | Refus du guard JWT |
| API avec un rôle différent de `ADMIN` | Refus du guard de rôles |
| Identifiant de route non UUID | Rejet par `ParseUUIDPipe` |

Références :
`apps/frontend/app/employees/page.tsx`,
`apps/backend/src/modules/employees/employees.controller.ts`,
`apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`,
`apps/backend/src/modules/auth/guards/roles.guard.ts`.

### 8.4 État sans données

Lorsque la liste complète est vide, le composant affiche :

- le badge `Employés` ;
- le titre `Aucun collaborateur` ;
- la description `Ajoutez votre premier collaborateur.` ;
- le détail indiquant que la liste se mettra à jour ;
- l'action `Créer un employé`.

Lorsque des comptes existent mais qu'aucun ne correspond aux filtres, il
affiche :

- le badge `Filtres actifs` ;
- le titre `Aucun résultat` ;
- une invitation à ajuster les filtres ;
- l'action `Effacer les filtres`.

Références :
`apps/frontend/components/employees/admin-employees-manager.tsx`,
`apps/frontend/components/admin/admin-empty-state.tsx`.

### 8.5 État de chargement

Pendant le chargement initial de la route, `employees/loading.tsx` affiche des
squelettes pour :

- l'en-tête ;
- les cartes de synthèse ;
- les filtres ;
- plusieurs lignes ;
- le formulaire.

Référence : `apps/frontend/app/employees/loading.tsx`.

### 8.6 Restrictions

Les restrictions observées sont :

- rôle d'accès limité à `ADMIN` ou `EMPLOYEE` ;
- PIN requis par l'interface pour enregistrer un rôle `EMPLOYEE` ;
- PIN limité à quatre chiffres ;
- plusieurs PIN simples explicitement refusés ;
- unicité du PIN entre comptes employés ;
- unicité de l'email ;
- identifiant employé généré et non éditable ;
- planning facultatif mais nécessairement existant lorsqu'il est fourni ;
- mot de passe requis à la création ;
- mot de passe facultatif à la modification ;
- mot de passe limité de 8 à 128 caractères ;
- aucun accès du rôle `EMPLOYEE` à la gestion des comptes.

Références :
`apps/backend/prisma/schema.prisma`,
`apps/backend/src/modules/employees/dto`,
`apps/backend/src/modules/employees/employees.service.ts`,
`apps/frontend/components/employees/admin-employees-manager.tsx`.

## 9. Traçabilité

| Fonctionnalité | Élément observable | Fichiers concernés |
| --- | --- | --- |
| Page Employés | Route dynamique et contrôle d'accès | `apps/frontend/app/employees/page.tsx` |
| Navigation | Lien du groupe Équipe | `apps/frontend/components/admin/admin-nav.tsx` |
| Action rapide | Lien `Créer un employé` | `apps/frontend/components/dashboard/quick-actions-section.tsx` |
| Chargement initial | Employés et plannings en parallèle | `apps/frontend/lib/api.ts` |
| Registre | Cartes des employés | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Libellés d'état | Compte, rôle, planning et PIN | `apps/frontend/components/employees/employee-manager.helpers.ts` |
| Recherche | Filtrage local multi-champs | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Filtres | Statut, accès et planning | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Ordre de liste | Ordre Prisma fixe | `apps/backend/src/modules/employees/employees.service.ts` |
| Absence de pagination | `findMany` sans page ni limite | `apps/backend/src/modules/employees/employees.service.ts` |
| Formulaire | Création et édition | `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Valeurs initiales | Mode création et mappage édition | `apps/frontend/components/employees/employee-manager.helpers.ts` |
| Types de payload | Création et modification | `apps/frontend/lib/api.ts` |
| Proxy de collection | GET et POST locaux | `apps/frontend/app/api/employees/route.ts` |
| Proxy d'un compte | GET et PATCH locaux | `apps/frontend/app/api/employees/[id]/route.ts` |
| Proxy de statut | PATCH local | `apps/frontend/app/api/employees/[id]/status/route.ts` |
| Contrôleur backend | Routes réservées à `ADMIN` | `apps/backend/src/modules/employees/employees.controller.ts` |
| Validation de création | DTO de création | `apps/backend/src/modules/employees/dto/create-employee.dto.ts` |
| Validation de modification | DTO de modification | `apps/backend/src/modules/employees/dto/update-employee.dto.ts` |
| Validation de statut | Booléen requis | `apps/backend/src/modules/employees/dto/update-employee-status.dto.ts` |
| Validation du PIN | Format et valeurs interdites | `apps/backend/src/common/validation/pin-code.validation.ts` |
| Empreintes | `scrypt` pour mot de passe et PIN | `apps/backend/src/common/security/password.util.ts` |
| Création | Identifiant et transaction Prisma | `apps/backend/src/modules/employees/employees.service.ts` |
| Modification | Construction des champs Prisma | `apps/backend/src/modules/employees/employees.service.ts` |
| Activation | Modification de `isActive` | `apps/backend/src/modules/employees/employees.service.ts` |
| Conséquence d'inactivité | Refus d'authentification | `apps/backend/src/modules/auth/auth.service.ts` |
| Affectation planning | Connexion et déconnexion Prisma | `apps/backend/src/modules/employees/employees.service.ts` |
| Audit | Événements des opérations administrateur | `apps/backend/src/modules/employees/employees.controller.ts`, `apps/backend/src/common/audit/audit-log.service.ts` |
| Chargement visuel | Squelettes Employés | `apps/frontend/app/employees/loading.tsx` |
| Erreur de rendu | Écran et actions d'erreur | `apps/frontend/app/employees/error.tsx` |
| États vides | Aucun compte ou aucun résultat | `apps/frontend/components/admin/admin-empty-state.tsx`, `apps/frontend/components/employees/admin-employees-manager.tsx` |
| Modèle de données | Compte, rôle, planning et contraintes | `apps/backend/prisma/schema.prisma` |

## 10. Observations

### 10.1 Comportements observés

- La liste et les plannings sont chargés avant le rendu de la page.
- La recherche et les filtres ne sollicitent pas de nouveau le backend.
- Les créations, modifications et changements d'état mettent à jour l'état
  local sans recharger toute la page.
- Le compte nouvellement créé est placé en tête de liste.
- La modification recharge d'abord le compte depuis l'API.
- Le rôle métier et le rôle d'accès sont deux champs différents.
- Un compte `ADMIN` n'utilise pas de PIN dans le service.
- Un compte `EMPLOYEE` doit disposer d'un PIN valide.
- Le frontend ne reçoit jamais la valeur du PIN ni son empreinte.
- La désactivation empêche l'authentification sans supprimer les données.
- L'absence de planning est un état accepté et visible.
- Les opérations administrateur sont journalisées par le backend.

### 10.2 Limitations

- Aucun mécanisme de pagination.
- Aucun tri interactif.
- Aucun filtre par département.
- Aucun filtre par rôle métier.
- Aucun filtre par état du PIN.
- Aucune suppression d'un employé.
- Aucune suppression en masse.
- Aucune activation ou désactivation en masse.
- Aucun import de comptes.
- Aucun export de la liste des employés.
- Aucune invitation par email.
- Aucun envoi d'identifiants depuis ce module.
- Aucun affichage du mot de passe ou du PIN existant.
- Aucune modification manuelle de l'identifiant employé.
- Aucune confirmation intermédiaire avant l'activation ou la désactivation.
- Aucun historique des modifications visible dans l'interface.
- Aucun accès visible aux journaux d'audit.
- Aucun sélecteur limité aux seuls plannings actifs.
- Aucun détail des pointages d'un employé depuis sa carte.

### 10.3 Fonctionnalités absentes

Les opérations suivantes ne sont matérialisées ni dans l'interface ni par une
route du contrôleur des employés :

- suppression définitive d'un compte ;
- archivage distinct de la désactivation ;
- fusion de comptes ;
- duplication d'un compte ;
- import ou synchronisation depuis un annuaire externe ;
- envoi d'une invitation ;
- réinitialisation de mot de passe avec un lien utilisateur ;
- réinitialisation de PIN par un parcours séparé ;
- pagination serveur ;
- tri demandé au serveur.

Ces constats décrivent uniquement l'état actuel du dépôt.
