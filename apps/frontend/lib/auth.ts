import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUserFromApi } from './api';
import { SESSION_COOKIE_NAME } from './auth-session';

export async function getSessionToken() {
  return (await cookies()).get(SESSION_COOKIE_NAME)?.value ?? null;
}

export async function getCurrentUser() {
  const token = await getSessionToken();

  if (!token) {
    return null;
  }

  try {
    return await getCurrentUserFromApi(token);
  } catch {
    return null;
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return user;
}
