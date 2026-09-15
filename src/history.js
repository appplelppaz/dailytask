// ─────────────────────────────────────────────────────────────
// The archive: not a score, a wall of marks. Every completed task
// leaves the trace its world left, drawn again at small size.
// No counters, no streaks, no ratios.
// ─────────────────────────────────────────────────────────────

import { TASKS, dateKey } from './schedule.js';
import { store } from './store.js';
import { byId } from './designs.js';
import { drawTrace } from './traces.js';
import { makeRng, css } from './util.js';

export function renderArchive(container, refDay) {
  container.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'arch-row arch-head';
  for (const t of TASKS) {
    const c = document.createElement('span');
    c.className = 'arch-label';
    c.textContent = t.key;
    head.appendChild(c);
  }
  container.appendChild(head);

  for (let i = 0; i < 14; i++) {
    const day = dateKey(refDay - i);
    const row = document.createElement('div');
    row.className = 'arch-row' + (i === 0 ? ' arch-today' : '');

    for (const t of TASKS) {
      const cell = document.createElement('span');
      cell.className = 'arch-cell';
      const entry = store.entry(day, t.key);
      if (entry) {
        const design = byId(entry.design);
        const cv = document.createElement('canvas');
        const S = 46, dpr = Math.min(2, devicePixelRatio || 1);
        cv.width = S * dpr; cv.height = S * dpr;
        cv.style.width = cv.style.height = S + 'px';
        const ctx = cv.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (design) {
          drawTrace(ctx, design.mark, S / 2, S / 2, S * 0.78, design.pal, 1, makeRng(i * 31 + t.key.length));
          cell.title = `${t.key} — ${design.name}`;
        }
        cell.appendChild(cv);
      } else {
        const dot = document.createElement('span');
        dot.className = 'arch-empty';
        cell.appendChild(dot);
      }
      row.appendChild(cell);
    }
    container.appendChild(row);
  }
}
