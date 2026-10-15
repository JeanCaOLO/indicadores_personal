import { setAccessTokenProvider, setUnauthorizedHandler } from '../api/axios-api-gateway';
import { configureAuth, getIdToken, signOutUser } from './cognito-auth';

/** Configura Cognito y conecta el token al cliente HTTP. Se llama una vez en el entrypoint. */
export function setupAuth(options?: Parameters<typeof configureAuth>[0]): void {
  configureAuth(options);
  setAccessTokenProvider(getIdToken);
  setUnauthorizedHandler(() => signOutUser());
}
