// Practice view: notes fall onto a keyboard. Learn = with sound, Practice = silent (you play on your real piano).
const $ = (id) => document.getElementById(id);
const LEFT = "#2fd3c3", RIGHT = "#a774ff";                    // left hand (below middle C), right hand
const isBlack = (p) => [1, 3, 6, 8, 10].includes(p % 12);

let song = [], title = "", t = -2, playing = false, last = 0, sound = true, ctx = null;
const started = new Set();

export function setSong(notes, name) {
  song = notes.map((n) => ({ ...n })).sort((a, b) => a.start - b.start);
  title = name; t = -2; playing = false; started.clear(); $("pPlay").textContent = "Play";
  info(); draw();
}
function info() {
  const end = song.length ? Math.max(...song.map((n) => n.start + n.dur)) : 0;
  $("pracInfo").textContent = song.length ? `${title} · ${song.length} notes · ${end.toFixed(0)} s` : "";
}

// ---------------------------------------------------------------- keyboard geometry
function layout(w) {
  let lo = 48, hi = 84;                                          // at least C3..C6
  if (song.length) { lo = Math.min(lo, ...song.map((n) => n.pitch)); hi = Math.max(hi, ...song.map((n) => n.pitch)); }
  lo = Math.max(21, lo - (lo % 12)); hi = Math.min(108, hi + (11 - (hi % 12)));
  const whites = []; for (let p = lo; p <= hi; p++) if (!isBlack(p)) whites.push(p);
  const ww = w / whites.length, keys = new Map();
  whites.forEach((p, i) => keys.set(p, { x: i * ww, w: ww, black: false }));
  for (let p = lo; p <= hi; p++) if (isBlack(p) && keys.has(p - 1)) keys.set(p, { x: keys.get(p - 1).x + ww * 0.68, w: ww * 0.64, black: true });
  return keys;
}

// ---------------------------------------------------------------- drawing
function draw() {
  const c = $("fall"), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const g = c.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const kh = Math.min(110, h * 0.22), top = h - kh, ahead = +$("ahead").value;
  const bg = g.createLinearGradient(0, 0, 0, top); bg.addColorStop(0, "#07090d"); bg.addColorStop(1, "#111827");
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const keys = layout(w);
  // octave guides (lines from every C)
  g.strokeStyle = "rgba(255,255,255,.06)"; g.lineWidth = 1;
  for (const [p, k] of keys) if (p % 12 === 0) { g.beginPath(); g.moveTo(k.x, 0); g.lineTo(k.x, top); g.stroke(); }
  // falling notes
  const active = new Map();
  for (const n of song) {
    if (n.start > t + ahead) break;
    if (n.start + n.dur < t) continue;
    const k = keys.get(n.pitch); if (!k) continue;
    const y1 = top - ((n.start - t) / ahead) * top, y0 = top - ((n.start + n.dur - t) / ahead) * top;
    const col = n.pitch < 60 ? LEFT : RIGHT;
    const x = k.x + 1.5, bw = k.w - 3, yA = Math.max(0, y0), yB = Math.min(top, y1);
    if (yB > yA) {
      g.shadowColor = col; g.shadowBlur = 14; g.fillStyle = col; g.globalAlpha = 0.55 + 0.45 * (n.vel ?? 0.8);
      roundRect(g, x, yA, bw, Math.max(4, yB - yA), Math.min(6, bw / 2)); g.fill();
      g.shadowBlur = 0; g.globalAlpha = 1;
    }
    if (n.start <= t && t < n.start + n.dur) active.set(n.pitch, col);
  }
  // hit line
  g.fillStyle = "rgba(255,255,255,.35)"; g.fillRect(0, top - 2, w, 2);
  // keyboard: white keys, then black keys on top
  for (const [p, k] of keys) if (!k.black) {
    g.fillStyle = active.has(p) ? active.get(p) : "#eef1f5"; g.fillRect(k.x + .5, top, k.w - 1, kh);
    if (p === 60) { g.fillStyle = "#9aa3b2"; g.font = `${Math.max(9, k.w * .4)}px sans-serif`; g.textAlign = "center"; g.fillText("C4", k.x + k.w / 2, h - 6); }
  }
  for (const [p, k] of keys) if (k.black) {
    g.fillStyle = active.has(p) ? active.get(p) : "#1a1d23"; g.fillRect(k.x, top, k.w, kh * 0.62);
  }
  if (t < 0 && playing) { g.fillStyle = "rgba(255,255,255,.8)"; g.font = "600 42px sans-serif"; g.textAlign = "center"; g.fillText(String(Math.ceil(-t)), w / 2, top / 2); }
}
function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ---------------------------------------------------------------- time and sound
function note(n) {
  if (!sound) return;
  ctx = ctx || new AudioContext();
  const o = ctx.createOscillator(), a = ctx.createGain(), s = ctx.currentTime, dur = Math.max(.15, n.dur / (+$("speed").value / 100));
  o.type = "triangle"; o.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
  a.gain.setValueAtTime(0, s); a.gain.linearRampToValueAtTime(.16 * (.4 + .6 * (n.vel ?? .8)), s + .01);
  a.gain.exponentialRampToValueAtTime(.001, s + dur);
  o.connect(a).connect(ctx.destination); o.start(s); o.stop(s + dur + .05);
}
function frame(now) {
  if (!playing) return;
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  t += dt * (+$("speed").value / 100);
  for (let i = 0; i < song.length && song[i].start <= t; i++) if (!started.has(i) && song[i].start > t - .1) { started.add(i); note(song[i]); }
  const end = song.length ? Math.max(...song.map((n) => n.start + n.dur)) : 0;
  if (t > end + 1) { playing = false; $("pPlay").textContent = "Play"; t = end + 1; }
  draw();
  if (playing) requestAnimationFrame(frame);
}
function toggle() {
  if (!song.length) return;
  playing = !playing; $("pPlay").textContent = playing ? "Pause" : "Play";
  if (playing) { ctx = ctx || (sound ? new AudioContext() : null); last = performance.now(); requestAnimationFrame(frame); }
}
function mode(learn) {
  sound = learn;
  $("mLearn").setAttribute("aria-checked", String(learn)); $("mPractice").setAttribute("aria-checked", String(!learn));
}

// ---------------------------------------------------------------- MIDI files (format 0 and 1, tempo map)
export function parseMidi(buf) {
  const d = new DataView(buf); let p = 0;
  const str = (n) => { let s = ""; for (let i = 0; i < n; i++) s += String.fromCharCode(d.getUint8(p + i)); p += n; return s; };
  const u32 = () => { const v = d.getUint32(p); p += 4; return v; }, u16 = () => { const v = d.getUint16(p); p += 2; return v; };
  const vlq = () => { let v = 0, b; do { b = d.getUint8(p++); v = (v << 7) | (b & 127); } while (b & 128); return v; };
  if (str(4) !== "MThd") throw new Error("not a MIDI file");
  u32(); u16(); const ntr = u16(), div = u16();
  if (div & 0x8000) throw new Error("SMPTE time is not supported");
  const tempos = [[0, 500000]], raw = [];
  for (let tr = 0; tr < ntr; tr++) {
    if (str(4) !== "MTrk") throw new Error("broken track");
    const end = p + u32() + 0; let tick = 0, run = 0; const open = new Map();
    while (p < end) {
      tick += vlq(); let st = d.getUint8(p);
      if (st & 128) p++; else st = run;
      if (st === 0xff) { const ty = d.getUint8(p++), len = vlq();
        if (ty === 0x51) tempos.push([tick, (d.getUint8(p) << 16) | (d.getUint8(p + 1) << 8) | d.getUint8(p + 2)]);
        p += len; continue; }
      if (st === 0xf0 || st === 0xf7) { p += vlq(); continue; }
      run = st; const hi = st & 0xf0, a = d.getUint8(p++), b = (hi === 0xc0 || hi === 0xd0) ? 0 : d.getUint8(p++);
      if ((st & 15) === 9) continue;                                // channel 10 = drums
      if (hi === 0x90 && b > 0) open.set(a, [tick, b]);
      else if (hi === 0x80 || (hi === 0x90 && b === 0)) { const o = open.get(a); if (o) { raw.push([o[0], tick, a, o[1]]); open.delete(a); } }
    }
    p = end;
  }
  tempos.sort((x, y) => x[0] - y[0]);
  const sec = (tick) => { let s = 0, lt = 0, us = 500000;
    for (const [tt, u] of tempos) { if (tt > tick) break; s += (tt - lt) * us / div / 1e6; lt = tt; us = u; }
    return s + (tick - lt) * us / div / 1e6; };
  return raw.map(([a, b, pitch, vel]) => ({ pitch, start: sec(a), dur: Math.max(.05, sec(b) - sec(a)), vel: vel / 127 }));
}

// ---------------------------------------------------------------- wiring
$("pPlay").addEventListener("click", toggle);
$("pRestart").addEventListener("click", () => { t = -2; started.clear(); draw(); });
$("mLearn").addEventListener("click", () => mode(true));
$("mPractice").addEventListener("click", () => mode(false));
$("speed").addEventListener("input", () => { $("speedOut").textContent = `${$("speed").value} %`; });
$("ahead").addEventListener("input", () => { $("aheadOut").textContent = `${$("ahead").value} s`; draw(); });
$("midiIn").addEventListener("change", async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try { setSong(parseMidi(await f.arrayBuffer()), f.name.replace(/\.midi?$/i, "")); }
  catch (err) { $("pracInfo").textContent = `This MIDI file could not be read (${err.message}).`; }
  e.target.value = "";
});
window.addEventListener("resize", draw);
