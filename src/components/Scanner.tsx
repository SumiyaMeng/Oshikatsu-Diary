import { useCallback, useEffect, useRef, useState } from 'react';
import { FILM, detectQuad, dist, filmForAspect, loadImage, quadAspect, rotateQuad, shrinkImage, warpToCanvas, type FilmKey, type LoadedImage, type Quad } from '../lib/scanner';
import { toast } from '../lib/toast';

export interface ScanResult {
  blob: Blob;
  scan: boolean;
  /** The straightened image, for face matching. */
  canvas?: HTMLCanvasElement;
}

/** Full-screen cheki scanner. Processes the given files one by one. */
export function Scanner({ files, onResult, onClose }: { files: File[]; onResult: (r: ScanResult) => Promise<void> | void; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [img, setImg] = useState<LoadedImage | null>(null);
  const [quad, setQuad] = useState<Quad | null>(null);
  const [film, setFilm] = useState<FilmKey>('mini');
  const [frame, setFrame] = useState(true);
  const [fix, setFix] = useState(true);
  const [msg, setMsg] = useState('Finding the cheki…');
  const [preview, setPreview] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const drag = useRef<{ i: number; off: [number, number] } | null>(null);
  const scale = useRef(1);

  const auto = useCallback((im: LoadedImage) => {
    const r = detectQuad(im);
    let q = r.q,
      a = quadAspect(q);
    if (a > 1.42) {
      q = rotateQuad(q);
      a = 1 / a;
    }
    setQuad(q);
    setFilm(filmForAspect(a));
    setMsg(r.found ? "Found it. Drag the corners if they're off." : "Couldn't find the edges. Drag the four corners onto the cheki.");
  }, []);

  useEffect(() => {
    const f = files[index];
    if (!f) {
      onClose();
      return;
    }
    let alive = true;
    setImg(null);
    setPreview('');
    setMsg('Finding the cheki…');
    loadImage(f)
      .then((im) => {
        if (!alive) return;
        setImg(im);
        auto(im);
      })
      .catch(() => {
        toast("Couldn't open that photo.");
        setIndex((i) => i + 1);
      });
    return () => {
      alive = false;
    };
  }, [index, files, auto, onClose]);

  const draw = useCallback(() => {
    const c = cv.current,
      st = stage.current;
    if (!c || !st || !img || !quad) return;
    const iw = img.canvas.width,
      ih = img.canvas.height;
    const maxW = Math.max(200, st.clientWidth - 16),
      maxH = Math.max(240, Math.min(window.innerHeight * (window.innerWidth < 760 ? 0.5 : 0.72), 760));
    const s = Math.min(maxW / iw, maxH / ih),
      dpr = window.devicePixelRatio || 1;
    scale.current = s;
    c.style.width = Math.round(iw * s) + 'px';
    c.style.height = Math.round(ih * s) + 'px';
    c.width = Math.round(iw * s * dpr);
    c.height = Math.round(ih * s * dpr);
    const x = c.getContext('2d')!;
    x.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    x.drawImage(img.canvas, 0, 0);
    const ac = getComputedStyle(document.documentElement).getPropertyValue('--ac').trim() || '#d22e6d';
    x.beginPath();
    x.rect(0, 0, iw, ih);
    x.moveTo(quad[0][0], quad[0][1]);
    for (let i = 3; i >= 0; i--) x.lineTo(quad[i][0], quad[i][1]);
    x.closePath();
    x.fillStyle = 'rgba(0,0,0,.45)';
    x.fill('evenodd');
    x.beginPath();
    quad.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
    x.closePath();
    x.lineWidth = 2.5 / s;
    x.strokeStyle = ac;
    x.stroke();
    const tx = (quad[0][0] + quad[1][0]) / 2,
      ty = (quad[0][1] + quad[1][1]) / 2;
    x.beginPath();
    x.moveTo(tx, ty);
    x.lineTo(tx, ty + 18 / s);
    x.lineWidth = 2 / s;
    x.stroke();
    quad.forEach((p, i) => {
      x.beginPath();
      x.arc(p[0], p[1], (drag.current?.i === i ? 15 : 12) / s, 0, 7);
      x.fillStyle = 'rgba(255,255,255,.92)';
      x.fill();
      x.lineWidth = 3 / s;
      x.strokeStyle = ac;
      x.stroke();
    });
    if (drag.current) {
      const p = quad[drag.current.i],
        R = 58 / s,
        Z = 3,
        cx = p[0] < iw / 2 ? iw - R - 10 / s : R + 10 / s,
        cy = R + 10 / s;
      x.save();
      x.beginPath();
      x.arc(cx, cy, R, 0, 7);
      x.clip();
      x.fillStyle = '#000';
      x.fillRect(cx - R, cy - R, 2 * R, 2 * R);
      x.drawImage(img.canvas, p[0] - R / Z, p[1] - R / Z, (2 * R) / Z, (2 * R) / Z, cx - R, cy - R, 2 * R, 2 * R);
      x.strokeStyle = ac;
      x.lineWidth = 1.5 / s;
      x.beginPath();
      x.moveTo(cx - R, cy);
      x.lineTo(cx + R, cy);
      x.moveTo(cx, cy - R);
      x.lineTo(cx, cy + R);
      x.stroke();
      x.restore();
      x.beginPath();
      x.arc(cx, cy, R, 0, 7);
      x.lineWidth = 3 / s;
      x.strokeStyle = '#fff';
      x.stroke();
    }
  }, [img, quad]);

  useEffect(() => {
    draw();
    const on = () => draw();
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [draw]);

  useEffect(() => {
    if (!img || !quad || drag.current) return;
    const t = setTimeout(() => setPreview(warpToCanvas(img, quad, film, frame, fix, 8).toDataURL('image/jpeg', 0.8)), 60);
    return () => clearTimeout(t);
  }, [img, quad, film, frame, fix]);

  const pos = (e: React.PointerEvent): [number, number] => {
    const r = cv.current!.getBoundingClientRect();
    return [(e.clientX - r.left) / scale.current, (e.clientY - r.top) / scale.current];
  };
  const down = (e: React.PointerEvent) => {
    if (!quad) return;
    const p = pos(e);
    let bi = -1,
      bd = Infinity;
    quad.forEach((c, i) => {
      const d = dist(c, p);
      if (d < bd) (bd = d), (bi = i);
    });
    if (bd > 110 / scale.current) return;
    drag.current = { i: bi, off: [quad[bi][0] - p[0], quad[bi][1] - p[1]] };
    cv.current!.setPointerCapture(e.pointerId);
    e.preventDefault();
    draw();
  };
  const move = (e: React.PointerEvent) => {
    if (!drag.current || !quad || !img) return;
    const p = pos(e),
      { i, off } = drag.current;
    const next = quad.map((c) => [...c]) as Quad;
    next[i] = [Math.max(0, Math.min(img.canvas.width, p[0] + off[0])), Math.max(0, Math.min(img.canvas.height, p[1] + off[1]))];
    setQuad(next);
  };
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    setQuad((q) => (q ? ([...q] as Quad) : q));
  };

  const next = () => setIndex((i) => i + 1);
  const use = async () => {
    if (!img || !quad) return;
    setBusy(true);
    try {
      const canvas = warpToCanvas(img, quad, film, frame, fix, 12);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      if (blob) await onResult({ blob, scan: true, canvas });
    } finally {
      setBusy(false);
    }
    next();
  };
  const original = async () => {
    setBusy(true);
    try {
      await onResult({ blob: await shrinkImage(files[index]), scan: false });
    } finally {
      setBusy(false);
    }
    next();
  };

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="scanner" role="dialog" aria-modal="true" aria-labelledby="scanTitle">
      <div className="in">
        <div className="scanhead">
          <div>
            <h2 id="scanTitle">Scan cheki</h2>
            {files.length > 1 ? <span className="small mut">Photo {Math.min(index + 1, files.length)} of {files.length}</span> : null}
          </div>
          <button className="btn ghost sm" type="button" onClick={onClose}>
            Cancel
          </button>
        </div>
        <div className="scanbody">
          <div className="stage" ref={stage}>
            <canvas ref={cv} aria-label="Drag the four corners onto the cheki's edges" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          </div>
          <div className="scanside">
            <p className="hint">{msg}</p>
            <div className="fld">
              <span className="lbl">Film</span>
              <div className="seg">
                {(Object.keys(FILM) as FilmKey[]).map((k) => (
                  <button key={k} type="button" aria-pressed={film === k} onClick={() => setFilm(k)}>
                    {FILM[k].label}
                  </button>
                ))}
              </div>
            </div>
            <div className="talkbar">
              <button className="btn ghost sm" type="button" onClick={() => quad && (setQuad(rotateQuad(quad)), setFilm(filmForAspect(quadAspect(rotateQuad(quad)))))}>
                Rotate ↻
              </button>
              <button className="btn ghost sm" type="button" onClick={() => img && auto(img)}>
                Detect again
              </button>
            </div>
            <label className="switch">
              <input type="checkbox" checked={frame} onChange={(e) => setFrame(e.target.checked)} /> Keep the white frame
            </label>
            <label className="switch">
              <input type="checkbox" checked={fix} onChange={(e) => setFix(e.target.checked)} /> Fix colors from the white frame
            </label>
            <div className="prev">{preview ? <img src={preview} alt="Scan preview" /> : <span className="small mut">Preview</span>}</div>
            <div className="formbtns">
              <button className="btn primary" type="button" disabled={busy || !img} onClick={use}>
                {busy ? 'Saving…' : 'Use this scan'}
              </button>
              <div className="two">
                <button className="btn ghost sm" type="button" disabled={busy} onClick={original}>
                  Use photo as is
                </button>
                <button className="btn ghost sm" type="button" disabled={busy} onClick={next}>
                  Skip
                </button>
              </div>
            </div>
            <ul className="tips">
              <li>Put the cheki on a dark, plain surface.</li>
              <li>Shoot from straight above with the flash off.</li>
              <li>If there's glare, tilt the phone slightly.</li>
              <li>Already scanned in Instax UP!? Choose “Use photo as is”.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
