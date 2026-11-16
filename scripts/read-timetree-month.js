// Paste into the browser on a TimeTree public calendar month page
// (https://timetreeapp.com/public_calendars/<id>?monthly=YYYY-MM-01, ideally with a tall window so no day overflows).
// Returns a JSON array of { date, end?, title } for events that start in that month, reading the month grid.
// A multi-day event split across a week boundary is joined back into one. Works for Sunday- and Monday-start weeks.
(async () => {
  const mp = new URLSearchParams(location.search).get('monthly');
  let g;
  for (let i = 0; i < 40; i++) {
    g = document.querySelector('[data-test-id=monthly-calendar]');
    if (g && g.querySelector('[style*="--lndlxo0"]')) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  const tpl = (g.getAttribute('style').match(/--_2u4y7t0:([^;]*)/) || [])[1]
    .trim()
    .replace(/repeat\((\d+),\s*([^)]+)\)/g, (_, n, t) => Array(+n).fill(t.trim()).join(' '))
    .split(/\s+/);
  const wk = [];
  let w = -1;
  tpl.forEach((t, i) => {
    if (t === '36px') w++;
    wk[i + 1] = w;
  });
  const [y, m] = mp.split('-').map(Number);
  // The grid starts on Sunday or Monday depending on the viewer's settings: read the first day cell.
  const day0 = +[...g.children].map((d) => d.textContent.trim()).find((t) => /^\d{1,2}$/.test(t));
  const start = day0 === 1 ? new Date(Date.UTC(y, m - 1, 1)) : new Date(Date.UTC(y, m - 2, day0));
  const iso = (d) => d.toISOString().slice(0, 10);
  const segs = [];
  for (const d of g.children) {
    const s = d.getAttribute('style') || '';
    const v = (k) => +((s.match(new RegExp('--lndlxo' + k + ':\\s*(\\d+)')) || [])[1] || 0);
    if (!v(0)) continue;
    const st = new Date(start.getTime() + (wk[v(1)] * 7 + v(0) - 1) * 864e5);
    segs.push({ s: iso(st), e: iso(new Date(st.getTime() + (v(2) - 1) * 864e5)), t: d.textContent.trim(), col: v(0) });
  }
  // Join a segment ending on the last day of a week row with the same event at the start of the next row (placeholders like 予定 stay separate).
  for (const a of segs) {
    if ((Date.parse(a.e) - Date.parse(start.toISOString().slice(0, 10))) / 864e5 % 7 !== 6 || a.gone || /予定|\(仮\)/.test(a.t)) continue;
    const b = segs.find((z) => z !== a && z.col === 1 && z.t === a.t && Date.parse(z.s) - Date.parse(a.e) === 864e5);
    if (b) {
      a.e = b.e;
      b.gone = true;
    }
  }
  const ym = mp.slice(0, 7);
  return JSON.stringify(segs.filter((x) => !x.gone && x.s.slice(0, 7) === ym).map((x) => (x.e > x.s ? { date: x.s, end: x.e, title: x.t } : { date: x.s, title: x.t })));
})();
