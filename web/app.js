// DJ Set live dashboard — polls /api/now, draws the set arc, waveform & Camelot wheel.
const $ = (id) => document.getElementById(id);
const fmt = (ms) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

let arcChart, waveChart, setData = null, lastTrackId = null;

const ACCENT = "#7c5cff", ACCENT2 = "#19e3b1", WARM = "#ff7a59", DIM = "#8a90a8";

async function loadSet() {
  const r = await fetch("/api/set");
  if (!r.ok) return;
  setData = await r.json();
  $("setStats").textContent =
    `${setData.count} tracks · ${setData.compatible_pct}% key-compatible transitions`;
  drawArc();
}

function drawArc() {
  const ctx = $("arcChart");
  const labels = setData.actual_curve.map((_, i) => i);
  if (arcChart) arcChart.destroy();
  arcChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "target", data: setData.target_curve, borderColor: DIM,
          borderDash: [5, 5], borderWidth: 1, pointRadius: 0, tension: 0.4 },
        { label: "set energy", data: setData.actual_curve, borderColor: ACCENT,
          backgroundColor: "rgba(124,92,255,0.12)", fill: true, borderWidth: 2,
          pointRadius: 0, tension: 0.35 },
        { label: "pos", data: [], borderColor: WARM, pointRadius: 0, borderWidth: 0 },
      ],
    },
    options: baseOpts({ yMax: 1 }),
  });
}

function markPosition(pos) {
  if (!arcChart || pos == null) return;
  const n = setData.actual_curve.length;
  const line = setData.actual_curve.map((_, i) => (i === pos ? 1 : null));
  arcChart.data.datasets[2].data = line;
  arcChart.data.datasets[2].borderWidth = 0;
  arcChart.data.datasets[2].pointRadius = setData.actual_curve.map((_, i) =>
    i === pos ? 6 : 0);
  arcChart.data.datasets[2].pointBackgroundColor = WARM;
  arcChart.update("none");
  $("posLabel").textContent = `· track ${pos + 1}/${n}`;
}

function drawWave(curves, progressFrac) {
  const wf = (curves && curves.waveform) || [];
  const en = (curves && curves.energy_curve) || [];
  const labels = wf.map((_, i) => i);
  const cut = Math.floor((progressFrac || 0) * wf.length);
  const played = wf.map((v, i) => (i <= cut ? v : null));
  if (waveChart) waveChart.destroy();
  waveChart = new Chart($("waveChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { data: wf, borderColor: "#2c3147", borderWidth: 1, pointRadius: 0,
          fill: true, backgroundColor: "rgba(40,46,70,0.4)", tension: 0.2 },
        { data: played, borderColor: ACCENT2, borderWidth: 1.4, pointRadius: 0,
          fill: true, backgroundColor: "rgba(25,227,177,0.10)", tension: 0.2 },
        { data: en.map((v) => v * (Math.max(...wf) || 1)), borderColor: WARM,
          borderWidth: 1.5, pointRadius: 0, tension: 0.4 },
      ],
    },
    options: baseOpts({ yMax: undefined }),
  });
}

function baseOpts({ yMax }) {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: { display: false, grid: { display: false } },
      y: { display: false, min: 0, max: yMax, grid: { display: false } },
    },
  };
}

// Camelot wheel — highlight current key + compatible neighbours
function drawWheel(camelot) {
  const c = $("wheel"), g = c.getContext("2d");
  const cx = 75, cy = 75, R = 64;
  g.clearRect(0, 0, 150, 150);
  if (!camelot) return;
  const num = parseInt(camelot), letter = camelot.slice(-1);
  const compat = new Set([
    `${num}${letter}`,
    `${(num % 12) + 1}${letter}`,
    `${((num + 10) % 12) + 1}${letter}`,
    `${num}${letter === "A" ? "B" : "A"}`,
  ]);
  for (let i = 1; i <= 12; i++) {
    const ang = ((i - 1) / 12) * 2 * Math.PI - Math.PI / 2;
    for (const [ring, L] of [[R, "B"], [R - 22, "A"]]) {
      const x = cx + Math.cos(ang) * ring, y = cy + Math.sin(ang) * ring;
      const code = `${i}${L}`;
      const on = code === camelot, ok = compat.has(code);
      g.beginPath(); g.arc(x, y, on ? 9 : 7, 0, 2 * Math.PI);
      g.fillStyle = on ? ACCENT : ok ? "rgba(25,227,177,0.5)" : "#222637";
      g.fill();
      g.fillStyle = on ? "#fff" : ok ? "#cfe" : "#555c74";
      g.font = `${on ? 9 : 7}px sans-serif`; g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(code, x, y);
    }
  }
}

async function tick() {
  try {
    const r = await fetch("/api/now");
    const d = await r.json();
    $("err").textContent = d.error ? "⚠ " + d.error : "";
    const now = d.now;
    if (now) {
      $("nowTitle").textContent = now.name;
      $("nowArtist").textContent = now.artists;
      if (now.album_art) $("art").src = now.album_art;
      $("bCam").textContent = now.camelot || "—";
      $("bBpm").textContent = (now.bpm ? now.bpm.toFixed(0) : "—") + " BPM";
      $("bKey").textContent = now.key_name || "—";
      $("bEnergy").textContent = "energy " + (now.energy != null ? now.energy.toFixed(2) : "—");
      $("nowTrans").textContent = now.transition ? "↳ " + now.transition : "";
      const frac = now.duration_ms ? now.progress_ms / now.duration_ms : 0;
      $("progBar").style.width = (frac * 100).toFixed(1) + "%";
      drawWheel(now.camelot);
      if (now.id !== lastTrackId) { drawWave(now.curves, frac); lastTrackId = now.id; }
      else if (waveChart) {
        const cut = Math.floor(frac * (now.curves?.waveform?.length || 0));
        waveChart.data.datasets[1].data =
          (now.curves?.waveform || []).map((v, i) => (i <= cut ? v : null));
        waveChart.update("none");
      }
    }
    markPosition(d.pos);
    renderUpnext(d.upnext);
  } catch (e) { $("err").textContent = "⚠ " + e.message; }
}

function renderUpnext(list) {
  const ul = $("upnextList");
  ul.innerHTML = "";
  (list || []).forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="cam">${t.camelot}</span>
      <div class="uinfo"><div class="uname">${t.name}</div>
      <div class="umeta">${t.artists} · ${t.transition}</div></div>
      <span class="ubpm">${t.bpm.toFixed(0)}</span>`;
    ul.appendChild(li);
  });
}

document.querySelectorAll(".controls button").forEach((b) =>
  b.addEventListener("click", () =>
    fetch("/api/control/" + b.dataset.act, { method: "POST" })));

loadSet();
setInterval(tick, 1000);
tick();
