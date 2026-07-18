/* sprites.js — texture + sprite helpers (thuần, không đụng state ngoài cache riêng) */
import * as THREE from 'three';

export function memoCanvasTexture(cache, key, w, h, draw) {
  // Boilerplate chung của glow/ring/streak: cache theo màu → canvas → CanvasTexture
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), c);
  const tex = new THREE.CanvasTexture(c);
  cache.set(key, tex); return tex;
}
export function glowSprite(tex, opts) {
  // Sprite additive dùng chung cho mọi hiệu ứng (glow node/comet/spark/warp/burst/swirl)
  return new THREE.Sprite(new THREE.SpriteMaterial(Object.assign(
    { map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }, opts || {})));
}
const glowTexCache = new Map();
export function glowTexture(color) {
  return memoCanvasTexture(glowTexCache, color, 256, 256, ctx => {
    const g = ctx.createRadialGradient(128, 128, 4, 128, 128, 128);
    g.addColorStop(0, color + 'cc'); g.addColorStop(0.3, color + '55');
    g.addColorStop(0.65, color + '11'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  });
}
export function textSprite(text, color, big) {
  const fs = 44, pad = 20, c = document.createElement('canvas');
  const m = c.getContext('2d'); m.font = `600 ${fs}px "Segoe UI", sans-serif`;
  const w = Math.ceil(m.measureText(text).width) + pad * 2;
  c.width = w; c.height = fs + pad * 1.4;
  const ctx = c.getContext('2d');
  ctx.font = `600 ${fs}px "Segoe UI", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.shadowColor = color; ctx.shadowBlur = 7;
  ctx.fillStyle = '#d9d2ee'; ctx.fillText(text, w / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  const h = big ? 5.6 : 4.2;
  sp.scale.set(h * w / c.height, h, 1);
  return sp;
}
const ringTexCache = new Map();
export function ringTexture(color) {
  return memoCanvasTexture(ringTexCache, color, 256, 256, ctx => {
    ctx.strokeStyle = color; ctx.lineWidth = 14;
    ctx.shadowColor = color; ctx.shadowBlur = 30;
    ctx.beginPath(); ctx.arc(128, 128, 94, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(128, 128, 94, 0, Math.PI * 2); ctx.stroke();
  });
}
/* ---------- tia sao xuyên không (star streak) ----------
   Star Wars lightspeed: tia sáng bị kéo dài thành vệt theo hướng bay, loé lên rồi tắt nhanh. */
const streakTexCache = new Map();
export function streakTexture(color) {
  return memoCanvasTexture(streakTexCache, color, 256, 32, ctx => {
    const g = ctx.createLinearGradient(0, 0, 256, 0);       // sáng ở giữa, tắt dần 2 đầu — vệt sáng
    g.addColorStop(0.0, 'rgba(0,0,0,0)'); g.addColorStop(0.42, color + '88');
    g.addColorStop(0.5, '#ffffff');       g.addColorStop(0.58, color + '88');
    g.addColorStop(1.0, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 32);
    const vg = ctx.createLinearGradient(0, 0, 0, 32);       // bóp dọc cho thành vệt mảnh
    vg.addColorStop(0, 'rgba(0,0,0,1)'); vg.addColorStop(0.5, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = vg; ctx.fillRect(0, 0, 256, 32);
  });
}
