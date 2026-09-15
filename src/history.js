// ─────────────────────────────────────────────────────────────
// The record: a plain month calendar. One cell per day, six marks
// per cell — one for each task, filled when it was completed.
// Tapping a day names them.
// ─────────────────────────────────────────────────────────────

import { TASKS, dateKey } from './schedule.js';
import { store } from './store.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

let refDay = 0;        // today, as a day number
let shown = null;      // { y, m } the month on screen
let picked = null;     // day number the person tapped

const dayNumFrom = (y, m, d) => Math.round(Date.UTC(y, m - 1, d) / 86400000);
const partsOf = (dn) => {
  const d = new Date(dn * 86400000);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), w: d.getUTCDay() };
};

const doneOn = (dn) => TASKS.map((t) => store.entry(dateKey(dn), t.key));

export function renderArchive(root, today) {
  refDay = today;
  const p = partsOf(today);
  if (!shown) shown = { y: p.y, m: p.m };
  if (picked === null) picked = today;
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
    const entries = doneOn(dn);
    const count = entries.filter(Boolean).length;
    const future = dn > refDay;

    const cell = document.createElement('button');
    cell.type = 'button';
    cell.className = 'cal-day';
    if (dn === refDay) cell.dataset.today = '1';
    if (dn === picked) cell.dataset.picked = '1';
    if (future) cell.dataset.future = '1';
    if (count === TASKS.length) cell.dataset.full = '1';

    const num = document.createElement('span');
    num.className = 'cal-num';
    num.textContent = String(d);
    cell.appendChild(num);

    const dots = document.createElement('span');
    dots.className = 'cal-dots';
    entries.forEach((entry, i) => {
      const dot = document.createElement('i');
      if (entry) dot.dataset.on = '1';
      dot.title = TASKS[i].key;
      dots.appendChild(dot);
    });
    cell.appendChild(dots);

    cell.setAttribute('aria-label', future
      ? `${shown.m}月${d}日`
      : `${shown.m}月${d}日 ${TASKS.length}件中${count}件完了`);
    cell.addEventListener('click', () => { picked = dn; draw(root); });
    grid.appendChild(cell);
  }
  root.appendChild(grid);

  // ── what that day actually held ──
  const detail = document.createElement('div');
  detail.className = 'cal-detail';
  const dp = partsOf(picked);
  const dHead = document.createElement('p');
  dHead.className = 'cal-detail-head';
  dHead.textContent = `${dp.m}月${dp.d}日（${WEEKDAYS[dp.w]}）`;
  detail.appendChild(dHead);

  const list = document.createElement('ul');
  list.className = 'cal-list';
  doneOn(picked).forEach((entry, i) => {
    const li = document.createElement('li');
    if (entry) li.dataset.on = '1';
    const dot = document.createElement('i');
    const name = document.createElement('span');
    name.className = 'cal-task';
    name.textContent = TASKS[i].key;
    const state = document.createElement('span');
    state.className = 'cal-state';
    state.textContent = entry ? '完了' : '未完了';
    li.append(dot, name, state);
    list.appendChild(li);
  });
  detail.appendChild(list);
  root.appendChild(detail);

  const legend = document.createElement('p');
  legend.className = 'cal-legend';
  legend.textContent = `各日の6つの点は左から ${TASKS.map((t) => t.key).join(' · ')}`;
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
