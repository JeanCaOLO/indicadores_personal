/*
 * Vista "Usuarios y roles" (CRUD). Código movido tal cual desde out/index.html; las operaciones de datos
 * llegan del controller (useUsuariosController) con la misma interfaz que tenía OLOAuth.
 */
import { toast } from '../../../shared/ui/toast';

/** Política del User Pool de Cognito: 12+ caracteres con mayúscula, minúscula, número y símbolo. */
function strongPassword(p) {
  return (
    p.length >= 12 &&
    /[a-z]/.test(p) &&
    /[A-Z]/.test(p) &&
    /[0-9]/.test(p) &&
    /[^A-Za-z0-9]/.test(p)
  );
}

export function createUsuariosView(OLOAuth) {
  /* ============================================================
   * Vista · Gestión de usuarios y roles (CRUD)
   * ============================================================ */
  async function renderUsuarios() {
    const root = document.getElementById('v-usuarios');
    if (!root) return;
    const s = OLOAuth.current();
    if (!s || !(s.rol.scope === 'admin' || s.rol.scope === 'global')) {
      root.innerHTML = `<div class="banner">No tenés permisos para gestionar usuarios.</div>`;
      return;
    }
    root.innerHTML = `<div class="banner">Cargando usuarios y roles…</div>`;
    let roles = [],
      users = [];
    try {
      [roles, users] = await Promise.all([OLOAuth.listRoles(), OLOAuth.listUsers()]);
    } catch (e) {
      root.innerHTML = `<div class="banner">Error al cargar: ${e.message || e}</div>`;
      return;
    }
    const rolOpts = roles.map((r) => `<option value="${r.id}">${r.nombre}</option>`).join('');
    const scopeName = (sc) =>
      sc === 'global' ? 'Global (toda la data)' : sc === 'admin' ? 'Admin (solo usuarios)' : 'País';
    root.innerHTML = `
  <div class="adm-head"><h2>Usuarios y roles</h2></div>
  <div class="banner">Los usuarios de un país solo ven la data de ese país. Global ve todo. Admin no ve data, solo gestiona usuarios.</div>
  <div class="usr-wrap">
    <div class="card adm-card">
      <div class="ch"><h3>➕ Registrar usuario</h3></div>
      <div class="cb" style="padding:16px 20px">
        <form id="uForm" class="usr-form">
          <div><label class="fld">Nombre</label><input type="text" id="uNombre" placeholder="Nombre completo"></div>
          <div><label class="fld">Correo</label><input type="text" id="uEmail" placeholder="correo@olo.com"></div>
          <div><label class="fld">Contraseña</label><input type="password" id="uPass" placeholder="mínimo 12 caracteres"></div>
          <div><label class="fld">Rol</label><select id="uRol">${rolOpts}</select></div>
          <div style="grid-column:1/-1"><button type="submit" class="mini save">Crear usuario</button></div>
        </form>
      </div>
    </div>

    <div class="card adm-card">
      <div class="ch"><h3>Usuarios registrados</h3><span class="hint">${users.length} usuario(s)</span></div>
      <div class="cb"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Activo</th><th></th></tr></thead>
      <tbody id="uBody">${
        users
          .map((u) => {
            const rn = (roles.find((r) => r.id === u.rol_id) || {}).nombre || u.rol_id;
            return `<tr data-id="${u.id}">
          <td>${u.nombre || '—'}</td><td>${u.email}</td>
          <td><select class="uRolEdit" style="padding:6px 8px">${roles.map((r) => `<option value="${r.id}" ${r.id === u.rol_id ? 'selected' : ''}>${r.nombre}</option>`).join('')}</select></td>
          <td class="num"><input type="checkbox" class="uActEdit" ${u.activo ? 'checked' : ''}></td>
          <td style="text-align:right"><button class="mini uSaveBtn">Guardar</button> <button class="row-del uDelBtn" title="Eliminar">✕</button></td>
        </tr>`;
          })
          .join('') || `<tr><td colspan="5" class="empty">Sin usuarios aún</td></tr>`
      }</tbody></table></div>
    </div>

    <div class="card adm-card">
      <div class="ch"><h3>🏷️ Roles</h3><span class="hint">Agregá roles por país o accesos especiales</span></div>
      <div class="cb" style="padding:16px 20px">
        <form id="rForm" class="usr-form">
          <div><label class="fld">Nombre del rol</label><input type="text" id="rNombre" placeholder="Ej: Colombia"></div>
          <div><label class="fld">Alcance</label><select id="rScope"><option value="pais">País (ve solo su país)</option><option value="global">Global (ve todo)</option><option value="admin">Admin (solo usuarios)</option></select></div>
          <div id="rPaisWrap"><label class="fld">País</label><input type="text" id="rPais" placeholder="Ej: Colombia"></div>
          <div style="grid-column:1/-1"><button type="submit" class="mini save">Agregar rol</button></div>
        </form>
        <div class="dc-tbl" style="margin-top:14px"><table><thead><tr><th>Rol</th><th>Alcance</th><th>País</th><th></th></tr></thead>
        <tbody id="rBody">${roles
          .map(
            (r) => `<tr data-id="${r.id}">
          <td>${r.nombre}</td><td>${scopeName(r.scope)}</td><td>${r.pais || '—'}</td>
          <td style="text-align:right">${['global', 'admin', 'costa_rica', 'venezuela'].includes(r.id) ? '<span class="hint">base</span>' : `<button class="row-del rDelBtn" title="Eliminar">✕</button>`}</td>
        </tr>`,
          )
          .join('')}</tbody></table></div>
      </div>
    </div>
  </div>`;

    // Crear usuario
    root.querySelector('#uForm').onsubmit = async (e) => {
      e.preventDefault();
      const nombre = root.querySelector('#uNombre').value.trim();
      const email = root.querySelector('#uEmail').value.trim();
      const pass = root.querySelector('#uPass').value;
      const rol_id = root.querySelector('#uRol').value;
      if (!email || !strongPassword(pass)) {
        toast('Correo y contraseña (12+ con mayúscula, minúscula, número y símbolo) requeridos');
        return;
      }
      try {
        await OLOAuth.createUser({ email, nombre, rol_id, password: pass });
        toast('✓ Usuario creado');
        renderUsuarios();
      } catch (err) {
        toast(
          /duplicate|unique/i.test(err.message || '')
            ? 'Ese correo ya existe'
            : 'Error: ' + (err.message || err),
        );
      }
    };
    // Editar/eliminar usuario
    root.querySelectorAll('#uBody tr[data-id]').forEach((tr) => {
      const id = tr.getAttribute('data-id');
      const sb = tr.querySelector('.uSaveBtn'),
        db = tr.querySelector('.uDelBtn');
      if (sb)
        sb.onclick = async () => {
          try {
            await OLOAuth.updateUser(id, {
              rol_id: tr.querySelector('.uRolEdit').value,
              activo: tr.querySelector('.uActEdit').checked,
            });
            toast('✓ Guardado');
          } catch (err) {
            toast('Error al guardar');
          }
        };
      if (db)
        db.onclick = async () => {
          if (!confirm('¿Eliminar este usuario?')) return;
          try {
            await OLOAuth.deleteUser(id);
            toast('Usuario eliminado');
            renderUsuarios();
          } catch (err) {
            toast('Error al eliminar');
          }
        };
    });
    // Rol: mostrar/ocultar país
    const rScope = root.querySelector('#rScope'),
      rPaisWrap = root.querySelector('#rPaisWrap');
    const syncPais = () => {
      rPaisWrap.style.display = rScope.value === 'pais' ? '' : 'none';
    };
    rScope.onchange = syncPais;
    syncPais();
    // Crear rol
    root.querySelector('#rForm').onsubmit = async (e) => {
      e.preventDefault();
      const nombre = root.querySelector('#rNombre').value.trim();
      const scope = rScope.value;
      const pais = scope === 'pais' ? root.querySelector('#rPais').value.trim() : null;
      if (!nombre) {
        toast('Nombre del rol requerido');
        return;
      }
      if (scope === 'pais' && !pais) {
        toast('Indicá el país');
        return;
      }
      const idSlug = nombre
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '');
      try {
        await OLOAuth.saveRole({ id: idSlug, nombre, scope, pais });
        toast('✓ Rol agregado');
        renderUsuarios();
      } catch (err) {
        toast('Error: ' + (err.message || err));
      }
    };
    // Eliminar rol
    root.querySelectorAll('#rBody .rDelBtn').forEach((b) => {
      b.onclick = async () => {
        const id = b.closest('tr').getAttribute('data-id');
        if (!confirm('¿Eliminar este rol? Los usuarios con este rol quedarán sin acceso válido.'))
          return;
        try {
          await OLOAuth.deleteRole(id);
          toast('Rol eliminado');
          renderUsuarios();
        } catch (err) {
          toast('No se pudo eliminar (¿hay usuarios usándolo?)');
        }
      };
    });
  }
  return renderUsuarios;
}
