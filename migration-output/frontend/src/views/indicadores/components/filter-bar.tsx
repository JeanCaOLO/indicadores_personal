/** Barra de filtros fija + navegación por pilares (el motor llena los selects y las pastillas). */
export function FilterBar() {
  return (
    <div className="stickytop">
      <div className="filters" id="filterBar">
        <div className="filters-inner">
          <div className="fgroup primary">
            <label>País</label>
            <select id="fPais"></select>
          </div>
          <div className="fgroup primary">
            <label>Mes</label>
            <select id="fMonth"></select>
          </div>
          <div className="fgroup">
            <label>Año</label>
            <select id="fYear"></select>
          </div>
          <div className="fgroup">
            <label>Vista</label>
            <select id="fView"></select>
          </div>
          <div className="fgroup" id="gYear2" style={{ display: 'none' }}>
            <label>Comparar con</label>
            <select id="fYear2"></select>
          </div>
          <div className="fgroup">
            <label>Área responsable</label>
            <select id="fArea"></select>
          </div>
          <div className="fspacer" id="fInfo"></div>
        </div>
      </div>
      <div className="pillnav" id="pillarNav"></div>
    </div>
  );
}
