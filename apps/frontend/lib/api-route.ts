import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getApiBaseUrl } from './api';
import {
  ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  type SessionCookieMode,
  resolveSessionToken,
} from './auth-session';

function getErrorMessage(payload: unknown, fallbackMessage: string) {
  if (payload && typeof payload === 'object') {
    const message = 'message' in payload ? payload.message : undefined;

    if (Array.isArray(message)) {
      return message.join(', ');
    }

    if (typeof message === 'string') {
      return message;
    }
  }

  return fallbackMessage;
}

function getErrorMetadata(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !('security' in payload)) {
    return {};
  }

  const security = payload.security;

  if (!security || typeof security !== 'object') {
    return {};
  }

  return {
    security,
  };
}

async function parseErrorResponse(response: Response, fallbackMessage: string) {
  const rawPayload = await response.text().catch(() => '');

  if (!rawPayload) {
    return fallbackMessage;
  }

  try {
    return getErrorMessage(JSON.parse(rawPayload), fallbackMessage);
  } catch {
    return rawPayload || fallbackMessage;
  }
}

type AuthorizedRequestOptions = {
  sessionMode?: SessionCookieMode;
};

async function getAuthorizedHeaders(
  init: RequestInit,
  options: AuthorizedRequestOptions = {},
) {
  const cookieStore = await cookies();
  const token = resolveSessionToken(
    {
      sessionToken: cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null,
      attendanceEntrySessionToken:
        cookieStore.get(ATTENDANCE_ENTRY_SESSION_COOKIE_NAME)?.value ?? null,
    },
    options.sessionMode,
  );

  if (!token) {
    return null;
  }

  const headers = new Headers(init.headers);

  headers.set('Authorization', `Bearer ${token}`);

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return headers;
}

export async function proxyApiRequest(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: AuthorizedRequestOptions = {},
) {
  const headers = await getAuthorizedHeaders(init, options);

  if (!headers) {
    return NextResponse.json(
      {
        error: 'Session expiree.',
      },
      {
        status: 401,
      },
    );
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (
      response.status === 401 &&
      options.sessionMode === 'attendance-entry'
    ) {
      clearSessionCookie(
        await cookies(),
        ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
      );
    }

    return NextResponse.json(
      {
        error: getErrorMessage(data, fallbackMessage),
        ...getErrorMetadata(data),
      },
      {
        status: response.status,
      },
    );
  }

  return NextResponse.json(data, {
    status: response.status,
  });
}

export type IdRouteContext = {
  params: Promise<{
    id: string;
  }>;
};

type JsonProxyMethod = 'POST' | 'PATCH' | 'PUT';

export async function proxyApiJsonBodyRequest(
  request: Request,
  path: string,
  method: JsonProxyMethod,
  fallbackMessage: string,
  options: AuthorizedRequestOptions = {},
) {
  const payload = await request.json().catch(() => ({}));

  return proxyApiRequest(
    path,
    {
      method,
      body: JSON.stringify(payload),
    },
    fallbackMessage,
    options,
  );
}

export async function proxyApiIdRequest(
  context: IdRouteContext,
  buildPath: (id: string) => string,
  fallbackMessage: string,
) {
  const { id } = await context.params;

  return proxyApiRequest(
    buildPath(id),
    {
      method: 'GET',
    },
    fallbackMessage,
  );
}

export async function proxyApiIdJsonBodyRequest(
  request: Request,
  context: IdRouteContext,
  buildPath: (id: string) => string,
  method: JsonProxyMethod,
  fallbackMessage: string,
) {
  const { id } = await context.params;

  return proxyApiJsonBodyRequest(
    request,
    buildPath(id),
    method,
    fallbackMessage,
  );
}

export async function proxyApiFileRequest(
  path: string,
  init: RequestInit,
  fallbackMessage: string,
  options: AuthorizedRequestOptions = {},
) {
  const headers = await getAuthorizedHeaders(init, options);

  if (!headers) {
    return NextResponse.json(
      {
        error: 'Session expiree.',
      },
      {
        status: 401,
      },
    );
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    cache: 'no-store',
    headers,
  });

  if (!response.ok) {
    if (
      response.status === 401 &&
      options.sessionMode === 'attendance-entry'
    ) {
      clearSessionCookie(
        await cookies(),
        ATTENDANCE_ENTRY_SESSION_COOKIE_NAME,
      );
    }

    return NextResponse.json(
      {
        error: await parseErrorResponse(response, fallbackMessage),
      },
      {
        status: response.status,
      },
    );
  }

  const payload = await response.arrayBuffer();
  const responseHeaders = new Headers();
  const contentType = response.headers.get('content-type');
  const contentDisposition = response.headers.get('content-disposition');

  if (contentType) {
    responseHeaders.set('Content-Type', contentType);
  }

  if (contentDisposition) {
    responseHeaders.set('Content-Disposition', contentDisposition);
  }

  responseHeaders.set('Cache-Control', 'no-store');

  return new NextResponse(payload, {
    status: response.status,
    headers: responseHeaders,
  });
}
