import { CSRF_HEADER } from './security/csrf';

type CsrfResponse = {
  success: boolean;
  data?: { token?: string };
  error?: string;
};

export async function getCsrfHeaders(): Promise<Record<string, string>> {
  const response = await fetch('/api/auth/csrf', {
    method: 'GET',
    credentials: 'same-origin',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as CsrfResponse;
    throw new Error(body.error ?? 'Could not prepare secure request.');
  }

  const body = await response.json() as CsrfResponse;
  const token = body.data?.token;
  if (!token) {
    throw new Error('Secure request token missing.');
  }

  return { [CSRF_HEADER]: token };
}
