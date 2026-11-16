import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { deleteEntry, saveEntry, savePhoto } from '../lib/db';
import { blobToImage, findFaces, matchFaces, type FaceMatch } from '../lib/face';
import { fmtDate, today, yen } from '../lib/format';
import { CHEKI_TYPES, COLLAB_TYPES, EVENT_TYPES, KIND_LABEL, PERKS, PICK_KINDS, cleanTalk, loopCost, nextLoop, nextSpeakerPrefix, openWallets } from '../lib/logic';
import { parseEventText } from '../lib/importers';
import { shrinkImage } from '../lib/scanner';
import { toast } from '../lib/toast';
import type { Entry, Kind } from '../lib/types';
import { Scanner, type ScanResult } from './Scanner';
import { Media, useData } from './ui';

export interface FormInit {
  id?: string;
  kind?: Kind;
  eventId?: string;
  preset?: Partial<Entry>;
}

type FV = Partial<Entry> & { kind: Kind; pics: { id: string; scan: boolean }[]; amountManual?: boolean; perkOther?: boolean };

const TALK_DRAFT = 'oshi-log-talk-draft';
const ALT_KEY = 'oshi-log-alt';
const ls = {
  get: (k: string) => {
    try {
      return localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k: string, v: string | null) => {
    try {
      if (v == null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  },
};

const FIELDS: Record<Kind, (keyof Entry)[]> = {
  tkk: ['eventId', 'oshi', 'talk', 'n', 'unit', 'chtype', 'perk', 'free', 'amount', 'loop', 'note', 'walletId'],
  event: ['etype', 'title', 'oshi', 'venue', 'number', 'amount', 'note', 'open', 'start'],
  photo: ['title', 'oshi', 'amount', 'note', 'media'],
  merch: ['title', 'oshi', 'amount', 'eventId', 'note'],
  travel: ['title', 'oshi', 'amount', 'eventId', 'note'],
  collab: ['cotype', 'title', 'oshi', 'venue', 'end', 'amount', 'note'],
  wallet: ['label', 'oshi', 'qty', 'unit', 'amount', 'expires', 'note'],
};
const NUMERIC = new Set<keyof Entry>(['n', 'unit', 'free', 'amount', 'loop', 'qty']);

export function EntryForm({ init, onClose }: { init: FormInit; onClose: () => void }) {
  const { items, byId, members } = useData();
  const editing = init.id ? byId[init.id] : undefined;
  const lastOf = (pred: (e: Entry) => boolean) => [...items].sort((a, b) => b.ts - a.ts).find(pred);
  const unitFor = (oshi?: string) => lastOf((x) => x.kind === 'tkk' && x.oshi === oshi && !!x.unit)?.unit ?? lastOf((x) => x.kind === 'tkk' && !!x.unit)?.unit;

  const [fv, setFv] = useState<FV>(() => {
    if (editing) return { ...editing, pics: (editing.photos ?? []).map((id) => ({ id, scan: (editing.scans ?? []).includes(id) })), amountManual: editing.kind === 'tkk' && editing.amount !== loopCost(editing) };
    const kind = init.kind ?? 'tkk';
    let eventId = init.eventId ?? '';
    if (!eventId && ['tkk', 'merch', 'travel'].includes(kind)) eventId = items.find((x) => x.kind === 'event' && x.date === today())?.id ?? '';
    const lt = lastOf((x) => x.kind === 'tkk');
    const v: FV = { kind, date: today(), eventId, pics: [], n: 1, etype: 'oneman', cotype: 'restaurant', chtype: lt?.chtype ?? 'cheki', media: 'photo', label: 'チェキ券' };
    if (kind === 'tkk') {
      v.oshi = lt?.oshi ?? '';
      v.talk = ls.get(TALK_DRAFT) || '推：';
    } else if (kind === 'event') v.oshi = lastOf((x) => x.kind === 'event')?.oshi ?? '';
    else v.oshi = lastOf(() => true)?.oshi ?? '';
    Object.assign(v, init.preset);
    if (kind === 'tkk') {
      v.unit = v.unit ?? unitFor(v.oshi);
      v.loop = v.loop ?? nextLoop(items, v.eventId, v.oshi);
    }
    return v;
  });
  const [alt, setAlt] = useState(() => ls.get(ALT_KEY) !== '0');
  const [scanFiles, setScanFiles] = useState<File[] | null>(null);
  const [faces, setFaces] = useState<{ status: 'idle' | 'busy' | 'none'; matches: FaceMatch[] }>({ status: 'idle', matches: [] });
  const [armed, setArmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [paste, setPaste] = useState<string | null>(null);
  const talkRef = useRef<HTMLTextAreaElement>(null);
  const k = fv.kind;
  const set = (patch: Partial<FV>) => setFv((v) => ({ ...v, ...patch }));

  useEffect(() => {
    if (!editing && k === 'tkk' && talkRef.current) {
      const t = talkRef.current;
      t.focus({ preventScroll: true });
      t.setSelectionRange(t.value.length, t.value.length);
    }
    // only on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && !scanFiles && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose, scanFiles]);

  const nameOptions = useMemo(() => {
    const s = new Set<string>();
    members.forEach((m) => !m.isMe && s.add(m.name));
    items.forEach((e) => e.oshi && s.add(e.oshi));
    members.forEach((m) => m.group && s.add(m.group));
    return [...s].sort();
  }, [items, members]);
  const recentMembers = useMemo(() => {
    const s: string[] = [];
    [...items]
      .filter((x) => x.kind === 'tkk' && x.oshi)
      .sort((a, b) => b.ts - a.ts)
      .forEach((x) => !s.includes(x.oshi!) && s.push(x.oshi!));
    members.forEach((m) => !m.isMe && !m.group?.includes(m.name) && !s.includes(m.name) && s.push(m.name));
    return s.slice(0, 10);
  }, [items, members]);
  const wallets = useMemo(() => openWallets(items, today()), [items]);
  const events = useMemo(() => items.filter((e) => e.kind === 'event').sort((a, b) => b.date.localeCompare(a.date)), [items]);

  const autoCost = k === 'tkk' ? loopCost(fv) : k === 'wallet' ? (+(fv.qty ?? 0) || 0) * (+(fv.unit ?? 0) || 0) : 0;

  /* ---- talk memo ---- */
  const talkKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing || e.keyCode === 229 || !alt) return;
    e.preventDefault();
    const t = e.currentTarget,
      v = t.value,
      a = t.selectionStart,
      b = t.selectionEnd;
    const before = v.slice(0, a),
      after = v.slice(b),
      ls0 = before.lastIndexOf('\n') + 1,
      cur = before.slice(ls0);
    const bare = cur.match(/^(推|私)[：:]\s*$/);
    let nv: string, caret: number;
    if (bare) {
      const nx = bare[1] === '推' ? '私：' : '推：';
      nv = v.slice(0, ls0) + nx + after;
      caret = ls0 + nx.length;
    } else {
      const nx = nextSpeakerPrefix(before);
      nv = before + '\n' + nx + after;
      caret = before.length + 1 + nx.length;
    }
    flushSync(() => setTalk(nv));
    t.setSelectionRange(caret, caret);
  };
  const setTalk = (v: string) => {
    set({ talk: v });
    if (!editing) ls.set(TALK_DRAFT, v);
  };
  const addLine = (prefix: string) => {
    const lines = String(fv.talk ?? '').replace(/\s+$/, '').split('\n');
    if (/^(推|私)[：:]$/.test(lines[lines.length - 1] ?? '')) lines.pop();
    const v = [...lines.filter((l, i) => l || i < lines.length - 1), prefix].join('\n').replace(/^\n/, '');
    setTalk(v);
    requestAnimationFrame(() => {
      const t = talkRef.current;
      if (t) {
        t.focus();
        t.setSelectionRange(v.length, v.length);
      }
    });
  };

  /* ---- photos ---- */
  const addBlob = async (blob: Blob, scan: boolean) => {
    const id = await savePhoto(blob);
    setFv((v) => ({ ...v, pics: [...v.pics, { id, scan }] }));
  };
  const onScan = async (r: ScanResult) => {
    await addBlob(r.blob, r.scan);
    toast(r.scan ? 'Cheki scan added' : 'Photo added');
    if (members.some((m) => m.faces?.length)) {
      setFaces((f) => ({ ...f, status: 'busy' }));
      try {
        const found = await findFaces(r.canvas ?? (await blobToImage(r.blob)));
        const matches = matchFaces(found, members);
        setFaces({ status: matches.length ? 'idle' : 'none', matches });
        if (matches.length && !fv.oshi) set({ oshi: matches[0].member.name });
      } catch {
        setFaces({ status: 'none', matches: [] });
      }
    }
  };
  const onFiles = async (files: FileList | null, mode: 'scan' | 'plain') => {
    const list = files ? [...files] : [];
    if (!list.length) return;
    if (mode === 'scan') return setScanFiles(list);
    for (const f of list) await addBlob(f.type.startsWith('video/') ? f : await shrinkImage(f), false);
    toast(list.length > 1 ? `${list.length} files added` : 'Added');
  };

  /* ---- save ---- */
  const build = (): Entry => {
    const d: Partial<Entry> = { kind: k, date: fv.date || today(), ts: editing?.ts, id: editing?.id };
    for (const f of FIELDS[k]) {
      const v = fv[f];
      (d as Record<string, unknown>)[f] = NUMERIC.has(f) ? +(v as number) || 0 : v == null ? '' : typeof v === 'string' ? v.trim() : v;
    }
    if (k === 'tkk') {
      d.n = Math.max(0, d.n ?? 0);
      if (!d.perk) d.free = 0;
      if (!fv.amountManual) d.amount = loopCost(d);
      d.talk = cleanTalk(String(fv.talk ?? ''));
      d.loop = Math.max(1, d.loop ?? 1);
    }
    if (k === 'wallet' && !fv.amountManual) d.amount = autoCost;
    d.photos = fv.pics.map((p) => p.id);
    d.scans = fv.pics.filter((p) => p.scan).map((p) => p.id);
    return d as Entry;
  };
  const save = async (next: boolean) => {
    const d = build();
    if (k === 'event' && !d.title && !d.venue) return toast('Add the event name or venue.');
    if (k === 'wallet' && !d.qty) return toast('How many tickets did you buy?');
    setSaving(true);
    try {
      const rec = await saveEntry(d);
      if (k === 'tkk' && !editing) ls.set(TALK_DRAFT, null);
      if (next) {
        toast(`Loop ${rec.loop} saved`);
        setFv({ kind: 'tkk', date: rec.date, eventId: rec.eventId, oshi: rec.oshi, unit: rec.unit, chtype: rec.chtype, walletId: rec.walletId, loop: (rec.loop ?? 1) + 1, n: 1, talk: '推：', pics: [] });
        setFaces({ status: 'idle', matches: [] });
        requestAnimationFrame(() => talkRef.current?.focus());
        return;
      }
      toast(editing ? 'Changes saved' : 'Saved to your log');
      onClose();
    } catch (e) {
      toast("Couldn't save: " + (e instanceof Error ? e.message : 'try again'));
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (!editing) return;
    if (!armed) {
      setArmed(true);
      setTimeout(() => setArmed(false), 3500);
      return;
    }
    await deleteEntry(editing.id);
    toast(editing.kind === 'event' ? 'Live deleted. Its 特典会 entries stay in your log.' : 'Entry deleted');
    onClose();
  };

  /* ---- field helpers ---- */
  const inp = (key: keyof Entry, label: string, type = 'text', extra: Record<string, string> = {}) => (
    <div className="fld">
      <label htmlFor={`f-${key}`}>{label}</label>
      <input
        id={`f-${key}`}
        type={type}
        inputMode={type === 'number' ? 'numeric' : undefined}
        min={type === 'number' ? 0 : undefined}
        value={(fv[key] as string | number | undefined) ?? ''}
        onChange={(e) => set({ [key]: e.target.value } as Partial<FV>)}
        list={key === 'oshi' ? 'oshi-names' : undefined}
        autoComplete="off"
        {...extra}
      />
    </div>
  );
  const area = (key: keyof Entry, label: string, rows = 3, ph = '') => (
    <div className="fld">
      <label htmlFor={`f-${key}`}>{label}</label>
      <textarea id={`f-${key}`} rows={rows} placeholder={ph} value={(fv[key] as string) ?? ''} onChange={(e) => set({ [key]: e.target.value } as Partial<FV>)} />
    </div>
  );
  const sel = (key: keyof Entry, label: string, opts: Record<string, string>) => (
    <div className="fld">
      <label htmlFor={`f-${key}`}>{label}</label>
      <select id={`f-${key}`} value={(fv[key] as string) ?? ''} onChange={(e) => set({ [key]: e.target.value } as Partial<FV>)}>
        {Object.entries(opts).map(([a, b]) => (
          <option key={a} value={a}>
            {b}
          </option>
        ))}
      </select>
    </div>
  );
  const eventSel = (label = 'Part of which live?') => (
    <div className="fld">
      <label htmlFor="f-eventId">{label}</label>
      <select
        id="f-eventId"
        value={fv.eventId ?? ''}
        onChange={(e) => set({ eventId: e.target.value, ...(k === 'tkk' && !editing ? { loop: nextLoop(items, e.target.value, fv.oshi) } : {}) })}
      >
        <option value="">Not linked to a live</option>
        {events.map((e) => (
          <option key={e.id} value={e.id}>
            {fmtDate(e.date)} {e.title || EVENT_TYPES[e.etype ?? ''] || 'Live'}
          </option>
        ))}
      </select>
    </div>
  );
  const chips = (vals: [string, string][], cur: string | undefined, on: (v: string) => void, wrap = true) => (
    <div className={`chips${wrap ? ' wrapc' : ''}`}>
      {vals.map(([v, l]) => (
        <button key={v} type="button" className="chip" aria-pressed={cur === v} onClick={() => on(v)}>
          {l}
        </button>
      ))}
    </div>
  );
  const photoBlock = (scanner: boolean, video = false) => (
    <div className="fld">
      <span className="lbl">{video ? 'Photos and videos' : 'Photos'}</span>
      <div className="upbar">
        {scanner ? (
          <>
            <label className="btn sec sm touch-only">
              <input type="file" accept="image/*" capture="environment" onChange={(e) => (onFiles(e.target.files, 'scan'), (e.target.value = ''))} />
              Take cheki photo
            </label>
            <label className="btn sec sm">
              <input type="file" accept="image/*" multiple onChange={(e) => (onFiles(e.target.files, 'scan'), (e.target.value = ''))} />
              Scan cheki from photos
            </label>
          </>
        ) : null}
        <label className="btn ghost sm">
          <input type="file" accept={video ? 'image/*,video/*' : 'image/*'} multiple onChange={(e) => (onFiles(e.target.files, 'plain'), (e.target.value = ''))} />
          {scanner ? 'Add photo without scanning' : video ? 'Add photos or videos' : 'Add photos'}
        </label>
      </div>
      {faces.status === 'busy' ? <span className="suggest">Checking who's in the cheki…</span> : null}
      {faces.matches.length ? (
        <div className="suggest">
          Looks like
          {faces.matches.map((m) => (
            <button key={m.member.id} type="button" className="chip" aria-pressed={fv.oshi === m.member.name} onClick={() => set({ oshi: m.member.name })}>
              {m.member.name}
            </button>
          ))}
        </div>
      ) : faces.status === 'none' ? (
        <span className="suggest">No registered member recognised.</span>
      ) : null}
      {fv.pics.length ? (
        <div className="photos">
          {fv.pics.map((p, i) => (
            <div key={p.id} className="ptile">
              <Media id={p.id} scan={p.scan} />
              <button type="button" aria-label="Remove photo" onClick={() => set({ pics: fv.pics.filter((_, j) => j !== i) })}>
                ×
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );

  let body: ReactNode = null;
  if (k === 'tkk') {
    const freeTxt = fv.free ? ` (${fv.free} free)` : '';
    body = (
      <>
        {eventSel()}
        <div className="fld">
          <label htmlFor="f-oshi">Who</label>
          {recentMembers.length
            ? chips(
                recentMembers.map((m) => [m, m]),
                fv.oshi,
                (v) => set({ oshi: v, ...(!editing ? { unit: unitFor(v) ?? fv.unit, loop: nextLoop(items, fv.eventId, v) } : {}) }),
                false,
              )
            : null}
          <input id="f-oshi" list="oshi-names" autoComplete="off" placeholder="Member name" value={fv.oshi ?? ''} onChange={(e) => set({ oshi: e.target.value })} />
        </div>
        <div className="fld">
          <label htmlFor="f-talk">What you talked about</label>
          <div className="talkbar">
            <button type="button" className="chip" onClick={() => addLine('推：')}>
              ＋ Oshi said
            </button>
            <button type="button" className="chip" onClick={() => addLine('私：')}>
              ＋ I said
            </button>
          </div>
          <textarea id="f-talk" ref={talkRef} rows={7} placeholder={'推：今日も来てくれてありがとう！\n私：新曲めっちゃよかった'} value={fv.talk ?? ''} onChange={(e) => setTalk(e.target.value)} onKeyDown={talkKey} />
          <label className="switch">
            <input
              type="checkbox"
              checked={alt}
              onChange={(e) => {
                setAlt(e.target.checked);
                ls.set(ALT_KEY, e.target.checked ? '1' : '0');
              }}
            />{' '}
            Return switches speaker
          </label>
          <p className="hint">Each new line starts with the other speaker. Return on an empty line swaps who's talking; shift+return adds a plain line. Your keyboard's mic works here too.</p>
        </div>
        <div className="grid3">
          <div className="fld">
            <label htmlFor="f-n">Chekis / tickets</label>
            <div className="stepper">
              <button type="button" aria-label="One fewer" onClick={() => set({ n: Math.max(0, (+(fv.n ?? 0) || 0) - 1) })}>
                −
              </button>
              <input id="f-n" type="number" inputMode="numeric" min={0} value={fv.n ?? 0} onChange={(e) => set({ n: +e.target.value })} />
              <button type="button" aria-label="One more" onClick={() => set({ n: (+(fv.n ?? 0) || 0) + 1 })}>
                ＋
              </button>
            </div>
          </div>
          {inp('unit', 'Price each (¥)', 'number', { placeholder: '1000' })}
          {sel('chtype', 'Type', CHEKI_TYPES)}
        </div>
        {wallets.length || fv.walletId ? (
          <div className="fld">
            <label htmlFor="f-walletId">Paid with</label>
            <select id="f-walletId" value={fv.walletId ?? ''} onChange={(e) => set({ walletId: e.target.value })}>
              <option value="">Paid on the spot</option>
              {wallets.map(({ w, s }) => (
                <option key={w.id} value={w.id}>
                  {w.label || 'チェキ券'} · {w.oshi || 'any'} · {s.left} left{w.expires ? ` · until ${fmtDate(w.expires)}` : ''}
                </option>
              ))}
              {fv.walletId && !wallets.some(({ w }) => w.id === fv.walletId) ? <option value={fv.walletId}>Tickets bought earlier</option> : null}
            </select>
          </div>
        ) : null}
        <div className="fld">
          <span className="lbl">特典 used</span>
          {chips(
            [...PERKS.map((p) => [p, p] as [string, string]), ['__other', 'Other…']],
            fv.perkOther || (fv.perk && !PERKS.includes(fv.perk)) ? '__other' : fv.perk,
            (v) => {
              if (v === '__other') set({ perkOther: true, perk: fv.perk && !PERKS.includes(fv.perk) ? fv.perk : '特典', free: fv.free || 1 });
              else if (fv.perk === v) set({ perk: '', free: 0, perkOther: false });
              else set({ perk: v, perkOther: false, free: fv.free || 1 });
            },
          )}
          {fv.perk ? (
            <div className="grid2">
              {fv.perkOther || !PERKS.includes(fv.perk) ? inp('perk', '特典 name') : <span />}
              {inp('free', 'Free chekis from it', 'number')}
            </div>
          ) : null}
        </div>
        <div className="cost">
          <span className="small">
            {fv.walletId ? 'Paid with tickets bought earlier' : 'Spent on this loop'}
            <span className="mut">{freeTxt}</span>
          </span>
          <b className="num">{yen(fv.amountManual ? +(fv.amount ?? 0) : autoCost)}</b>
          <button type="button" className="btn ghost sm" onClick={() => set({ amountManual: !fv.amountManual, amount: fv.amountManual ? fv.amount : autoCost })}>
            {fv.amountManual ? 'Use auto' : 'Change'}
          </button>
          {fv.amountManual ? <div style={{ flexBasis: '100%' }}>{inp('amount', 'Amount (¥)', 'number')}</div> : null}
        </div>
        {photoBlock(true)}
        <div className="grid2">
          {inp('loop', 'Loop #', 'number')}
          {inp('date', 'Date', 'date')}
        </div>
        {area('note', 'Other notes', 2, 'Pose, outfit, anything else')}
      </>
    );
  } else if (k === 'event') {
    const fill = () => {
      const c = parseEventText(paste ?? '', today())[0];
      if (!c) return toast("Couldn't find a date in that text.");
      set({ date: c.date, title: c.title || fv.title, venue: c.venue || fv.venue, open: c.open ?? fv.open, start: c.start ?? fv.start, amount: c.amount ?? fv.amount, etype: c.etype ?? fv.etype, note: fv.note || c.note });
      setPaste(null);
      toast('Filled in from the text. Check it, then save.');
    };
    body = (
      <>
        {paste === null ? (
          <button type="button" className="btn ghost sm" style={{ justifySelf: 'start' }} onClick={() => setPaste('')}>
            Paste from X or TimeTree
          </button>
        ) : (
          <div className="paste-fill">
            <label htmlFor="f-paste" className="lbl">
              Paste the announcement or the TimeTree event text
            </label>
            <textarea id="f-paste" rows={5} value={paste} onChange={(e) => setPaste(e.target.value)} autoFocus />
            <div className="addrow">
              <button type="button" className="btn primary sm" onClick={fill}>
                Fill in
              </button>
              <button type="button" className="btn ghost sm" onClick={() => setPaste(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        <div className="fld">
          <span className="lbl">Type</span>
          {chips(Object.entries(EVENT_TYPES), fv.etype, (v) => set({ etype: v }))}
        </div>
        {inp('title', 'Event name')}
        <div className="grid2">
          {inp('date', 'Date', 'date')}
          {inp('oshi', 'Group')}
        </div>
        {inp('venue', 'Venue')}
        <div className="grid2">
          {inp('open', 'OPEN', 'time')}
          {inp('start', 'START', 'time')}
        </div>
        <div className="grid2">
          {inp('number', '入場番号', 'text', { placeholder: 'e.g. A-12' })}
          {inp('amount', 'Ticket / entry (¥)', 'number')}
        </div>
        {area('note', 'Memo', 3, 'Setlist, who you went with, how it felt…')}
        {photoBlock(false)}
      </>
    );
  } else if (k === 'wallet') {
    body = (
      <>
        <p className="hint">For tickets bought ahead (まとめ買い, bundles). Use them later from a 特典会 loop and the app counts what's left.</p>
        <div className="fld">
          <label htmlFor="f-label">Ticket type</label>
          {chips(
            ['チェキ券', '特典券', 'サイン券'].map((x) => [x, x]),
            fv.label,
            (v) => set({ label: v }),
          )}
          <input id="f-label" value={fv.label ?? ''} onChange={(e) => set({ label: e.target.value })} />
        </div>
        <div className="grid2">
          {inp('oshi', 'For (member or group)')}
          {inp('date', 'Bought on', 'date')}
        </div>
        <div className="grid2">
          {inp('qty', 'How many', 'number')}
          {inp('unit', 'Price each (¥)', 'number')}
        </div>
        <div className="cost">
          <span className="small">Paid in total</span>
          <b className="num">{yen(fv.amountManual ? +(fv.amount ?? 0) : autoCost)}</b>
          <button type="button" className="btn ghost sm" onClick={() => set({ amountManual: !fv.amountManual, amount: fv.amountManual ? fv.amount : autoCost })}>
            {fv.amountManual ? 'Use auto' : 'Change'}
          </button>
          {fv.amountManual ? <div style={{ flexBasis: '100%' }}>{inp('amount', 'Total (¥)', 'number')}</div> : null}
        </div>
        {inp('expires', 'Use by (leave empty if no limit)', 'date')}
        {area('note', 'Memo', 2, 'Where you bought them, conditions…')}
      </>
    );
  } else if (k === 'collab') {
    body = (
      <>
        {sel('cotype', 'Collab type', COLLAB_TYPES)}
        {inp('title', 'Collab name')}
        <div className="grid2">
          {inp('date', 'Starts', 'date')}
          {inp('end', 'Ends', 'date')}
        </div>
        {inp('venue', 'Where (shop, station, programme…)')}
        {inp('oshi', 'Oshi / group')}
        {inp('amount', 'Spent (¥)', 'number')}
        {area('note', 'Memo')}
        {photoBlock(false)}
      </>
    );
  } else if (k === 'photo') {
    body = (
      <>
        <div className="fld">
          <span className="lbl">What you got</span>
          {chips(
            [
              ['photo', 'Photo + message'],
              ['video', 'Video message'],
            ],
            fv.media,
            (v) => set({ media: v as 'photo' | 'video' }),
          )}
        </div>
        {inp('title', 'Shop or sale name')}
        <div className="grid2">
          {inp('date', 'Date', 'date')}
          {inp('oshi', 'Oshi')}
        </div>
        {inp('amount', 'Spent (¥)', 'number')}
        {area('note', 'Message written for you', 3)}
        {photoBlock(false, true)}
      </>
    );
  } else {
    body = (
      <>
        {inp('title', k === 'merch' ? 'Item' : 'What (train, hotel, food…)')}
        <div className="grid2">
          {inp('date', 'Date', 'date')}
          {inp('oshi', 'Oshi / group')}
        </div>
        {inp('amount', 'Spent (¥)', 'number')}
        {eventSel('For which live?')}
        {area('note', 'Memo', 2)}
        {k === 'merch' ? photoBlock(false) : null}
      </>
    );
  }

  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="formTitle">
        <div className="in">
          <div className="formhead">
            <h2 id="formTitle">{editing ? 'Edit ' + KIND_LABEL[k] : 'New entry'}</h2>
            <button className="btn ghost sm" type="button" onClick={onClose}>
              Cancel
            </button>
          </div>
          <div className="form">
            {!editing ? (
              <div className="chips" role="group" aria-label="Entry type">
                {PICK_KINDS.map((x) => (
                  <button
                    key={x}
                    type="button"
                    className="chip"
                    aria-pressed={x === k}
                    onClick={() =>
                      set({
                        kind: x,
                        ...(x === 'tkk' ? { talk: fv.talk || '推：', unit: fv.unit ?? unitFor(fv.oshi), loop: fv.loop ?? nextLoop(items, fv.eventId, fv.oshi) } : {}),
                      })
                    }
                  >
                    {KIND_LABEL[x]}
                  </button>
                ))}
              </div>
            ) : null}
            {body}
            <div className="formbtns">
              {k === 'tkk' && !editing ? (
                <div className="two">
                  <button className="btn primary" type="button" disabled={saving} onClick={() => save(false)}>
                    Save
                  </button>
                  <button className="btn sec" type="button" disabled={saving} onClick={() => save(true)}>
                    Save & next loop
                  </button>
                </div>
              ) : (
                <button className="btn primary" type="button" disabled={saving} onClick={() => save(false)}>
                  {editing ? 'Save changes' : 'Save'}
                </button>
              )}
              {editing ? (
                <button className="btn danger" type="button" onClick={remove}>
                  {armed ? 'Tap again to delete' : 'Delete this entry'}
                </button>
              ) : null}
            </div>
          </div>
          <datalist id="oshi-names">
            {nameOptions.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </div>
      </div>
      {scanFiles ? <Scanner files={scanFiles} onResult={onScan} onClose={() => setScanFiles(null)} /> : null}
    </>
  );
}
