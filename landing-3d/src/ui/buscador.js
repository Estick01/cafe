/*
 * Buscador de lotes de la navegacion: filtra MARCA.lotes por nombre, variedad, proceso, origen y
 * notas; al elegir uno lo selecciona en la tienda y lleva hasta ella. Escape o clic fuera lo cierran.
 */
import { MARCA, resumenLote } from '../marca.js';
import { crear, navegarA } from './util.js';

const normalizar = (texto) => String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function textoBuscable(lote) {
  return normalizar([lote.nombre, lote.variedad, lote.proceso, lote.origen, lote.tueste, ...(lote.notas ?? [])]
    .filter(Boolean).join(' '));
}

export function filtrarLotes(consulta, lotes = MARCA.lotes) {
  const terminos = normalizar(consulta).split(/\s+/).filter(Boolean);
  return lotes
    .map((lote, indice) => ({ lote, indice, texto: textoBuscable(lote) }))
    .filter(({ texto }) => terminos.every((termino) => texto.includes(termino)));
}

export function initBuscador({ boton, formulario, tienda }) {
  if (!boton || !formulario || boton.dataset.listo) return;
  boton.dataset.listo = '1';
  const campo = formulario.querySelector('input');
  const lista = formulario.querySelector('ul');
  const estado = formulario.querySelector('[role="status"]');
  const abierto = () => boton.getAttribute('aria-expanded') === 'true';

  function pintar() {
    const resultados = filtrarLotes(campo.value);
    lista.replaceChildren(...resultados.map(({ lote, indice }) => {
      const item = crear('li');
      const opcion = crear('button', 'buscador-opcion');
      opcion.type = 'button';
      opcion.dataset.indice = String(indice);
      opcion.style.setProperty('--color-lote', lote.etiqueta);
      opcion.append(crear('span', 'buscador-opcion-nombre', lote.nombre), crear('span', 'buscador-opcion-detalle', resumenLote(lote)));
      item.appendChild(opcion);
      return item;
    }));
    const n = resultados.length;
    estado.textContent = n === 0 ? 'Ningún lote coincide. Prueba con otra palabra.' : `${n} ${n === 1 ? 'lote' : 'lotes'}`;
  }

  function abrir(abrirlo) {
    boton.setAttribute('aria-expanded', String(abrirlo));
    formulario.hidden = !abrirlo;
    if (abrirlo) {
      pintar();
      campo.focus();
    }
  }

  function elegir(indice) {
    abrir(false);
    tienda?.seleccionar(indice);
    navegarA('#tienda');
    document.querySelectorAll('#tienda [role="tab"]')[indice]?.focus({ preventScroll: true });
  }

  boton.addEventListener('click', () => abrir(!abierto()));
  campo.addEventListener('input', pintar);
  formulario.addEventListener('submit', (evento) => {
    evento.preventDefault();
    const [primero] = filtrarLotes(campo.value);
    if (primero) elegir(primero.indice);
  });
  lista.addEventListener('click', (evento) => {
    const opcion = evento.target.closest('[data-indice]');
    if (opcion) elegir(Number(opcion.dataset.indice));
  });
  document.addEventListener('keydown', (evento) => {
    if (evento.key !== 'Escape' || !abierto()) return;
    abrir(false);
    boton.focus();
  });
  document.addEventListener('click', (evento) => {
    if (abierto() && !evento.target.closest('#buscador, #buscar-boton')) abrir(false);
  });
}
