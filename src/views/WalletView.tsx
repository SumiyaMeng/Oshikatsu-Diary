import { useMemo } from 'react';
import { fmtDate, today, yen } from '../lib/format';
import { walletStatus } from '../lib/logic';
import type { Entry } from '../lib/types';
import { Empty, useData } from '../components/ui';

export function WalletView({ onOpen, onBuy }: { onOpen: (e: Entry) => void; onBuy: () => void }) {
  const { items, showMoney } = useData();
  const t = today();
  const rows = useMemo(
    () =>
      items
        .filter((e) => e.kind === 'wallet')
        .map((w) => ({ w, s: walletStatus(w, items, t) }))
        .sort((a, b) => (a.w.expires ?? '9999').localeCompare(b.w.expires ?? '9999')),
    [items, t],
  );
  const open = rows.filter((r) => r.s.left > 0 && !r.s.expired);
  const done = rows.filter((r) => r.s.left === 0 || r.s.expired);
  const lost = rows.reduce((s, r) => s + r.s.lost, 0);
  const holding = open.reduce((s, r) => s + r.s.left, 0);

  const card = ({ w, s }: (typeof rows)[number]) => (
    <div key={w.id} className="entry wallet-card" role="button" tabIndex={0} onClick={() => onOpen(w)} onKeyDown={(k) => k.key === 'Enter' && onOpen(w)}>
      <div className="ctop">
        <span className="kind k-wallet">{w.label || 'チェキ券'}</span>
        <span className="amt">{showMoney ? yen(w.amount) : ''}</span>
      </div>
      <div className="ctitle">{w.oshi || 'Any member'}</div>
      <div className="wallet-left">
        {s.left}
        <small>
          of {s.bought} left · {s.used} used
        </small>
      </div>
      <div className="pills">
        <span className="pill">Bought {fmtDate(w.date)}</span>
        {w.expires ? (
          <span className={`pill ${s.expired ? 'warn' : s.daysLeft! <= 7 ? 'warn' : ''}`}>
            {s.expired ? `Expired ${fmtDate(w.expires)}` : `Use by ${fmtDate(w.expires)} · ${s.daysLeft} day${s.daysLeft === 1 ? '' : 's'}`}
          </span>
        ) : (
          <span className="pill">No expiry</span>
        )}
        {s.expired && s.left && showMoney ? <span className="pill warn">{yen(s.lost)} lost</span> : null}
        {!s.left ? <span className="pill ok">All used</span> : null}
      </div>
    </div>
  );

  return (
    <section>
      <div className="hero" style={{ marginTop: 4 }}>
        <span className="eyebrow">Ticket wallet</span>
        <div className="big">
          {holding}
          <small>tickets to use</small>
        </div>
        <p>
          {open.length ? `Next to expire: ${open[0].w.label || 'チェキ券'} for ${open[0].w.oshi || 'any member'}${open[0].w.expires ? `, ${fmtDate(open[0].w.expires)}` : ''}.` : 'No unused tickets right now.'}
          {lost && showMoney ? ` So far ${yen(lost)} went to tickets that expired.` : ''}
        </p>
      </div>
      <div className="block">
        <button className="btn primary" type="button" onClick={onBuy}>
          ＋ Tickets bought ahead
        </button>
        <p className="hint">Log まとめ買い or bundles here. When you use them at a 特典会, pick them under “Paid with” and the count goes down.</p>
      </div>
      {!rows.length ? (
        <Empty title="No tickets in your wallet">Add tickets you bought ahead to see how many are left and when they expire.</Empty>
      ) : (
        <>
          {open.length ? (
            <>
              <div className="mh">
                <span>To use</span>
                <span className="num">{open.length}</span>
              </div>
              <div className="list">{open.map(card)}</div>
            </>
          ) : null}
          {done.length ? (
            <>
              <div className="mh">
                <span>Used up or expired</span>
                <span className="num">{done.length}</span>
              </div>
              <div className="list">{done.map(card)}</div>
            </>
          ) : null}
        </>
      )}
    </section>
  );
}
