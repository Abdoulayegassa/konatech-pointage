import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import bodyParser from 'body-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AttendanceSecurityPolicyService } from './modules/attendance/attendance-security-policy.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: false,
  });
  const configService = app.get(ConfigService);
  const jsonBodyLimit = configService.getOrThrow<string>('JSON_BODY_LIMIT');
  const trustProxyHops = configService.getOrThrow<number>('TRUST_PROXY_HOPS');

  if (trustProxyHops > 0) {
    const expressInstance = app.getHttpAdapter().getInstance() as {
      set?: (setting: string, value: unknown) => void;
    };

    expressInstance.set?.('trust proxy', trustProxyHops);
  }

  app.use(helmet());
  app.use(bodyParser.json({ limit: jsonBodyLimit }));
  app.use(bodyParser.urlencoded({ extended: true, limit: jsonBodyLimit }));

  app.setGlobalPrefix('api/v1');
  app.enableCors({
    origin: configService.getOrThrow<string>('FRONTEND_URL'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  const port = configService.getOrThrow<number>('PORT');
  await app.listen(port);

  if (configService.get<string>('NODE_ENV') !== 'production') {
    const securityPolicyService = app.get(AttendanceSecurityPolicyService);
    const securityPolicy = securityPolicyService.getPolicy();
    const cloudinaryConfigured = [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET',
    ].every((key) => {
      const value = configService.get<string>(key);

      return typeof value === 'string' && value.trim().length > 0;
    });

    Logger.log(
      `Attendance security ${
        securityPolicy.enabled ? 'enabled' : 'disabled'
      } (locationConfigured=${securityPolicy.locationConfigured}, allowedRadiusMeters=${
        securityPolicy.allowedRadiusMeters ?? 'n/a'
      }, cloudinary=${cloudinaryConfigured ? 'configured' : 'disabled'})`,
      'Bootstrap',
    );
  }

  Logger.log(
    `Konatech backend is running on port ${port} with API prefix /api/v1`,
    'Bootstrap',
  );
}

void bootstrap();
