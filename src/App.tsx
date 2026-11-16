import { useEffect, useMemo, useState } from 'react';
import { EntryForm, type FormInit } from './components/EntryForm';
import { ImportLives } from './components/ImportLives';
import { DataCtx, ToastHost, type Data } from './components/ui';
import { today, yen } from './lib/format';
import { useEntries, useMembers, useSettings, useSync } from './lib/hooks';
import { chekisOf, openWallets, sumAmt } from './lib/logic';
import { init as initSync } from './lib/sync';
import { toast } from './lib/toast';
import type { Entry, Kind } from './lib/types';
import { EventView } from './views/EventView';
import { LivesView } from './views/LivesView';
import { LogView } from './views/LogView';
import { MoreView } from './views/MoreView';
import { RecapView } from './views/RecapView';
import { WalletView } from './views/WalletView';

type View = 'log' | 'lives' | 'wallet' | 'recap' | 'more' | 'event';
const TABS: [View, string][] = [
  ['log', 'Log'],
  ['lives', 'Lives'],
  ['wallet', 'Wallet'],
  ['recap', 'Recap'],
  ['more', 'More'],
];
const fromHash = (): View => {
  const h = location.hash.slice(1) as View;
  return TABS.some(([v]) => v === h) ? h : 'log';
};

export function App() {
  const entries = useEntries();
  const members = useMembers();
  const settings = useSettings();
  const sync = useSync();
  const [view, setView] = useState<View>(fromHash);
  const [eventId, setEventId] = useState<string | null>(null);
  const [form, setForm] = useState<FormInit | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    void initSync();
    const on = () => setView(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);

  const go = (v: View) => {
    setView(v);
    if (v !== 'event' && location.hash !== '#' + v) history.replaceState(null, '', '#' + v);
    window.scrollTo(0, 0);
  };
  const data: Data | null = useMemo(() => {
    if (!entries || !members || !settings) return null;
    return { items: entries, byId: Object.fromEntries(entries.map((e) => [e.id, e])), members, settings, showMoney: !settings.hideMoney };
  }, [entries, members, settings]);

  const open = (e: Entry) => {
    if (e.kind === 'event' && view !== 'event') {
      setEventId(e.id);
      go('event');
    } else setForm({ id: e.id });
  };
  const newEntry = (kind: Kind, evId?: string) => setForm({ kind, eventId: evId ?? (view === 'event' ? eventId ?? undefined : undefined) });
  const memo = () => newEntry('tkk');

  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (form || importing || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const k = ev.key.toLowerCase();
      if (k === 'm') (ev.preventDefault(), memo());
      else if (k === 'n') (ev.preventDefault(), newEntry(view === 'lives' ? 'event' : view === 'wallet' ? 'wallet' : 'tkk'));
      else if (k === 'l') (ev.preventDefault(), newEntry('event'));
      else if (k === '/') {
        ev.preventDefault();
        go('log');
        setTimeout(() => document.getElementById('search')?.focus(), 50);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });

  useEffect(() => {
    document.documentElement.classList.toggle('locked', !!form || importing);
  }, [form, importing]);

  if (!data) return <p className="status">Opening your log…</p>;
  const ym = today().slice(0, 7);
  const monthItems = data.items.filter((e) => e.date.startsWith(ym));
  const soon = openWallets(data.items, today()).filter(({ s }) => s.daysLeft !== undefined && s.daysLeft <= 7).length;

  return (
    <DataCtx.Provider value={data}>
      <div className="wrap">
        <header className="top">
          <div className="brand">
            <h1>
              <span className="eyebrow">推し活ログ</span>Oshi Log
            </h1>
            <div className="mtot">
              <span className="eyebrow">This month</span>
              <div className={`v${settings!.hideMoney ? ' hid' : ''}`}>{settings!.hideMoney ? 'Hidden till recap' : yen(sumAmt(monthItems))}</div>
              {sync.status !== 'off' ? (
                <button type="button" className={`sync ${sync.status === 'error' ? 'err' : sync.status === 'syncing' ? 'busy' : sync.status === 'idle' ? 'on' : ''}`} onClick={() => go('more')}>
                  {sync.status === 'signed-out' ? 'Signed out' : sync.status === 'syncing' ? 'Syncing' : sync.status === 'error' ? 'Sync failed' : sync.status === 'offline' ? 'Offline' : 'Synced'}
                </button>
              ) : null}
            </div>
          </div>
          <nav className="tabs" role="tablist">
            {TABS.map(([v, l]) => (
              <button key={v} role="tab" type="button" aria-selected={view === v || (view === 'event' && v === 'lives')} onClick={() => go(v)}>
                {l}
                {v === 'wallet' && soon ? ' •' : ''}
              </button>
            ))}
          </nav>
        </header>
        <div className="layout">
          <main className="main">
            {view === 'log' ? <LogView onOpen={open} onNew={(k) => newEntry(k)} onWallet={() => go('wallet')} /> : null}
            {view === 'lives' ? <LivesView onOpen={open} onNewEvent={() => newEntry('event')} onImport={() => setImporting(true)} /> : null}
            {view === 'event' && eventId ? <EventView id={eventId} onBack={() => go('lives')} onOpen={open} onNew={(k, id) => newEntry(k, id)} onEdit={(id) => setForm({ id })} /> : null}
            {view === 'wallet' ? <WalletView onOpen={open} onBuy={() => newEntry('wallet')} /> : null}
            {view === 'recap' ? <RecapView onOpen={open} revealed={revealed} onReveal={(k) => setRevealed(new Set(revealed).add(k))} /> : null}
            {view === 'more' ? <MoreView onOpen={open} onNewCollab={() => newEntry('collab')} /> : null}
          </main>
          <aside className="aside" aria-label="Quick actions">
            <div className="panel">
              <span className="eyebrow">{new Date().getMonth() + 1}月 so far</span>
              <div className="tiles" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="tile">
                  <span className="l">Lives</span>
                  <span className="v num">{monthItems.filter((e) => e.kind === 'event' && e.date <= today()).length}</span>
                </div>
                <div className="tile">
                  <span className="l">Chekis</span>
                  <span className="v num">{monthItems.reduce((s, e) => s + chekisOf(e), 0)}</span>
                </div>
              </div>
            </div>
            <button className="btn primary" type="button" onClick={memo}>
              特典会 memo
            </button>
            <button className="btn sec" type="button" onClick={() => newEntry('tkk')}>
              ＋ Add entry
            </button>
            <button className="btn ghost" type="button" onClick={() => newEntry('event')}>
              ＋ Live / event
            </button>
            <div className="panel">
              <span className="eyebrow">Keyboard</span>
              <dl className="keys">
                <dt><kbd>M</kbd></dt>
                <dd>特典会 memo</dd>
                <dt><kbd>N</kbd></dt>
                <dd>New entry</dd>
                <dt><kbd>L</kbd></dt>
                <dd>New live</dd>
                <dt><kbd>/</kbd></dt>
                <dd>Search</dd>
                <dt><kbd>Esc</kbd></dt>
                <dd>Close</dd>
              </dl>
            </div>
          </aside>
        </div>
      </div>
      {!form && !importing ? (
        <div className="dock">
          <div className="in">
            <button className="btn primary" type="button" onClick={memo}>
              特典会 memo <small>write it before you forget</small>
            </button>
            <button className="btn sec" type="button" onClick={() => newEntry(view === 'lives' ? 'event' : view === 'wallet' ? 'wallet' : 'tkk')}>
              ＋ Add
            </button>
          </div>
        </div>
      ) : null}
      {form ? <EntryForm key={JSON.stringify(form)} init={form} onClose={() => setForm(null)} /> : null}
      {importing ? (
        <ImportLives
          onClose={() => setImporting(false)}
          onDone={(n) => {
            setImporting(false);
            toast(`Added ${n} live${n === 1 ? '' : 's'}`);
            go('lives');
          }}
        />
      ) : null}
      <ToastHost />
    </DataCtx.Provider>
  );
}
