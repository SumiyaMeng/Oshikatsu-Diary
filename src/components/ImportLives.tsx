import { useEffect, useMemo, useState } from 'react';
import { saveEntry } from '../lib/db';
import { fmtDate, today, yen } from '../lib/format';
import { alreadyLogged, parseEventText, parseICS, type Candidate } from '../lib/importers';
import { EVENT_TYPES } from '../lib/logic';
import { toast } from '../lib/toast';
import { useData } from './ui';

type Row = Candidate & { pick: boolean; dup: boolean };

const EXAMPLE = `例：X の告知や TimeTree の予定をそのまま貼り付け
11/22(日) 渋谷NEON BOX「ネオンサーカス vol.4」
11/28(土) 下北沢 STAR GARAGE【定期公演 vol.13】 ワンマン
OPEN 17:30 / START 18:00 前売 ¥3,000`;

/** Bulk import: paste a schedule or open a calendar file, then tick the lives you went to. */
export function ImportLives({ onClose, onDone }: { onClose: () => void; onDone: (n: number) => void }) {
  const { items } = useData();
  const lastGroup = useMemo(() => [...items].filter((e) => e.kind === 'event' && e.oshi).sort((a, b) => b.ts - a.ts)[0]?.oshi ?? '', [items]);
  const [mode, setMode] = useState<'text' | 'file'>('text');
  const [text, setText] = useState('');
  const [group, setGroup] = useState(lastGroup);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [usePrice, setUsePrice] = useState(true);
  const [saving, setSaving] = useState(false);
  const t = today();
  const events = useMemo(() => items.filter((e) => e.kind === 'event'), [items]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const show = (list: Candidate[]) => {
    if (!list.length) return toast("Couldn't find any dates. Check the text has days like 11/22(土) or 2026年11月22日.");
    setRows(list.map((c) => {
      const dup = alreadyLogged(c, events);
      return { ...c, dup, pick: !dup && c.date <= t };
    }));
  };
  const fromFile = async (f?: File) => {
    if (!f) return;
    try {
      show(parseICS(await f.text()));
    } catch {
      toast("Couldn't read that file. Choose a calendar file ending in .ics.");
    }
  };
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r!.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const selectWhere = (pred: (r: Row) => boolean) => setRows((r) => r!.map((x) => ({ ...x, pick: !x.dup && pred(x) })));
  const picked = rows?.filter((r) => r.pick) ?? [];

  const add = async () => {
    if (!picked.length) return toast('Tick at least one live.');
    setSaving(true);
    try {
      for (const r of picked)
        await saveEntry({ kind: 'event', date: r.date, title: r.title, venue: r.venue, oshi: group.trim(), etype: r.etype ?? 'taiban', open: r.open, start: r.start, amount: usePrice ? r.amount ?? 0 : 0, note: r.note });
      onDone(picked.length);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="impTitle">
        <div className="in">
          <div className="formhead">
            <h2 id="impTitle">{rows ? 'Which lives did you go to?' : 'Import lives'}</h2>
            <button className="btn ghost sm" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
          <div className="form">
            <div className="fld">
              <label htmlFor="imp-group">Group</label>
              <input id="imp-group" value={group} onChange={(e) => setGroup(e.target.value)} placeholder="Whose schedule is this?" />
            </div>
            {!rows ? (
              <>
                <div className="seg" style={{ display: 'inline-flex' }}>
                  <button type="button" aria-pressed={mode === 'text'} onClick={() => setMode('text')}>
                    Paste text
                  </button>
                  <button type="button" aria-pressed={mode === 'file'} onClick={() => setMode('file')}>
                    Calendar file (.ics)
                  </button>
                </div>
                {mode === 'text' ? (
                  <>
                    <div className="fld">
                      <label htmlFor="imp-text">Paste X posts, a monthly schedule, or a TimeTree event shared as text</label>
                      <textarea id="imp-text" rows={10} placeholder={EXAMPLE} value={text} onChange={(e) => setText(e.target.value)} />
                    </div>
                    <p className="hint">You can paste several posts at once. Ticket-sale dates (発売, 受付, 抽選…) are skipped.</p>
                    <button className="btn primary" type="button" onClick={() => show(parseEventText(text, t))}>
                      Find lives
                    </button>
                  </>
                ) : (
                  <>
                    <p className="hint">
                      Choose a .ics file exported from Apple Calendar, Google Calendar, or from TimeTree with the unofficial timetree-exporter tool.
                    </p>
                    <label className="btn primary">
                      <input type="file" accept=".ics,.ical,text/calendar" style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }} onChange={(e) => (fromFile(e.target.files?.[0]), (e.target.value = ''))} />
                      Choose calendar file
                    </label>
                  </>
                )}
              </>
            ) : (
              <>
                <p className="hint">
                  Found {rows.length} live{rows.length > 1 ? 's' : ''}. Past ones are ticked; untick any you skipped, and tick upcoming ones you're going to.
                </p>
                <div className="chips wrapc">
                  <button className="chip" type="button" onClick={() => selectWhere((r) => r.date <= t)}>
                    All past
                  </button>
                  <button className="chip" type="button" onClick={() => selectWhere(() => true)}>
                    All
                  </button>
                  <button className="chip" type="button" onClick={() => selectWhere(() => false)}>
                    None
                  </button>
                </div>
                <div className="list">
                  {rows.map((r, i) => (
                    <label key={r.key} className="entry pick-row" style={{ opacity: r.dup ? 0.55 : 1 }}>
                      <input type="checkbox" checked={r.pick} disabled={r.dup} onChange={(e) => set(i, { pick: e.target.checked })} />
                      <span className="pick-body">
                        <span className="ctop">
                          <span className="kind k-event">
                            {fmtDate(r.date)} · {EVENT_TYPES[r.etype ?? ''] ?? 'Live'}
                          </span>
                          <span className={`pill${r.dup ? '' : r.date <= t ? '' : ' ok'}`}>{r.dup ? 'Already in your log' : r.date <= t ? 'Past' : 'Upcoming'}</span>
                        </span>
                        <input aria-label="Title" className="pick-input ctitle" value={r.title} placeholder="Event name" onChange={(e) => set(i, { title: e.target.value })} />
                        <input aria-label="Venue" className="pick-input" value={r.venue} placeholder="Venue" onChange={(e) => set(i, { venue: e.target.value })} />
                        <span className="meta">
                          {[r.open && `OPEN ${r.open}`, r.start && `START ${r.start}`, r.amount && `前売 ${yen(r.amount)}`].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                <label className="switch">
                  <input type="checkbox" checked={usePrice} onChange={(e) => setUsePrice(e.target.checked)} /> Count the listed advance price as what I paid
                </label>
                <div className="formbtns">
                  <button className="btn primary" type="button" disabled={saving || !picked.length} onClick={add}>
                    {saving ? 'Adding…' : `Add ${picked.length} live${picked.length === 1 ? '' : 's'}`}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => setRows(null)}>
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
