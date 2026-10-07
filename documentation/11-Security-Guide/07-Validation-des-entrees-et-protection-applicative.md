# 1. Présentation

La validation des entrées et la protection applicative contrôlent les données reçues par l'API avant leur traitement métier. Le projet combine des DTO `class-validator`, un `ValidationPipe` global, des guards d'authentification et de rôle, des limites de débit et des contrôles métier dans les services.

# 2. Validation des données

Le backend configure le `ValidationPipe` global avec `whitelist: true`, `forbidNonWhitelisted: true`, `transform: true` et la conversion implicite activée (`apps/backend/src/main.ts`). Les propriétés inconnues sont donc rejetées par le pipeline global.

Les DTO utilisent notamment les décorateurs suivants :

| Mécanisme | Utilisation observée |
|---|---|
| `IsString`, `IsEmail`, `IsBoolean`, `IsInt`, `IsNumber` | Vérification des types et de l'adresse e-mail. |
| `IsUUID`, `IsDateString`, `IsEnum`, `IsIn` | Identifiants, dates, rôles, formats et valeurs autorisées. |
| `Min`, `Max`, `MinLength`, `MaxLength` | Bornes numériques et longueurs de chaînes. |
| `Matches`, `IsNotIn` | Formats de PIN, mois `YYYY-MM`, horaires et valeurs interdites. |
| `IsOptional`, `ValidateIf`, `ValidateNested` | Champs facultatifs, conditions et objets imbriqués. |
| `Type`, `Transform` | Conversion ou normalisation de certaines valeurs avant validation. |

Les DTO d'authentification valident l'e-mail, le mot de passe et le PIN de borne. Les DTO de pointage contrôlent les UUID, dates, mois, notes et données GPS/photo. Les DTO employés, plannings, calendrier, sanctions et exports définissent leurs propres contraintes dans leurs fichiers respectifs.

# 3. Protection applicative

Les protections globales et applicatives présentes sont :

- `JwtAuthGuard` pour exiger le jeton Bearer sur les routes non publiques ;
- `RolesGuard` pour comparer `accessRole` aux rôles déclarés ;
- `AppThrottlerGuard` pour les limites générales, de connexion et de PIN de borne ;
- Helmet dans le bootstrap HTTP ;
- limite des corps JSON et URL-encoded par `JSON_BODY_LIMIT` ;
- CORS limité à `FRONTEND_URL` avec credentials ;
- validations métier dans les services pour les doublons, les états de pointage, les dates et les règles de sécurité GPS/photo.

Les limites de débit utilisent `RATE_LIMIT_TTL_MS`, `RATE_LIMIT_MAX`, `LOGIN_RATE_LIMIT_TTL_MS` et `LOGIN_RATE_LIMIT_MAX`. Le guard ajoute des en-têtes de limite et `Retry-After`, et lève une exception HTTP lorsque la limite est atteinte (`apps/backend/src/common/security/app-throttler.guard.ts`).

# 4. Gestion des erreurs

Les erreurs de validation du pipeline sont traitées par NestJS. Les guards utilisent `UnauthorizedException` pour les en-têtes ou jetons invalides et `ForbiddenException` pour un rôle insuffisant. Les services utilisent notamment `BadRequestException`, `ConflictException` et `NotFoundException` pour les contraintes métier et les ressources inexistantes.

Les contrôles de sécurité du pointage lèvent des exceptions `BadRequestException` dédiées lorsque la localisation est absente, hors zone, imprécise ou lorsqu'une preuve requise manque (`apps/backend/src/modules/attendance/attendance-security.exception.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts`).

# 5. Vérification

Les commandes de vérification présentes dans le dépôt sont :

```bash
pnpm typecheck
pnpm lint
pnpm test:backend
pnpm test:proxy
pnpm validate
```

`pnpm validate` enchaîne le formatage, la génération Prisma, le typage, le lint, les tests backend, les builds et le test du proxy. Les tests backend couvrent les scénarios HTTP et de validation définis sous `apps/backend/test/`, tandis que `pnpm test:proxy` vérifie les échanges frontend/backend et les réponses de santé (`scripts/validate-proxy.mjs`).

# 6. Références

| Élément documenté | Fichiers analysés |
|---|---|
| Configuration globale de validation et protections HTTP | `apps/backend/src/main.ts` |
| Validation de configuration et limites | `apps/backend/src/app.module.ts` |
| Limitation de débit | `apps/backend/src/common/security/app-throttler.guard.ts` |
| Guards d'authentification et de rôles | `apps/backend/src/modules/auth/guards/jwt-auth.guard.ts`, `apps/backend/src/modules/auth/guards/roles.guard.ts` |
| DTO d'authentification et de pointage | `apps/backend/src/modules/auth/dto/`, `apps/backend/src/modules/attendance/dto/` |
| DTO employés, plannings, calendrier, sanctions et exports | `apps/backend/src/modules/employees/dto/`, `apps/backend/src/modules/schedules/dto/`, `apps/backend/src/modules/calendar/dto/`, `apps/backend/src/modules/sanctions/dto/`, `apps/backend/src/modules/attendance/dto/monthly-attendance-export-query.dto.ts` |
| Contrôles métier et exceptions | `apps/backend/src/modules/attendance/attendance.service.ts`, `apps/backend/src/modules/employees/employees.service.ts`, `apps/backend/src/modules/schedules/schedules.service.ts` |
| Sécurité du pointage | `apps/backend/src/modules/attendance/attendance-security.exception.ts`, `apps/backend/src/modules/attendance/attendance-security.service.ts` |
| Vérification automatisée | `package.json`, `scripts/validate-proxy.mjs`, `apps/backend/test/` |

---

Document ID : SG-007  
Titre : Validation des entrées et protection applicative  
Version : 1.0  
Statut : Validé  
Classification : Interne  
Référence : Security Guide  
Projet : Konatech Pointage
