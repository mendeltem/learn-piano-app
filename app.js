// Learn Piano -- audio to notes in the browser (Basic Pitch), shown as a score (abcjs) and a piano roll.
import { BasicPitch, addPitchBendsToNoteEvents, noteFramesToTime, outputToNotesPoly }
  from "https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/+esm";

import { setSong, toggle as fallToggle, stop as fallStop, draw as fallDraw, setBeamsOnly } from "./practice.js";

const $ = (id) => document.getElementById(id);
const SR = 22050;                       // Basic Pitch works on mono audio at 22.05 kHz
const FRAME_S = 256 / SR;               // one model frame
const SENS = { 1: [0.7, 0.45, "low"], 2: [0.6, 0.38, "lower"], 3: [0.5, 0.3, "medium"], 4: [0.4, 0.25, "higher"], 5: [0.3, 0.2, "high"] };

let model = null;
let lastOutput = null;                  // {frames, onsets, contours} of the last recording, so sliders re-transcribe
let notes = [];                         // [{pitch, start, dur, vel}] in seconds

// ---------------------------------------------------------------- example (shown before the first recording)
const EXAMPLE = (() => {                // "Ode to Joy", first phrase, right hand, with a C chord in the left hand
  const mel = [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62];
  const lens = [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5, .5, 2];
  const beat = 60 / 90; let t = 0; const out = [];
  mel.forEach((p, i) => { out.push({ pitch: p, start: t, dur: lens[i] * beat * .95, vel: .8 }); t += lens[i] * beat; });
  [[48, 0], [55, 0], [43, 4], [48, 8], [43, 12]].forEach(([p, b]) => out.push({ pitch: p, start: b * beat, dur: 3.8 * beat, vel: .6 }));
  return out;
})();

// ---------------------------------------------------------------- model
function status(text) { $("status").textContent = text; }
function progress(p) { $("progress").style.width = `${Math.round(p * 100)}%`; }

async function loadModel() {
  try {
    model = new BasicPitch("model/model.json");
    await model.model;
    status("ready");
  } catch (e) {
    status(`The model could not be loaded (${e.message}). Reload the page.`);
  }
}

// ---------------------------------------------------------------- audio input
async function toMono22k(audioBuffer) {
  const len = Math.ceil(audioBuffer.duration * SR);
  const off = new OfflineAudioContext(1, len, SR);
  const src = off.createBufferSource(); src.buffer = audioBuffer; src.connect(off.destination); src.start();
  const out = await off.startRendering();
  return out.getChannelData(0);
}

let rec = null;                          // {ctx, stream, node, chunks, rate}
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks = [];
    node.onaudioprocess = (ev) => chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
    src.connect(node); node.connect(ctx.destination);
    rec = { ctx, stream, node, chunks, t0: performance.now() };
    $("rec").classList.add("recording"); $("rec").textContent = "■"; $("rec").title = "Stop";
    tick();
  } catch (e) {
    status(`No microphone (${e.name}). Allow the microphone for this page, or upload a recording instead.`);
  }
}
function tick() {
  if (!rec) return;
  status(`recording ${((performance.now() - rec.t0) / 1000).toFixed(0)} s`);
  setTimeout(tick, 500);
}
async function stopRecording() {
  const { ctx, stream, node, chunks } = rec; rec = null;
  node.disconnect(); stream.getTracks().forEach((t) => t.stop());
  $("rec").classList.remove("recording"); $("rec").textContent = "●"; $("rec").title = "Record";
  const n = chunks.reduce((a, c) => a + c.length, 0);
  if (n < ctx.sampleRate * 0.5) { status("The recording was too short. Play for at least a second."); return; }
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  let o = 0; for (const c of chunks) { buf.getChannelData(0).set(c, o); o += c.length; }
  await ctx.close();
  await transcribe(await toMono22k(buf));
}
async function fromFile(file) {
  status(`Reading ${file.name}…`);
  try {
    const ctx = new AudioContext();
    const buf = await ctx.decodeAudioData(await file.arrayBuffer());
    await ctx.close();
    await transcribe(await toMono22k(buf));
  } catch (e) {
    status(`This file could not be read as audio (${e.message}). Try mp3, m4a, wav or ogg.`);
  }
}

// ---------------------------------------------------------------- transcription
async function transcribe(samples) {
  if (!model) { status("The model is still loading -- try again in a moment."); return; }
  status(`listening… ${(samples.length / SR).toFixed(0)} s`); progress(0);
  const frames = [], onsets = [], contours = [];
  await model.evaluateModel(samples, (f, o, c) => { frames.push(...f); onsets.push(...o); contours.push(...c); }, (p) => progress(p));
  lastOutput = { frames, onsets, contours };
  notesFromOutput();
}
function notesFromOutput() {
  if (!lastOutput) return;
  const [onT, frT] = SENS[$("sens").value];
  const minFrames = Math.max(2, Math.round($("minlen").value / 1000 / FRAME_S));
  const ev = noteFramesToTime(addPitchBendsToNoteEvents(lastOutput.contours,
    outputToNotesPoly(lastOutput.frames, lastOutput.onsets, onT, frT, minFrames)));
  notes = ev.filter((n) => n.pitchMidi >= 21 && n.pitchMidi <= 108)
    .map((n) => ({ pitch: n.pitchMidi, start: n.startTimeSeconds, dur: n.durationSeconds, vel: Math.min(1, n.amplitude) }))
    .sort((a, b) => a.start - b.start || a.pitch - b.pitch);
  show(false);
  status(notes.length ? `${notes.length} notes` : "no notes -- play louder or raise the sensitivity (⚙)");
}

// ---------------------------------------------------------------- score (ABC notation)
const NAMES = ["C", "^C", "D", "^D", "E", "F", "^F", "G", "^G", "A", "^A", "B"];
function abcPitch(m) {
  const name = NAMES[m % 12], oct = Math.floor(m / 12) - 1;       // MIDI 60 = C4
  const letter = name.replace("^", ""), acc = name.startsWith("^") ? "^" : "";
  if (oct >= 5) return acc + letter.toLowerCase() + "'".repeat(oct - 5);
  return acc + letter + ",".repeat(Math.max(0, 4 - oct));
}
function abcLen(n) { return n === 1 ? "" : String(n); }            // unit = 1/16
function voiceAbc(list, total) {
  // list: [{s, d, pitches}] on a 16th grid; written as chords and rests, split at bar lines with ties
  const bar = 16; let out = "", pos = 0;
  const put = (tok, len, tie) => {
    while (len > 0) {
      const room = bar - (pos % bar), l = Math.min(len, room);
      // write l as readable pieces (16, 12, 8, 6, 4, 3, 2, 1 sixteenths), tied for notes
      let rest = l;
      while (rest > 0) {
        const piece = [16, 12, 8, 6, 4, 3, 2, 1].find((v) => v <= rest);
        rest -= piece;
        out += tok(piece) + ((rest > 0 || len > l) && tie ? "-" : "") + " ";
      }
      pos += l; len -= l;
      if (pos % bar === 0) out += "| ";
    }
  };
  for (const ev of list) {
    if (ev.s > pos) put((l) => "z" + abcLen(l), ev.s - pos, false);
    if (ev.s < pos) continue;                                      // overlaps the previous chord: drop
    const ps = ev.pitches.map(abcPitch);
    const chord = (l) => (ps.length > 1 ? `[${ps.join("")}]` : ps[0]) + abcLen(l);
    put(chord, ev.d, true);
  }
  if (pos < total) put((l) => "z" + abcLen(l), total - pos, false);
  return out.trim().replace(/\|\s*$/, "") + " |]";
}
function toAbc(list, bpm) {
  const q = 60 / bpm / 4;                                          // seconds per 16th
  // durations snap to values a reader expects (16ths): whole, dotted half, half, dotted quarter, quarter, dotted 8th, 8th, 16th
  const NICE = [16, 12, 8, 6, 4, 3, 2, 1];
  const snap = (x) => NICE.reduce((b, v) => (Math.abs(v - x) < Math.abs(b - x) ? v : b), 16);
  const ev = list.map((n) => ({ p: n.pitch, s: Math.round(n.start / q), d: snap(Math.max(1, Math.min(16, n.dur / q))) }));
  const voice = (hand) => {
    const by = new Map();
    ev.filter((e) => (hand === "R" ? e.p >= 60 : e.p < 60)).forEach((e) => {
      const g = by.get(e.s) || { s: e.s, d: e.d, pitches: [] };
      g.pitches.push(e.p); g.d = Math.min(g.d, e.d); by.set(e.s, g);
    });
    const arr = [...by.values()].sort((a, b) => a.s - b.s);
    for (let i = 0; i < arr.length - 1; i++) arr[i].d = Math.min(arr[i].d, arr[i + 1].s - arr[i].s);
    arr.forEach((g) => g.pitches.sort((a, b) => a - b));
    return arr;
  };
  const end = ev.reduce((m, e) => Math.max(m, e.s + e.d), 16);
  const total = Math.ceil(end / 16) * 16;
  return `X:1\nM:4/4\nL:1/16\nQ:1/4=${bpm}\nK:C\n%%staves {1 2}\nV:1 clef=treble\nV:2 clef=bass\n` +
         `[V:1] ${voiceAbc(voice("R"), total)}\n[V:2] ${voiceAbc(voice("L"), total)}\n`;
}

// ---------------------------------------------------------------- piano roll
function drawRoll(list) {
  const c = $("roll"), dpr = window.devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr;
  const g = c.getContext("2d"); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  if (!list.length) return;
  const css = getComputedStyle(document.documentElement);
  const lo = Math.min(...list.map((n) => n.pitch)) - 2, hi = Math.max(...list.map((n) => n.pitch)) + 2;
  const end = Math.max(...list.map((n) => n.start + n.dur)) || 1;
  const x = (t) => 8 + (t / end) * (w - 16), y = (p) => h - 8 - ((p - lo) / (hi - lo)) * (h - 16);
  g.strokeStyle = css.getPropertyValue("--line"); g.lineWidth = 1;
  for (let p = Math.ceil(lo / 12) * 12; p <= hi; p += 12) { g.beginPath(); g.moveTo(0, y(p)); g.lineTo(w, y(p)); g.stroke(); }
  const key = css.getPropertyValue("--key").trim();
  for (const n of list) {
    g.globalAlpha = .35 + .65 * n.vel; g.fillStyle = key;
    g.fillRect(x(n.start), y(n.pitch) - 3, Math.max(3, x(n.start + n.dur) - x(n.start)), 6);
  }
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------- show
function show(example) {
  const list = example ? EXAMPLE : notes;
  window.ABCJS.renderAbc("sheet", toAbc(list, +$("bpm").value), { responsive: "resize", paddingleft: 0, paddingright: 0 });
  $("play").disabled = !list.length; $("midi").disabled = !list.length;
  setSong(list, example ? "Ode to Joy (example)" : "your recording");
  if (example) status("example: Ode to Joy");
}

// ---------------------------------------------------------------- playback
let playCtx = null;
function play() {
  const list = notes.length ? notes : EXAMPLE;
  if (playCtx) { playCtx.close(); playCtx = null; $("play").textContent = "▶"; return; }
  playCtx = new AudioContext(); const t0 = playCtx.currentTime + .1;
  for (const n of list) {
    const o = playCtx.createOscillator(), a = playCtx.createGain();
    o.type = "triangle"; o.frequency.value = 440 * 2 ** ((n.pitch - 69) / 12);
    const s = t0 + n.start, e = s + Math.max(.12, n.dur);
    a.gain.setValueAtTime(0, s); a.gain.linearRampToValueAtTime(.18 * (.4 + .6 * n.vel), s + .01);
    a.gain.exponentialRampToValueAtTime(.001, e);
    o.connect(a).connect(playCtx.destination); o.start(s); o.stop(e + .05);
  }
  $("play").textContent = "■";
  const end = Math.max(...list.map((n) => n.start + n.dur));
  const me = playCtx; setTimeout(() => { if (playCtx === me) { playCtx.close(); playCtx = null; $("play").textContent = "▶"; } }, (end + .5) * 1000);
}

// ---------------------------------------------------------------- MIDI file
function midiFile(list, bpm) {
  const ppq = 480, spt = 60 / bpm / ppq;                           // seconds per tick
  const evs = [];
  for (const n of list) {
    const on = Math.round(n.start / spt), off = Math.round((n.start + n.dur) / spt);
    evs.push([on, 0x90, n.pitch, Math.max(1, Math.round(n.vel * 110))], [off, 0x80, n.pitch, 0]);
  }
  evs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const vlq = (v) => { const b = [v & 0x7f]; while ((v >>= 7)) b.unshift((v & 0x7f) | 0x80); return b; };
  const mpq = Math.round(60e6 / bpm);
  let trk = [0, 0xff, 0x51, 3, (mpq >> 16) & 255, (mpq >> 8) & 255, mpq & 255], last = 0;
  for (const [t, st, p, v] of evs) { trk.push(...vlq(t - last), st, p, v); last = t; }
  trk.push(0, 0xff, 0x2f, 0);
  const u32 = (v) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, ...u32(6), 0, 0, 0, 1, (ppq >> 8) & 255, ppq & 255,
                         0x4d, 0x54, 0x72, 0x6b, ...u32(trk.length), ...trk]);
}
function downloadMidi() {
  const list = notes.length ? notes : EXAMPLE;
  const url = URL.createObjectURL(new Blob([midiFile(list, +$("bpm").value)], { type: "audio/midi" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `learn-piano-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.mid` });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------- wiring
$("rec").addEventListener("click", () => (rec ? stopRecording() : startRecording()));
$("file").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) fromFile(f); e.target.value = ""; });
$("play").addEventListener("click", play);
$("midi").addEventListener("click", downloadMidi);
$("bpm").addEventListener("input", () => { $("bpmOut").textContent = `${$("bpm").value} BPM`; show(!notes.length); });
$("sens").addEventListener("input", () => { $("sensOut").textContent = SENS[$("sens").value][2]; notesFromOutput(); });
$("minlen").addEventListener("input", () => { $("minlenOut").textContent = `${$("minlen").value} ms`; notesFromOutput(); });
// one play button: in the score view it plays the notes, in the falling view it runs the falling notes
const falling = () => document.body.classList.contains("falling");
$("play").removeEventListener("click", play);
$("play").addEventListener("click", () => (falling() ? fallToggle() : play()));
function view(v) {                          // "score" | "falling" | "piano"
  if (playCtx) play();                       // stop the score playback
  const fall = v !== "score";
  if (!fall) fallStop();
  setBeamsOnly(v === "piano");
  document.body.classList.toggle("falling", fall);
  $("sheet").hidden = fall; $("fall").hidden = !fall;              // explicit: abcjs sets its own styles on #sheet
  for (const [id, name] of [["vScore", "score"], ["vFall", "falling"], ["vPiano", "piano"]]) $(id).setAttribute("aria-pressed", String(v === name));
  if (fall) requestAnimationFrame(fallDraw);
}
$("vScore").addEventListener("click", () => view("score"));
$("vFall").addEventListener("click", () => view("falling"));
$("vPiano").addEventListener("click", () => view("piano"));
window.addEventListener("song", (e) => { notes = e.detail.notes; show(false); status(`${e.detail.name}: ${notes.length} notes`); view("falling"); });
show(true);
if (["falling", "piano"].includes(location.hash.slice(1))) view(location.hash.slice(1));   // #falling, #piano open that view
loadModel();
// installable app (PWA): the service worker keeps the page, the model and the libraries for offline use
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
