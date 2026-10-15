/** Aviso flotante del original (`#toast`): muestra el texto 1,8 s. Lo usan el tablero y la vista Usuarios. */
export function toast(message: string): void {
  const element = document.getElementById('toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  setTimeout(() => element.classList.remove('show'), 1800);
}
