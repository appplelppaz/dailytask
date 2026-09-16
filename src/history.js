// ─────────────────────────────────────────────────────────────
// The record: a plain month calendar. One cell per day, six marks
// per cell — one for each task, in a fixed order and each with its
// own colour, lit when that task was completed.
// ─────────────────────────────────────────────────────────────

import { TASKS, dateKey } from './schedule.js';
import { store } from './store.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

// Six well-separated hues. Position still carries the meaning, so the
// colour is reinforcement rather than the only cue.
export const TASK_COLORS = {
  PIANO:   '#e3b34a',   // amber
  ENGLISH: '#57a5e8',   // sky
  CHINESE: '#e8697c',   // rose
  SPANISH: '#a98cf0',   // violet
  FRENCH:  '#3fc6ab',   // teal
  WORKOUT: '#9ed155'    // lime
};

let refDay = 0;        // today, as a day number
let shown = null;      // { y, m } the month on screen

const dayNumFrom = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const partsOf = (dn) => {
  const d = new Date(dn * 86400000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay() };
};

export function renderArchive(root, today) {
  refDay = today;
  const p = partsOf(today);
  if (!shown) shown = { y: p.y, m: p.m };
  draw(root);
}

function draw(root) {
  root.innerHTML = '';
  const todayParts = partsOf(refDay);

  // ── month, with a way back and forward ──
  const head = document.createElement('div');
  head.className = 'cal-head';
  head.appendChild(navButton('‹', -1, root, '前の月'));
  const title = document.createElement('span');
  title.className = 'cal-title';
  title.textContent = `${shown.y}年${shown.m}月`;
  head.appendChild(title);
  const atNow = shown.y === todayParts.y && shown.m === todayParts.m;
  head.appendChild(navButton('›', 1, root, '次の月', atNow));
  root.appendChild(head);

  const week = document.createElement('div');
  week.className = 'cal-week';
  WEEKDAYS.forEach((w, i) => {
    const s = document.createElement('span');
    s.textContent = w;
    if (i === 0) s.dataset.sun = '1';
    if (i === 6) s.dataset.sat = '1';
    week.appendChild(s);
  });
  root.appendChild(week);

  // ── the month itself ──
  const grid = document.createElement('div');
  grid.className = 'cal-grid';
  const first = dayNumFrom(shown.y, shown.m, 1);
  const lead = partsOf(first).w;
  const days = new Date(Date.UTC(shown.y, shown.m, 0)).getUTCDate();

  for (let i = 0; i < lead; i++) grid.appendChild(document.createElement('span'));

  for (let d = 1; d <= days; d++) {
    const dn = dayNumFrom(shown.y, shown.m, d);
    const done = TASKS.map((t) => !!store.entry(dateKey(dn), t.key));
    const count = done.filter(Boolean).length;
    const future = dn > refDay;

    const cell = document.createElement('div');
    cell.className = 'cal-day';
    if (dn === refDay) cell.dataset.today = '1';
    if (future) cell.dataset.future = '1';
    if (count === TASKS.length) cell.dataset.full = '1';

    const num = document.createElement('span');
    num.className = 'cal-num';
    num.textContent = String(d);
    cell.appendChild(num);

    const dots = document.createElement('span');
    dots.className = 'cal-dots';
    done.forEach((isDone, i) => {
      const dot = document.createElement('i');
      const key = TASKS[i].key;
      if (isDone) {
        dot.dataset.on = '1';
        dot.style.background = TASK_COLORS[key];
      }
      dot.title = key;
      dots.appendChild(dot);
    });
    cell.appendChild(dots);

    const doneNames = TASKS.filter((_, i) => done[i]).map((t) => t.key);
    cell.setAttribute('aria-label', future
      ? `${shown.m}月${d}日`
      : `${shown.m}月${d}日 ${doneNames.length ? doneNames.join('、') + ' 完了' : '完了なし'}`);
    grid.appendChild(cell);
  }
  root.appendChild(grid);

  // ── which colour is which ──
  const legend = document.createElement('ul');
  legend.className = 'cal-legend';
  for (const t of TASKS) {
    const li = document.createElement('li');
    const dot = document.createElement('i');
    dot.style.background = TASK_COLORS[t.key];
    const name = document.createElement('span');
    name.textContent = t.key;
    li.append(dot, name);
    legend.appendChild(li);
  }
  root.appendChild(legend);
}

function navButton(glyph, dir, root, label, disabled = false) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cal-nav';
  b.textContent = glyph;
  b.setAttribute('aria-label', label);
  b.disabled = disabled;
  b.addEventListener('click', () => {
    let m = shown.m + dir, y = shown.y;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    shown = { y, m };
    draw(root);
  });
  return b;
}
