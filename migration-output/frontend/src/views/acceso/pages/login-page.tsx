import oloLogo from '../../../assets/olo-logo.jpg';
import type { AccesoController } from '../hooks/use-acceso-controller';

/** Pantalla de acceso del original (auth-scrim) + paso de contraseña nueva que pide Cognito. */
export function LoginPage({ controller }: { controller: AccesoController }) {
  const c = controller;
  const firstLogin = c.step === 'new-password';
  return (
    <div className="auth-scrim" id="authScrim" style={{ display: 'flex' }}>
      <div className="auth-card">
        <div className="auth-brand">
          <img id="authLogo" alt="OLO" src={oloLogo} />
          <span className="divider"></span>
          <span>
            <small>Gestión Integral de Talento</small>
            <b>Indicadores</b>
          </span>
        </div>
        <h1 id="authTitle">{firstLogin ? 'Definí tu nueva contraseña' : 'Iniciar sesión'}</h1>
        <p className="sub" id="authSub">
          {firstLogin
            ? 'Es tu primer ingreso: elegí una contraseña de 12+ caracteres con mayúscula, minúscula, número y símbolo.'
            : 'Ingresá con tu correo y contraseña.'}
        </p>
        <form id="authForm" autoComplete="on" onSubmit={c.submit}>
          {firstLogin ? (
            <div className="auth-field">
              <label htmlFor="authNewPass">Nueva contraseña</label>
              <input
                type="password"
                id="authNewPass"
                placeholder="••••••••••••"
                autoComplete="new-password"
                value={c.newPassword}
                onChange={(e) => c.setNewPassword(e.target.value)}
              />
            </div>
          ) : (
            <>
              <div className="auth-field">
                <label htmlFor="authEmail">Correo</label>
                <input
                  type="text"
                  id="authEmail"
                  placeholder="correo@olo.com"
                  autoComplete="username"
                  value={c.email}
                  onChange={(e) => c.setEmail(e.target.value)}
                />
              </div>
              <div className="auth-field">
                <label htmlFor="authPass">Contraseña</label>
                <input
                  type="password"
                  id="authPass"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={c.password}
                  onChange={(e) => c.setPassword(e.target.value)}
                />
              </div>
            </>
          )}
          <button type="submit" className="auth-btn" id="authSubmit" disabled={c.submitting}>
            {c.submitting ? 'Entrando…' : firstLogin ? 'Guardar y entrar' : 'Entrar'}
          </button>
          <div className={`auth-msg${c.message ? ` ${c.message.kind}` : ''}`} id="authMsg">
            {c.message?.text ?? ''}
          </div>
        </form>
      </div>
    </div>
  );
}
