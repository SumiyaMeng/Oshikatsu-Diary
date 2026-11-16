import { createContext, useContext, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { usePhotoURL } from '../lib/hooks';
import { fmtDate, yen, yenShort } from '../lib/format';
import { CHEKI_TYPES, COLLAB_TYPES, EVENT_TYPES, KIND_LABEL, amt, chekisOf, eventCost, isLoop, linked } from '../lib/logic';
import { onToast } from '../lib/toast';
import type { Entry, Member, Settings } from '../lib/types';

export interface Data {
  items: Entry[];
  byId: Record<string, Entry>;
  members: Member[];
  settings: Settings;
  /** False while spending is hidden and not revealed in the current view. */
  showMoney: boolean;
}
export const DataCtx = createContext<Data>({ items: [], byId: {}, members: [], settings: { hideMoney: false }, showMoney: true });
export const useData = () => useContext(DataCtx);

/** CSS variable for a member's colour, looked up by name. */
export function useColor() {
  const { members } = useData();
  return (name?: string): CSSProperties | undefined => {
    const c = members.find((m) => m.name === name)?.color;
    return c && /^#[0-9a-f]{6}$/i.test(c) ? ({ '--oc': c } as CSSProperties) : undefined;
  };
}

export function Media({ id, scan, film }: { id: string; scan?: boolean; film?: boolean }) {
  const { url, type } = usePhotoURL(id);
  if (!url) return <span className="pill">Loading photo…</span>;
  if (type?.startsWith('video/')) return <video className="media-video" src={url} controls playsInline preload="metadata" />;
  if (scan) return <img className="scan" src={url} alt="Cheki scan" loading="lazy" />;
  if (film)
    return (
      <div className="film">
        <img src={url} alt="Cheki" loading="lazy" />
      </div>
    );
  return <img src={url} alt="" loading="lazy" />;
}

export function Photos({ e }: { e: Entry }) {
  const ps = e.photos ?? [];
  if (!ps.length) return null;
  const scans = e.scans ?? [];
  return (
    <div className="photos">
      {ps.map((id) => (
        <Media key={id} id={id} scan={scans.includes(id)} film={e.kind === 'tkk'} />
      ))}
    </div>
  );
}

export function Bubbles({ text, oshi, limit }: { text?: string; oshi?: string; limit?: number }) {
  const color = useColor();
  let lines = String(text ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  let more = 0;
  if (limit && lines.length > limit) {
    more = lines.length - limit;
    lines = lines.slice(0, limit);
  }
  return (
    <div className="talk" style={color(oshi)}>
      {lines.map((l, i) => {
        let m = l.match(/^(推|O)[：:]\s*(.*)$/i);
        if (m) return m[2] ? <div key={i} className="b o">{m[2]}</div> : null;
        m = l.match(/^(私|M)[：:]\s*(.*)$/i);
        if (m) return m[2] ? <div key={i} className="b m">{m[2]}</div> : null;
        return <div key={i} className="b n">{l}</div>;
      })}
      {more ? <div className="b n">+{more} more lines</div> : null}
    </div>
  );
}

export function titleOf(e: Entry): string {
  if (e.kind === 'tkk') return `${e.oshi || '特典会'} · ${e.n ?? 0} ${CHEKI_TYPES[e.chtype ?? 'cheki'] ?? 'チェキ'}`;
  if (e.kind === 'wallet') return `${e.label || 'チェキ券'} ×${e.qty ?? 0}`;
  if (e.title) return e.title;
  if (e.kind === 'event') return EVENT_TYPES[e.etype ?? ''] ?? 'Live';
  return KIND_LABEL[e.kind];
}

export function EntryCard({ e, inEvent, full, onOpen }: { e: Entry; inEvent?: boolean; full?: boolean; onOpen: (e: Entry) => void }) {
  const { items, byId, showMoney } = useData();
  const color = useColor();
  const ev = e.eventId ? byId[e.eventId] : undefined;
  let label: string = KIND_LABEL[e.kind];
  if (e.kind === 'tkk' && e.loop) label += ` · loop ${e.loop}`;
  if (e.kind === 'event') label = EVENT_TYPES[e.etype ?? ''] ?? 'Live / event';
  if (e.kind === 'collab' && e.cotype) label += ' · ' + (COLLAB_TYPES[e.cotype] ?? '');
  if (e.kind === 'photo' && e.media === 'video') label = 'Marche · video';
  const meta = [
    fmtDate(e.date),
    e.oshi && e.kind !== 'tkk' ? (
      <span key="o" className="who" style={color(e.oshi)}>
        {e.oshi}
      </span>
    ) : null,
    e.venue || null,
    e.kind === 'event' && (e.open || e.start) ? [e.open && `OPEN ${e.open}`, e.start && `START ${e.start}`].filter(Boolean).join(' / ') : null,
    ev && !inEvent ? 'at ' + (ev.title || EVENT_TYPES[ev.etype ?? ''] || 'event') : null,
    e.kind === 'collab' && e.end ? 'until ' + fmtDate(e.end) : null,
    e.kind === 'wallet' && e.expires ? 'use by ' + fmtDate(e.expires) : null,
  ].filter(Boolean);
  const l = e.kind === 'event' ? linked(e, items) : [];
  const ch = l.reduce((s, x) => s + chekisOf(x), 0);
  const lp = l.filter(isLoop).length;
  const money = showMoney && amt(e) ? yen(amt(e)) : '';
  return (
    <div className="entry" role="button" tabIndex={0} onClick={() => onOpen(e)} onKeyDown={(k) => (k.key === 'Enter' || k.key === ' ') && (k.preventDefault(), onOpen(e))}>
      <div className="ctop">
        <span className={`kind k-${e.kind}`}>
          {e.kind === 'tkk' && e.oshi ? <span className="who" style={color(e.oshi)} /> : null}
          {label}
        </span>
        <span className="amt">{money}</span>
      </div>
      <div className="ctitle">{titleOf(e)}</div>
      {meta.length ? (
        <div className="meta">
          {meta.map((m, i) => (
            <span key={i}>
              {i ? ' · ' : ''}
              {m}
            </span>
          ))}
        </div>
      ) : null}
      {e.kind === 'tkk' && (e.perk || e.walletId) ? (
        <div className="pills">
          {e.perk ? <span className="pill perk">{e.perk}{e.free ? ` · ${e.free} free` : ''}</span> : null}
          {e.walletId ? <span className="pill">Paid with tickets bought earlier</span> : null}
        </div>
      ) : null}
      {e.kind === 'event' && (e.number || ch || lp || (showMoney && !inEvent && eventCost(e, items))) ? (
        <div className="pills">
          {e.number ? <span className="pill">入場番号 <b className="num">{e.number}</b></span> : null}
          {ch ? <span className="pill">{ch} cheki{ch > 1 ? 's' : ''}</span> : null}
          {lp ? <span className="pill">{lp} loop{lp > 1 ? 's' : ''}</span> : null}
          {showMoney && !inEvent && eventCost(e, items) ? <span className="pill num">{yen(eventCost(e, items))} in total</span> : null}
        </div>
      ) : null}
      {e.kind === 'tkk' && e.talk ? <Bubbles text={e.talk} oshi={e.oshi} limit={full ? 0 : 5} /> : null}
      {e.note ? <p className="note">{e.note}</p> : null}
      <Photos e={e} />
    </div>
  );
}

export function Empty({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="empty" style={{ marginTop: 12 }}>
      <b>{title}</b>
      <span>{children}</span>
      {actions ? <div className="addrow">{actions}</div> : null}
    </div>
  );
}

export function Tile({ label, value, accent, hidden }: { label: string; value: ReactNode; accent?: boolean; hidden?: boolean }) {
  return (
    <div className="tile">
      <span className="l">{label}</span>
      <span className={`v ${hidden ? 'hid' : 'num'}${accent && !hidden ? ' ac' : ''}`}>{hidden ? 'Hidden till recap' : value}</span>
    </div>
  );
}

export function HBars({ rows, format, style, labelOf }: { rows: [string, number][]; format?: (n: number) => string; style?: (k: string) => CSSProperties | undefined; labelOf?: (k: string) => ReactNode }) {
  const mx = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="panel hbars">
      {rows.map(([k, v]) => (
        <div key={k} className="hb" style={style?.(k)}>
          <span>{labelOf ? labelOf(k) : k}</span>
          <span className="num">{format ? format(v) : v}</span>
          <div className="track">
            <div className="fill" style={{ width: `${Math.max(3, (v / mx) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function Columns({ data, money }: { data: { label: string; value: number }[]; money?: boolean }) {
  const mx = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="panel">
      <div className="cols">
        {data.map((d) => (
          <div key={d.label} className="col" title={`${d.label}: ${money ? yen(d.value) : d.value}`}>
            <span className="cv">{d.value ? (money ? yenShort(d.value) : d.value) : ' '}</span>
            <div className="cw">
              <div className={`cb${d.value ? '' : ' zero'}`} style={{ height: `${d.value ? Math.max(4, (d.value / mx) * 100) : 2}%` }} />
            </div>
            <span className="cl">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => onToast(setMsg), []);
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null;
}
