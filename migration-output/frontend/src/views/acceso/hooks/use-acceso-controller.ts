import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { ApiError } from '../../../shared/api/api-error';
import type { AppSession } from '../../../shared/auth/app-session';
import { accesoApi } from '../api/acceso-api';

export type AccesoStatus = 'loading' | 'signed-out' | 'signed-in';
export type LoginStep = 'credentials' | 'new-password';

const LOGIN_ERROR = 'Usuario o contraseña incorrectos';
const BAD_CREDENTIALS = new Set(['NotAuthorizedException', 'UserNotFoundException']);

function signInMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (BAD_CREDENTIALS.has(name)) return LOGIN_ERROR;
  if (name === 'InvalidPasswordException') {
    return 'La contraseña debe tener 12+ caracteres con mayúscula, minúscula, número y símbolo.';
  }
  return 'No se pudo iniciar sesión';
}

/** Sesión (Cognito + GET /me) y formulario de la pantalla de acceso. */
export function useAccesoController() {
  const [status, setStatus] = useState<AccesoStatus>('loading');
  const [session, setSession] = useState<AppSession | null>(null);
  const [step, setStep] = useState<LoginStep>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'err' | 'ok'; text: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadSession = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      if (!(await accesoApi.hasSession())) {
        setStatus('signed-out');
        return;
      }
      setSession(await accesoApi.me({ signal: controller.signal }));
      setStatus('signed-in');
    } catch (error) {
      const apiError = error as ApiError;
      if (apiError.isCanceled) return;
      await accesoApi.signOut().catch(() => undefined);
      setSession(null);
      setStatus('signed-out');
      setMessage({ kind: 'err', text: apiError.status === 403 ? apiError.message : LOGIN_ERROR });
    }
  }, []);

  useEffect(() => {
    loadSession();
    // Sesión cerrada o vencida (p. ej. 401 del API): volver a la pantalla de acceso.
    const unsubscribe = accesoApi.onSignedOut(() => {
      setSession(null);
      setStep('credentials');
      setStatus('signed-out');
    });
    return () => {
      unsubscribe();
      abortRef.current?.abort();
    };
  }, [loadSession]);

  const finish = async (result: { isSignedIn: boolean; nextStep: string }) => {
    if (result.isSignedIn) {
      await loadSession();
    } else if (result.nextStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
      setStep('new-password');
    } else {
      setMessage({ kind: 'err', text: 'No se pudo iniciar sesión' });
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage(null);
    if (step === 'credentials' && (!email.trim() || !password)) {
      setMessage({ kind: 'err', text: 'Completá correo y contraseña.' });
      return;
    }
    setSubmitting(true);
    try {
      await finish(
        step === 'credentials'
          ? await accesoApi.signIn(email.trim().toLowerCase(), password)
          : await accesoApi.setNewPassword(newPassword),
      );
    } catch (error) {
      if ((error as { name?: string }).name === 'UserAlreadyAuthenticatedException') {
        await loadSession();
      } else {
        setMessage({ kind: 'err', text: signInMessage(error) });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const logout = useCallback(async () => {
    await accesoApi.signOut();
  }, []);

  return {
    status,
    session,
    step,
    email,
    setEmail,
    password,
    setPassword,
    newPassword,
    setNewPassword,
    message,
    submitting,
    submit,
    logout,
  };
}

export type AccesoController = ReturnType<typeof useAccesoController>;
