/* insight.js — 🩺 Sức khoẻ vault (/insight): "vault đang khoẻ không", đối trọng của
   📊 Dashboard ("agent đã làm gì hôm nay").

   Module này CHỈ trình bày — mọi định nghĩa chỉ số nằm ở .graph3d/insight.py (cùng
   hàm mà CLI --report dùng), đừng tính lại con số nào ở đây.
   KHÔNG poll nền: chỉ số ở thang ngày/tuần nên fetch lúc mở section, mở overlay và
   khi bấm ↻ — thêm một vòng poll 4s vào đây chỉ tốn CPU cho số không đổi. */
import { $, esc, byId, focusInto, restoreFocus } from './state.js';
import { tr, locale } from './i18n.js';
import { wsOpen } from './workspace.js';

let DB = null;

function workTip(x, ev) {
  const vars = {
    file: x.file || '—', target: x.target || '—', section: ev.section || '—',
    n: ev.rereads || ev.distinct || 0, chains: ev.chains || 0,
    count: ev.count || 0, min: ((ev.span || 0) / 60).toFixed(1),
    times: ev.occurrences || 1, margin: Number(ev.margin || 0).toFixed(3),
  };
  if (x.kind === 'connect_index') return tr('ins.wl.connect_index', vars);
  if (x.kind === 'review_index') return tr('ins.wl.review_index', vars);
  if (x.kind === 'open_unseen') return tr('ins.wl.open_unseen', vars);
  if (x.kind === 'reduce_reread') return tr('ins.wl.reduce_reread', vars);
  if (x.kind === 'shorten_chain') return tr('ins.wl.shorten_chain', vars);
  if (x.kind === 'review_scope') return tr('ins.wl.review_scope', vars);
  return tr('ins.wl.review_index', vars);
}

function fmtDay(ts) {
  if (!ts) return '—';
  return new Date(ts * 1000).toLocaleDateString(locale());
}

/* Một dòng note: tên note (stem) + số bên phải. Note không còn trong graph
   (đường dẫn cũ trong log/heat) thì KHÔNG click được — đánh dấu mờ thay vì im lặng. */
function row(file, right, tip, barPct, barCol) {
  const node = byId.get(file);
  const stem = node ? node.stem : (file || '').split('/').pop().replace(/\.md$/i, '');
  const dead = node ? '' : ' ins-dead';
  const bar = barPct == null ? '' :
    `<span class="hbar"><span style="width:${barPct}%;background:${barCol || 'var(--cyan)'}"></span></span>`;
  return `<div class="heatrow${dead}" data-file="${esc(file)}" title="${esc(tip || file)}">` +
    `<span class="hn">${esc(stem)}</span>${bar}<span class="hc">${esc(String(right))}</span></div>`;
}

function list(rows, empty) {
  return rows.length ? rows.join('') : `<div class="dash-empty">${esc(empty)}</div>`;
}

function histHtml(hist, oldest) {
  const mx = Math.max(1, ...Object.values(hist));
  const bars = Object.entries(hist).map(([label, n]) =>
    `<div class="ins-hrow"><span class="l">${esc(label)}</span>` +
    `<span class="b"><span style="width:${Math.round(100 * n / mx)}%"></span></span>` +
    `<span class="c">${n}</span></div>`).join('');
  return `<div class="ins-hist">${bars}</div>` +
    `<div class="ins-note">${tr('ins.hist.unit', { d: oldest.toFixed(1) })}</div>`;
}

function render() {
  const d = DB, p = d.params, c = d.coverage, w = d.window, wk = d.weak, da = d.data;
  const tax = d.taxonomy || {};
  const wl = d.worklist || { total: 0, counts: {}, items: [] };
  const b3 = tax.b3_scope_leakage || { evaluated: 0, total: 0, pct: 0, list: [] };
  const b4 = tax.b4_distance_relatedness || { spearman: null, pairs: 0, pair_population: 0, sampled: false };
  const rho = b4.spearman == null ? '—' : Number(b4.spearman).toFixed(3);
  $('ins-sum').innerHTML =
    tr('ins.sum', { n: c.notes, pct: c.pct, days: p.days, cold: p.cold_days,
      work: wl.total }) + ` · 🖥 ${esc(d.host || '')}`;

  const tiles = [
    [tr('ins.tile.week'), w.cur_notes + ' ' + tr('stats.notes'), ''],
    [tr('ins.tile.hits'), w.cur_events + (w.cur_events >= w.prev_events ? ' ▲' : ' ▼'), ''],
    [tr('ins.tile.never'), c.never, c.never ? 'warn' : ''],
    [tr('ins.tile.cold', { d: p.cold_days }), d.cold.total, d.cold.total ? 'warn' : ''],
    [tr('ins.tile.cooling'), d.cooling.total, ''],
    [tr('ins.tile.noindex'), wk.no_index.total, wk.no_index.total ? 'warn' : ''],
    [tr('ins.tile.work'), wl.total, wl.counts.P1 ? 'warn' : ''],
    [tr('ins.tile.taxleak'), b3.pct + '%', b3.total ? 'warn' : ''],
    [tr('ins.tile.taxrho'), 'ρ ' + rho, ''],
  ].map(([lab, val, cls]) =>
    `<div class="tile ${cls}"><b>${esc(String(val))}</b><span>${esc(lab)}</span></div>`).join('');

  const hotMax = Math.max(1, ...d.hot.map(h => h.n));
  const hot = d.hot.map(h => row(h.file, h.n,
    `${h.file}\n` + tr('ins.tip.hot', { n: h.n, prev: h.prev, delta: (h.delta > 0 ? '+' : '') + h.delta }),
    Math.round(100 * h.n / hotMax), (byId.get(h.file) || {}).color));

  const cooling = d.cooling.list.map(x => row(x.file, x.prev + ' → 0',
    `${x.file}\n` + tr('ins.tip.cooling', { prev: x.prev })));

  const cold = d.cold.list.map(x => row(x.file, x.days.toFixed(1) + 'd',
    `${x.file}\n` + tr('ins.tip.cold', { day: fmtDay(x.last), d: x.days.toFixed(1), n: x.total })));

  const never = d.never.list.map(x => row(x.file, x.degree + '🔗',
    `${x.file}\n` + tr('ins.tip.never', { n: x.degree })));
  const unread = d.unread.list.map(f => row(f, 'grep',
    `${f}\n` + tr('ins.tip.unread')));

  const small = wk.small.map(cl =>
    `<div class="ins-note">${tr('ins.cluster', { n: cl.size })}${cl.files.map(f =>
      esc((byId.get(f) || {}).stem || f)).join(' · ')}</div>`).join('');
  const areas = d.areas.map(a =>
    `<div class="ins-arow"><span class="n">${esc(a.area)}</span>` +
    `<span>${a.notes} ${tr('stats.notes')}</span><span>${a.touched} ${tr('ins.a.touched')}</span>` +
    `<span class="${a.never ? 'w' : ''}">${a.never} ${tr('ins.a.never')}</span>` +
    `<span>${a.cold} ${tr('ins.a.cold')}</span><span class="${a.orphans ? 'w' : ''}">${a.orphans} ${tr('ins.a.orphans')}</span></div>`).join('');

  const taxLeaks = (b3.list || []).map(x => {
    const target = byId.get(x.target);
    const targetStem = target ? target.stem : (x.target || '').split('/').pop().replace(/\.md$/i, '');
    return row(x.file, '→ ' + targetStem, tr('ins.tax.tip', {
      section: x.section, own: x.file, target: x.target,
      a: Number(x.own_similarity).toFixed(3), b: Number(x.other_similarity).toFixed(3),
      m: Number(x.margin).toFixed(3),
    }));
  });
  const work = (wl.items || []).map(x => {
    const ev = x.evidence || {};
    const tip = workTip(x, ev);
    return row(x.file, x.priority, `${x.id}\n${tip}`);
  });
  const taxonomy =
    `<div class="dash-h">${tr('ins.h.taxonomy')}</div>` +
    `<div class="ins-note">${tr('ins.tax.desc')}</div>` +
    `<div class="ins-note">${tr('ins.tax.b3', { n: b3.total, e: b3.evaluated, pct: b3.pct })}<br>` +
    tr('ins.tax.b4', { rho, pairs: b4.pairs, pop: b4.pair_population,
      sampled: b4.sampled ? tr('ins.tax.sampled') : '' }) + `</div>` +
    list(taxLeaks, tr('ins.e.taxleak'));

  $('ins-body').innerHTML =
    `<div id="ins-tiles">${tiles}</div>` +
    `<div class="dash-h">${tr('ins.h.worklist', { n: wl.total, p1: (wl.counts || {}).P1 || 0 })}</div>` +
    `<div class="ins-note">${tr('ins.wl.readonly')}</div>${list(work, tr('ins.e.worklist'))}` +
    `<div class="dash-h">${tr('ins.h.hot', { d: p.days })}</div>${list(hot, tr('ins.e.hot'))}` +
    `<div class="dash-h">${tr('ins.h.age')}</div>${histHtml(d.cold.hist, d.cold.oldest_age)}` +
    `<div class="dash-h">${tr('ins.h.cooling', { n: p.cooling_min })}</div>${list(cooling, tr('ins.e.cooling'))}` +
    `<div class="dash-h">${tr('ins.h.cold', { d: p.cold_days, n: d.cold.total })}</div>${list(cold, tr('ins.e.cold'))}` +
    `<div class="dash-h">${tr('ins.h.never', { n: d.never.total, u: d.unread.total })}</div>${list(never.concat(unread), tr('ins.e.never'))}` +
    `<div class="dash-h">${tr('ins.h.weak', { c: wk.components, l: wk.largest })}</div>` +
    (small || '') +
    list(wk.orphans.list.map(f => row(f, tr('ins.w.orphan'), f + '\n' + tr('ins.w.orphan.tip')))
      .concat(wk.thin.list.map(f => row(f, tr('ins.w.thin'), f + '\n' + tr('ins.w.thin.tip'))))
      .concat(wk.no_index.list.map(f => row(f, tr('ins.w.noindex'), f + '\n' + tr('ins.w.noindex.tip')))),
      tr('ins.e.weak')) +
    taxonomy +
    `<div class="dash-h">${tr('ins.h.areas')}</div><div class="ins-areas">${areas}</div>`;

  $('ins-foot').innerHTML =
    tr('ins.foot.window', { day: fmtDay(da.oldest_event), n: da.events, since: fmtDay(da.heat_since), hosts: esc((da.heat_machines || []).join(', ') || '—') }) +
    (da.heat_stale_paths ? tr('ins.foot.stale', { n: da.heat_stale_paths }) : '') +
    tr('ins.foot.self');

  $('ins-body').querySelectorAll('.heatrow').forEach(el => {
    const node = byId.get(el.dataset.file);
    if (!node) return;                       // note không còn tồn tại: không mở được
    el.onclick = () => { closeInsight(); wsOpen(node); };
  });
}

function renderMini() {
  const d = DB;
  if (!d) return;
  $('ins-mini').innerHTML =
    tr('ins.mini', { pct: d.coverage.pct, never: d.coverage.never, cold: d.cold.total,
      d: d.params.cold_days, leak: ((d.taxonomy || {}).b3_scope_leakage || {}).pct || 0,
      orph: d.weak.orphans.total, noidx: d.weak.no_index.total,
      work: (d.worklist || {}).total || 0 });
}

export async function pollInsight() {
  try {
    const r = await fetch('/insight', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    DB = await r.json();
    renderMini();
    if ($('insight').classList.contains('show')) render();
  } catch (e) {
    $('ins-mini').textContent = tr('ins.err', { e: String(e) });
  }
}

export async function openInsight() {
  $('insight').classList.add('show');
  focusInto($('ins-box'), '#ins-x');
  if (!DB) {
    $('ins-body').innerHTML = `<div class="dash-empty">${tr('ins.measuring2')}</div>`;
    await pollInsight();
  }
  if (DB) render();
}

export function closeInsight() { $('insight').classList.remove('show'); restoreFocus(); }

export function initInsight() {
  $('ins-open').onclick = () => openInsight();
  $('ins-refresh').onclick = ev => { ev.stopPropagation(); pollInsight(); };
  $('ins-x').onclick = closeInsight;
  $('insight').onclick = ev => { if (ev.target === $('insight')) closeInsight(); };
  // Esc bắt ở pha capture như các modal khác (switcher/dash/workmap không cướp phím)
  document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && $('insight').classList.contains('show')) {
      ev.stopPropagation();
      closeInsight();
    }
  }, true);
}
