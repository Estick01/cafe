import * as THREE from 'three';
import { resumenLote } from '../../marca.js';
import { crearLienzoEtiqueta, dibujarEtiqueta } from './etiqueta.js';

export function crearTexturaBolsa(lote, marca, ancho = 2048) {
    const art = crearLienzoEtiqueta(ancho);
    dibujarEtiqueta(art, { lote: { ...lote, color: marca.bolsa.color }, marca, resumen: resumenLote(lote) });
    // El arte original tiene frente/espalda a mitades; la geometría reserva franjas laterales.
    const atlas = document.createElement('canvas');
    atlas.width = art.width; atlas.height = art.height;
    const ctx = atlas.getContext('2d');
    ctx.fillStyle = marca.bolsa.color; ctx.fillRect(0, 0, atlas.width, atlas.height);
    ctx.drawImage(art, 0, 0, art.width / 2, art.height, 0, 0, atlas.width / 2, atlas.height);
    ctx.drawImage(art, art.width / 2, 0, art.width / 2, art.height, atlas.width * 0.6, 0, atlas.width * 0.3, atlas.height);
    const map = new THREE.CanvasTexture(atlas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.anisotropy = 4;
    return map;
}
