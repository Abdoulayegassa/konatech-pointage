import { ConfigService } from '@nestjs/config';

type ExpressLikeApplication = {
  set?: (setting: string, value: unknown) => void;
};

export type ClientIpRequest = {
  ip?: string;
  socket?: { remoteAddress?: string };
};

export function configureTrustedProxy(
  expressApplication: ExpressLikeApplication,
  config: ConfigService,
) {
  const trustedCidrs = parseTrustedProxyCidrs(
    config.get<string>('TRUST_PROXY_CIDRS'),
  );

  if (trustedCidrs.length > 0) {
    expressApplication.set?.('trust proxy', trustedCidrs);
    return;
  }

  const hops = config.get<number>('TRUST_PROXY_HOPS') ?? 0;
  if (hops > 0) {
    expressApplication.set?.('trust proxy', hops);
  }
}

export function parseTrustedProxyCidrs(value?: string) {
  return (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getClientIp(request: ClientIpRequest) {
  return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
}
