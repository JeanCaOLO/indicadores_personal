import oloLogo from '../../../assets/olo-logo.jpg';

/** Cabecera del original: marca, selector de acceso y acciones (el motor conecta los botones por id). */
export function AppHeader() {
  return (
    <header className="app">
      <div className="app-inner">
        <div className="logo">
          <span className="mark">
            <img src={oloLogo} alt="OLO" />
          </span>
          <span className="divider"></span>
          <span className="txt">
            <small>Gestión Integral de Talento</small>
            <b>Indicadores</b>
          </span>
        </div>
        <div className="hactions">
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 6 }}>
            <label htmlFor="accSel" style={{ fontSize: 12, color: 'var(--muted)' }}>
              Acceso
            </label>
            <select
              id="accSel"
              style={{
                padding: '8px 12px',
                border: '1px solid #d0d0d0',
                background: '#fff',
                color: '#111',
                borderRadius: 'var(--r-s)',
                fontWeight: 600,
                fontSize: 13,
                fontFamily: 'inherit',
                cursor: 'pointer',
              }}
            ></select>
          </span>
          <button
            className="hbtn"
            id="xlsMesBtn"
            title="Descargar los indicadores del mes en Excel"
          >
            ⬇ Excel mes
          </button>
          <button
            className="hbtn"
            id="xlsAnioBtn"
            title="Descargar los indicadores del año (12 meses) en Excel"
          >
            ⬇ Excel año
          </button>
          <button className="hbtn" id="printBtn">
            ⬇ PDF
          </button>
          <button className="hbtn" id="presBtn">
            Vista Corporativa
          </button>
          <button className="hbtn" id="syncBtn" title="Sincronizar datos con la nube">
            ☁ Sincronizar
          </button>
          <button
            className="hbtn"
            id="usersBtn"
            title="Gestión de usuarios y roles"
            style={{ display: 'none' }}
          >
            👥 Usuarios
          </button>
          <button className="hbtn solid" id="admBtn">
            Administrar datos
          </button>
          <span id="userChip" className="userchip" style={{ display: 'none' }}></span>
          <button className="hbtn" id="logoutBtn" title="Cerrar sesión" style={{ display: 'none' }}>
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
