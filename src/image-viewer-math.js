/* image-viewer-math.js — phép tính thuần cho lightbox ảnh Reader.
   Không chạm DOM để test được bằng Node: fit 100%, scale clamp, pan clamp và
   zoom giữ nguyên điểm ảnh dưới con trỏ. */

export const MIN_SCALE = 0.1;
export const MAX_SCALE = 8;

function positive(n, fallback = 1) {
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function clampScale(scale, min = MIN_SCALE, max = MAX_SCALE) {
  const lo = positive(min, MIN_SCALE);
  const hi = Math.max(lo, positive(max, MAX_SCALE));
  return Math.min(hi, Math.max(lo, positive(scale, 1)));
}

export function fitScale(naturalWidth, naturalHeight, viewportWidth, viewportHeight) {
  const nw = positive(naturalWidth), nh = positive(naturalHeight);
  const vw = positive(viewportWidth), vh = positive(viewportHeight);
  return Math.min(1, vw / nw, vh / nh);
}

export function clampPan(panX, panY, naturalWidth, naturalHeight, scale,
                         viewportWidth, viewportHeight) {
  const s = clampScale(scale);
  const overflowX = Math.max(0, (positive(naturalWidth) * s - positive(viewportWidth)) / 2);
  const overflowY = Math.max(0, (positive(naturalHeight) * s - positive(viewportHeight)) / 2);
  return {
    x: Math.min(overflowX, Math.max(-overflowX, Number.isFinite(panX) ? panX : 0)),
    y: Math.min(overflowY, Math.max(-overflowY, Number.isFinite(panY) ? panY : 0)),
  };
}

export function zoomAround(state, targetScale, pointerX, pointerY,
                           naturalWidth, naturalHeight, viewportWidth, viewportHeight) {
  const oldScale = clampScale(state && state.scale);
  const scale = clampScale(targetScale);
  const cx = positive(viewportWidth) / 2;
  const cy = positive(viewportHeight) / 2;
  const px = (Number.isFinite(pointerX) ? pointerX : cx) - cx;
  const py = (Number.isFinite(pointerY) ? pointerY : cy) - cy;
  const oldX = Number.isFinite(state && state.panX) ? state.panX : 0;
  const oldY = Number.isFinite(state && state.panY) ? state.panY : 0;
  const ratio = scale / oldScale;
  const pan = clampPan(
    px - (px - oldX) * ratio,
    py - (py - oldY) * ratio,
    naturalWidth, naturalHeight, scale, viewportWidth, viewportHeight,
  );
  return { scale, panX: pan.x, panY: pan.y };
}
