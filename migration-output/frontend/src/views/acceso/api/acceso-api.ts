import { axiosApiGateway } from '../../../shared/api/axios-api-gateway';
import type { AppSession } from '../../../shared/auth/app-session';
import {
  completeNewPassword,
  getIdToken,
  onAuthStateChange,
  signInWithEmail,
  signOutUser,
  type SignInResult,
} from '../../../shared/auth/cognito-auth';

interface RequestOptions {
  signal?: AbortSignal;
}

export const accesoApi = {
  /** Perfil y rol del usuario autenticado (antes OLOAuth.login leía usuario y rol). */
  me: (options: RequestOptions = {}): Promise<AppSession> =>
    axiosApiGateway.get<AppSession>('/me', { signal: options.signal }).then((r) => r.data),
  hasSession: async (): Promise<boolean> => (await getIdToken()) !== null,
  signIn: (email: string, password: string): Promise<SignInResult> =>
    signInWithEmail(email, password),
  setNewPassword: (password: string): Promise<SignInResult> => completeNewPassword(password),
  signOut: (): Promise<void> => signOutUser(),
  onSignedOut: (callback: () => void): (() => void) =>
    onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT' || event === 'SESSION_EXPIRED') callback();
    }),
};
