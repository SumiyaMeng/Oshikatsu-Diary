import { useState } from 'react';
import { deleteMember, exportAll, saveMember, savePhoto } from '../lib/db';
import { blobToImage, cropFace, findFaces } from '../lib/face';
import { fmtDate, today } from '../lib/format';
import { useSync } from '../lib/hooks';
import { shrinkImage } from '../lib/scanner';
import { configure, loadConfig, signIn, signOut, syncNow } from '../lib/sync';
import { toast } from '../lib/toast';
import type { Entry, Member } from '../lib/types';
import { EntryCard, Empty, Media, useData } from '../components/ui';

type Tab = 'members' | 'collabs' | 'sync';

export function MoreView({ onOpen, onNewCollab }: { onOpen: (e: Entry) => void; onNewCollab: () => void }) {
  const [tab, setTab] = useState<Tab>('members');
  return (
    <section>
      <div className="seg" style={{ marginTop: 4, display: 'inline-flex' }}>
        {(
          [
            ['members', 'Members & faces'],
            ['collabs', 'Collabs'],
            ['sync', 'Sync & backup'],
          ] as [Tab, string][]
        ).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === 'members' ? <Members /> : tab === 'collabs' ? <Collabs onOpen={onOpen} onNew={onNewCollab} /> : <SyncPanel />}
    </section>
  );
}

function Members() {
  const { members } = useData();
  const [name, setName] = useState('');
  const [group, setGroup] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const add = async () => {
    if (!name.trim()) return toast('Type the member name first.');
    await saveMember({ name: name.trim(), group: group.trim(), color: '#d22e6d' });
    setName('');
    toast('Member added');
  };
  const addFaces = async (m: Member, files: FileList | null) => {
    if (!files?.length) return;
    setBusy(m.id);
    try {
      const faces = [...(m.faces ?? [])],
        pics = [...(m.facePhotos ?? [])];
      let added = 0;
      for (const f of files) {
        const img = await blobToImage(await shrinkImage(f, 1200));
        const found = await findFaces(img);
        if (!found.length) continue;
        faces.push(found[0].descriptor);
        const crop = await cropFace(img, found[0].box);
        if (crop) pics.push(await savePhoto(crop));
        added++;
      }
      await saveMember({ ...m, faces, facePhotos: pics });
      toast(added ? `${added} face${added > 1 ? 's' : ''} added for ${m.name}` : 'No face found in those photos. Try a clearer, front-facing one.');
    } catch {
      toast("Face matching couldn't start on this device.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <div className="block">
        <h3>Your members</h3>
        <p className="hint">
          Add 2–5 clear photos of each member's face. When you scan a cheki, the app suggests who's in it. Add your own face as “Me” so it's ignored in 2-shot chekis. Faces are matched on this device only.
        </p>
        {!members.length ? <Empty title="No members yet">Add the members you take chekis with.</Empty> : null}
        <div className="list">
          {members.map((m) => (
            <div key={m.id} className="panel">
              <div className="member-row">
                <input type="color" aria-label={`Colour for ${m.name}`} value={m.color || '#d22e6d'} onChange={(e) => saveMember({ ...m, color: e.target.value })} style={{ width: 40, height: 32, padding: 2, flex: 'none' }} />
                <div className="grow">
                  <b>{m.name}</b>
                  {m.isMe ? <span className="pill" style={{ marginLeft: 6 }}>Me</span> : null}
                  <div className="small mut">
                    {m.group || 'No group'} · {m.faces?.length ?? 0} face{m.faces?.length === 1 ? '' : 's'}
                  </div>
                </div>
                <button className="btn ghost sm" type="button" onClick={() => deleteMember(m.id)}>
                  Remove
                </button>
              </div>
              {m.facePhotos?.length ? (
                <div className="faces">
                  {m.facePhotos.map((id) => (
                    <Media key={id} id={id} />
                  ))}
                </div>
              ) : null}
              <div className="upbar">
                <label className="btn sec sm">
                  <input type="file" accept="image/*" multiple onChange={(e) => (addFaces(m, e.target.files), (e.target.value = ''))} />
                  {busy === m.id ? 'Reading faces…' : 'Add face photos'}
                </label>
                {!m.isMe ? (
                  <button className="btn ghost sm" type="button" onClick={() => saveMember({ ...m, isMe: true })}>
                    This is me
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="block">
        <h3>Add a member</h3>
        <div className="panel">
          <div className="grid2">
            <div className="fld">
              <label htmlFor="m-name">Name</label>
              <input id="m-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="fld">
              <label htmlFor="m-group">Group</label>
              <input id="m-group" value={group} onChange={(e) => setGroup(e.target.value)} />
            </div>
          </div>
          <button className="btn primary" type="button" onClick={add}>
            Add member
          </button>
        </div>
      </div>
    </>
  );
}

function Collabs({ onOpen, onNew }: { onOpen: (e: Entry) => void; onNew: () => void }) {
  const { items } = useData();
  const t = today();
  const cs = items.filter((e) => e.kind === 'collab');
  const on = cs.filter((c) => c.date <= t && (!c.end || c.end >= t)),
    up = cs.filter((c) => c.date > t).sort((a, b) => a.date.localeCompare(b.date)),
    past = cs.filter((c) => c.end && c.end < t);
  const sec = (h: string, a: Entry[]) =>
    a.length ? (
      <>
        <div className="mh">
          <span>{h}</span>
          <span className="num">{a.length}</span>
        </div>
        <div className="list">
          {a.map((e) => (
            <EntryCard key={e.id} e={e} onOpen={onOpen} />
          ))}
        </div>
      </>
    ) : null;
  return (
    <>
      <div className="block">
        <button className="btn primary" type="button" onClick={onNew}>
          ＋ Collab
        </button>
      </div>
      {!cs.length ? <Empty title="No collabs yet">Track restaurant tie-ups, vending machines, radio and TV appearances.</Empty> : null}
      {sec('Running now', on)}
      {sec('Coming up', up)}
      {sec('Past', past)}
    </>
  );
}

function SyncPanel() {
  const sync = useSync();
  const cfg = loadConfig();
  const [url, setUrl] = useState(cfg?.url ?? '');
  const [key, setKey] = useState(cfg?.key ?? '');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState('');
  const download = async () => {
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `oshi-log-backup-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  return (
    <>
      <div className="block">
        <h3>Sync between devices</h3>
        <div className="panel settings">
          {sync.status === 'off' ? (
            <>
              <p className="hint">Paste your Supabase project's URL and publishable (anon) key. The README explains the five-minute setup.</p>
              <div className="fld">
                <label htmlFor="s-url">Project URL</label>
                <input id="s-url" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="fld">
                <label htmlFor="s-key">Publishable (anon) key</label>
                <input id="s-key" value={key} onChange={(e) => setKey(e.target.value)} />
              </div>
              <button className="btn primary" type="button" onClick={() => (url && key ? configure({ url, key }) : toast('Paste both the URL and the key.'))}>
                Connect
              </button>
            </>
          ) : sync.status === 'signed-out' ? (
            <>
              <p className="hint">Sign in with the same account on every device.</p>
              <div className="fld">
                <label htmlFor="s-email">Email</label>
                <input id="s-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="fld">
                <label htmlFor="s-pw">Password</label>
                <input id="s-pw" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
              </div>
              <div className="two formbtns" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <button className="btn primary" type="button" onClick={async () => setMsg((await signIn(email, pw, false)) ?? '')}>
                  Sign in
                </button>
                <button className="btn sec" type="button" onClick={async () => setMsg((await signIn(email, pw, true)) ?? 'Account created.')}>
                  Create account
                </button>
              </div>
              {msg ? <p className="hint">{msg}</p> : null}
              <button className="btn ghost sm" type="button" onClick={() => configure(null)}>
                Use a different project
              </button>
            </>
          ) : (
            <>
              <div className="row-sp">
                <span>
                  Signed in as <b>{sync.email}</b>
                </span>
                <span className={`sync ${sync.status === 'error' ? 'err' : sync.status === 'syncing' ? 'busy' : 'on'}`}>
                  {sync.status === 'syncing' ? 'Syncing' : sync.status === 'error' ? 'Sync failed' : sync.status === 'offline' ? 'Offline' : 'Synced'}
                </span>
              </div>
              {sync.message ? <p className="hint">{sync.message}</p> : null}
              {sync.last ? <p className="hint">Last synced {fmtDate(new Date(sync.last).toISOString().slice(0, 10))} {new Date(sync.last).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}</p> : null}
              <div className="addrow">
                <button className="btn sec sm" type="button" onClick={() => syncNow()}>
                  Sync now
                </button>
                <button className="btn ghost sm" type="button" onClick={() => signOut()}>
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <div className="block">
        <h3>Backup</h3>
        <div className="panel">
          <p className="hint">Everything you've logged as one JSON file (photos not included). Keep a copy in iCloud Drive now and then.</p>
          <button className="btn ghost" type="button" onClick={download}>
            Download backup (.json)
          </button>
        </div>
      </div>
      <div className="block">
        <h3>Install on your phone</h3>
        <div className="panel">
          <p className="hint">iPhone: open this page in Safari, tap Share, then “Add to Home Screen”. Android: open it in Chrome and tap “Install app”. It works offline once installed.</p>
        </div>
      </div>
    </>
  );
}
