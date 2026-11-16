import { fmtDate, fmtRange, today } from '../lib/format';
import { markSorted, setFollow, toCandidates, type Feed, type FeedInfo } from '../lib/feeds';
import { alreadyLogged, normalize, type Candidate } from '../lib/importers';
import type { Entry } from '../lib/types';
import { useData } from './ui';

export interface FeedState {
  index: FeedInfo[] | null;
  feeds: Record<string, Feed>;
  sorted: Set<string>;
  error: boolean;
}

const squash = (s?: string) => normalize(s ?? '').replace(/[\s「」『』【】・!！?？]/g, '').toLowerCase();

/** True when a ネットサイン会 from the calendar is already in the log. */
export const alreadySigned = (c: Candidate, items: Entry[]) => items.some((e) => e.kind === 'sign' && e.date === c.date && squash(e.title) === squash(c.title));

/** Calendar events of one kind the user hasn't added or skipped yet. */
export function pending(feed: Feed, kind: 'event' | 'sign', items: Entry[], sorted: Set<string>): Candidate[] {
  const events = items.filter((e) => e.kind === 'event');
  return toCandidates(feed, kind).filter((c) => !sorted.has(c.key) && !(kind === 'event' ? alreadyLogged(c, events) : alreadySigned(c, items)));
}

const updatedLabel = (iso?: string) => (iso ? 'updated ' + fmtDate(iso.slice(0, 10)) : '');

/** Follow prompt, or one summary row per followed calendar. */
export function CalendarPanel({ state, kind, onSort }: { state: FeedState; kind: 'event' | 'sign'; onSort?: (feed: Feed, list: Candidate[]) => void }) {
  const { items, settings } = useData();
  const followed = settings.feeds ?? [];
  const t = today();
  if (!state.index) return state.error ? <p className="hint">Couldn't load the group calendars. They'll show up next time you're online.</p> : null;
  const notFollowed = state.index.filter((c) => !followed.includes(c.id));
  return (
    <div className="panel feed" style={{ marginTop: 8 }}>
      {followed.map((id) => {
        const f = state.feeds[id];
        const info = state.index!.find((c) => c.id === id);
        if (!f) return <p key={id} className="hint">Loading {info?.group ?? id}'s calendar…</p>;
        const list = pending(f, kind, items, state.sorted);
        const past = list.filter((c) => c.date <= t).length;
        const up = list.length - past;
        return (
          <div key={id} className="row">
            <div>
              <h3>{f.group} calendar</h3>
              <p className="small mut">
                {kind === 'event'
                  ? list.length
                    ? `${past ? `${past} past live${past > 1 ? 's' : ''} to sort` : 'Nothing past to sort'}${up ? ` · ${up} coming up` : ''}`
                    : 'All sorted. New lives appear here when the calendar changes.'
                  : list.length
                    ? `${list.length} session${list.length > 1 ? 's' : ''} you haven't logged or skipped`
                    : 'All sorted.'}
                {' · '}
                {updatedLabel(f.updated)}
              </p>
            </div>
            <div className="addrow">
              {kind === 'event' && list.length && onSort ? (
                <button className="btn primary sm" type="button" onClick={() => onSort(f, list)}>
                  Tick the ones I went to
                </button>
              ) : null}
              <button className="btn ghost sm" type="button" onClick={() => setFollow(id, false)}>
                Stop following
              </button>
            </div>
          </div>
        );
      })}
      {notFollowed.length ? (
        <div className="row">
          <div>
            <h3>{followed.length ? 'More group calendars' : 'Follow a group calendar'}</h3>
            <p className="small mut">Follow once and their lives and ネットサイン会 show up here by themselves. You only tick the ones you went to.</p>
          </div>
          <div className="addrow">
            {notFollowed.map((c) => (
              <button key={c.id} className="btn sec sm" type="button" onClick={() => setFollow(c.id, true)}>
                Follow {c.group}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** One calendar event with buttons, used for ネットサイン会 sessions. */
export function FeedRow({ c, group, onAdd, addLabel }: { c: Candidate; group: string; onAdd: () => void; addLabel: string }) {
  return (
    <div className="feedrow">
      <div>
        <div className="t">{c.title}</div>
        <div className="m">
          {fmtRange(c.date, c.end)} · {group}
          {c.start ? ` · ${c.start}` : ''}
        </div>
      </div>
      <div className="addrow">
        <button className="btn sec sm" type="button" onClick={onAdd}>
          {addLabel}
        </button>
        <button className="btn ghost sm" type="button" onClick={() => markSorted([c.key])}>
          Skip
        </button>
      </div>
    </div>
  );
}
