/** Configuración pública por ambiente (Vite: prefijo VITE_). Nunca secretos aquí. */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Falta la variable de entorno ${name}. Revise .env.example.`);
  }
  return value;
}

export const env = {
  apiBaseUrl: required('VITE_API_BASE_URL', import.meta.env.VITE_API_BASE_URL),
  cognitoUserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID ?? '',
  cognitoClientId: import.meta.env.VITE_COGNITO_CLIENT_ID ?? '',
  cognitoDomain: import.meta.env.VITE_COGNITO_DOMAIN ?? '',
  appExposure: (import.meta.env.VITE_APP_EXPOSURE ?? 'internal') as 'internal' | 'public',
  realtimeEnabled: import.meta.env.VITE_REALTIME_ENABLED === 'true',
} as const;
