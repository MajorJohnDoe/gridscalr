/**
 * Interactive "How it works" demo for the public site.
 *
 * Everything is local and dependency-free: the plan is a static WebP, the app
 * chrome is HTML/CSS, and every sound is synthesized with the Web Audio API.
 * Audio is never started before an explicit visitor gesture (the play button or
 * a mode button); the play gate is the reason the code waits for a click.
 *
 * The three scenes run on one virtual clock, so a scene pauses when the section
 * leaves the viewport or the tab is hidden and resumes where it stopped.
 */
(() => {
  "use strict";

  const root = document.querySelector("[data-hiw]");
  if (!root) return;

  document.documentElement.classList.add("hiw-ready");

  const lang = document.documentElement.lang === "sv" ? "sv" : "en";
  const locale = lang === "sv" ? "sv-SE" : "en-GB";

  const COPY = {
    en: {
      calibrate: "Calibrate",
      area: "Area",
      count: "Count",
      hintCalibrate: "Pick a known dimension or enter the 1:N scale",
      hintArea: "Click each corner · Enter or double-click to finish · Shift locks the angle",
      hintCount: "Click the doors; windows and fixtures are added automatically",
      calibrating: "Calibrating …",
      calibrated: "Calibrated · 1:100",
      selectMeasurement: "Select a measurement",
      storyAreaSub: "Perimeter 88 m · Page 1 · Measurements · 4 points",
      properties: "Properties",
      rooms: "Rooms",
      floor: "Floor",
      warehouse: "Warehouse",
      itemOne: "1 item",
      itemNone: "0 items",
      roomsCount: (n) => `${n} ${n === 1 ? "room" : "rooms"}`,
      objectsCount: (n) => `${n} ${n === 1 ? "object" : "objects"}`,
      measuring: "Measuring …",
      drawingRoom: (name, n, total) => `Drawing ${name} · ${n}/${total}`,
      roomDone: (room) => `${room.name} · ${room.area}`,
      roomSub: (room) => `${room.name} · Perimeter ${room.perimeter}`,
      roomLabelValue: (room) => `${room.area} · Perimeter ${room.perimeter}`,
      roomProgress: (done, total) => `${done} of 6 rooms · ${total}`,
      roomFinal: "6 rooms · 120 m²",
      doorsStatus: (n) => `Counting doors ${n}/6`,
      windowsStatus: "Counting windows …",
      fixturesStatus: "Counting fixtures …",
      qtyDoneStatus: "19 objects · done",
      liveDoor: (n) => `Counting doors, ${n} of 6.`,
      liveArea: "6 rooms, 120 m².",
      liveQty: "120 m², 19 objects.",
      liveStory: "Calibrated plan. Warehouse 484 m², order 508,2 m² with 5 % waste.",
      liveStoryStart: "Playing the takeoff story: calibrate, then measure the warehouse.",
      liveAreaStart: "Drawing six room areas on the plan.",
      liveQtyStart: "Counting six doors, then windows and fixtures.",
      soundOn: "Sound on",
      soundOff: "Sound off",
      mute: "Mute demo sound",
      unmute: "Turn demo sound on",
      play: "Play demo",
      chipLabels: [
        "484 m²",
        "88 m",
        "6 pcs",
        "9 pcs",
        "Floor",
        "Doors",
        "Windows",
        "Order",
        "5 %",
        "CSV",
        "XLSX",
        "PDF",
      ],
    },
    sv: {
      calibrate: "Kalibrera",
      area: "Area",
      count: "Count",
      hintCalibrate: "Markera ett känt mått eller ange 1:N-skalan",
      hintArea: "Klicka i varje hörn · Enter eller dubbelklick avslutar · Skift låser vinkeln",
      hintCount: "Klicka på dörrarna; fönster och inventarier läggs till automatiskt",
      calibrating: "Kalibrerar …",
      calibrated: "Kalibrerad · 1:100",
      selectMeasurement: "Välj en mätning",
      storyAreaSub: "Omkrets 88 m · Sida 1 · Measurements · 4 punkter",
      properties: "Egenskaper",
      rooms: "Rum",
      floor: "Golv",
      warehouse: "Lager",
      itemOne: "1 objekt",
      itemNone: "0 objekt",
      roomsCount: (n) => `${n} rum`,
      objectsCount: (n) => `${n} objekt`,
      measuring: "Mäter …",
      drawingRoom: (name, n, total) => `Ritar ${name} · ${n}/${total}`,
      roomDone: (room) => `${room.name} · ${room.area}`,
      roomSub: (room) => `${room.name} · Omkrets ${room.perimeter}`,
      roomLabelValue: (room) => `${room.area} · Omkrets ${room.perimeter}`,
      roomProgress: (done, total) => `${done} av 6 rum · ${total}`,
      roomFinal: "6 rum · 120 m²",
      doorsStatus: (n) => `Räknar dörrar ${n}/6`,
      windowsStatus: "Räknar fönster …",
      fixturesStatus: "Räknar inventarier …",
      qtyDoneStatus: "19 objekt · klart",
      liveDoor: (n) => `Räknar dörrar, ${n} av 6.`,
      liveArea: "6 rum, 120 m².",
      liveQty: "120 m², 19 objekt.",
      liveStory: "Kalibrerad plan. Lager 484 m², order 508,2 m² med 5 % svinn.",
      liveStoryStart: "Spelar upp mängdningen: kalibrera och mät sedan lagret.",
      liveAreaStart: "Ritar sex rumsytor på planen.",
      liveQtyStart: "Räknar sex dörrar och sedan fönster och inventarier.",
      soundOn: "Ljud på",
      soundOff: "Ljud av",
      mute: "Stäng av demoljudet",
      unmute: "Sätt på demoljudet",
      play: "Spela upp demon",
      chipLabels: [
        "484 m²",
        "88 m",
        "6 st",
        "9 st",
        "Golv",
        "Dörrar",
        "Fönster",
        "Order",
        "5 %",
        "CSV",
        "XLSX",
        "PDF",
      ],
    },
  }[lang];

  const $ = (selector) => root.querySelector(selector);
  const $$ = (selector) => Array.from(root.querySelectorAll(selector));

  const appEl = $("[data-hiw-app]");
  const playBtn = $("[data-hiw-play]");
  const replayBtn = $("[data-hiw-replay]");
  const soundBtn = $("[data-hiw-sound]");
  const soundLabel = $("[data-hiw-sound-label]");
  const modeArea = $('[data-hiw-mode="area"]');
  const modeQty = $('[data-hiw-mode="qty"]');
  const liveEl = $("[data-hiw-live]");
  const compactStatus = $("[data-hiw-compact-status]");
  const compactTotal = $("[data-hiw-compact-total]");

  const measure = $("[data-hiw-measure]");
  const roomLabel = $("[data-hiw-room-label]");
  const roomName = $("[data-hiw-room-name]");
  const roomValue = $("[data-hiw-room-value]");
  const roomsLayer = $("[data-hiw-rooms-layer]");
  const roomPaths = $$("[data-hiw-room]");
  const roomRows = $$("[data-hiw-room-row]");
  const roomTotal = $("[data-hiw-room-total]");
  const roomArea = $("[data-hiw-room-area]");
  const roomSub = $("[data-hiw-room-sub]");

  const toolChip = $("[data-hiw-tool]");
  const toolLabel = $("[data-hiw-tool-label]");
  const toolHint = $("[data-hiw-tool-hint]");
  const railArea = $('[data-hiw-rail="area"]');
  const railCount = $('[data-hiw-rail="count"]');
  const statusChip = $("[data-hiw-status]");
  const statusText = $("[data-hiw-status-text]");
  const pageCalibrated = $("[data-hiw-page-calibrated]");
  const layerCount = $("[data-hiw-layer-count]");
  const layerItems = $("[data-hiw-layer-items]");

  const selectionKind = $("[data-hiw-selection-kind]");
  const areaBig = $("[data-hiw-area-big]");
  const areaSub = $("[data-hiw-area-sub]");
  const fieldLabel = $('[data-hiw-field="labelSize"]');
  const fieldCategory = $('[data-hiw-field="category"]');
  const fieldRoom = $('[data-hiw-field="room"]');
  const fieldColour = $('[data-hiw-field="colour"]');
  const fieldStroke = $('[data-hiw-field="stroke"]');

  const panels = $$("[data-hiw-panel]");
  const tabProps = $('[data-hiw-tab="props"]');
  const tabTakeoff = $('[data-hiw-tab="takeoff"]');

  const rows = $$("[data-hiw-row]").map((row) => {
    const value = row.querySelector("[data-hiw-value]");
    const target = Number(value.dataset.target);
    return {
      el: row,
      value,
      target,
      decimals: target % 1 === 0 ? 0 : 1,
    };
  });
  const exportChips = $$("[data-hiw-export]");

  const areaFill = $("[data-hiw-area-fill]");
  const areaOutline = $("[data-hiw-area-outline]");
  const leader = $("[data-hiw-leader]");
  const handles = $$("[data-hiw-handle]");
  const crosshair = $("[data-hiw-crosshair]");
  const calibLine = $("[data-hiw-calib-line]");
  const calibChip = $("[data-hiw-calib-chip]");

  const cursor = $("[data-hiw-cursor]");
  const cursorStatus = $("[data-hiw-cursor-status]");
  const cursorRing = $("[data-hiw-cursor-ring]");
  const badgeDoor = $('[data-hiw-badge="door"]');
  const badgeWindow = $('[data-hiw-badge="window"]');
  const doorNumbers = $$("[data-hiw-doornum]");

  const qtyDoors = $("[data-hiw-qty-doors]");
  const qtyWindows = $("[data-hiw-qty-windows]");
  const qtyFixtures = $("[data-hiw-qty-fixtures]");
  const qtyTotal = $("[data-hiw-qty-total]");
  const qtyExport = $$("[data-hiw-qexport]");

  const chipsLayer = $("[data-hiw-chips]");
  const stamp = $("[data-hiw-stamp]");

  const steps = Array.from(document.querySelectorAll("#how-it-works .steps > li"));

  const ROOMS = [
    {
      id: "office",
      name: "Open Office",
      area: "35 m²",
      value: 35,
      perimeter: "19 m",
      x: 73.2,
      y: 46.0,
      points: [
        [1402, 592],
        [1748, 592],
        [1748, 845],
        [1402, 845],
      ],
    },
    {
      id: "meetingTop",
      name: "Meeting · norr",
      area: "12,5 m²",
      value: 12.5,
      perimeter: "14,5 m",
      x: 84.5,
      y: 46.0,
      points: [
        [1758, 592],
        [1878, 592],
        [1878, 845],
        [1758, 845],
      ],
    },
    {
      id: "wc",
      name: "WC / Shower",
      area: "12,5 m²",
      value: 12.5,
      perimeter: "14,5 m",
      x: 90.4,
      y: 46.0,
      points: [
        [1888, 592],
        [2000, 592],
        [2000, 845],
        [1888, 845],
      ],
    },
    {
      id: "reception",
      name: "Reception",
      area: "25 m²",
      value: 25,
      perimeter: "20 m",
      x: 70.8,
      y: 70.5,
      points: [
        [1402, 952],
        [1642, 952],
        [1642, 1195],
        [1402, 1195],
      ],
    },
    {
      id: "meetingBottom",
      name: "Meeting · söder",
      area: "20 m²",
      value: 20,
      perimeter: "18 m",
      x: 81.4,
      y: 70.5,
      points: [
        [1652, 952],
        [1848, 952],
        [1848, 1195],
        [1652, 1195],
      ],
    },
    {
      id: "breakroom",
      name: "Breakroom",
      area: "15 m²",
      value: 15,
      perimeter: "16 m",
      x: 89.7,
      y: 70.5,
      points: [
        [1858, 952],
        [2000, 952],
        [2000, 1195],
        [1858, 1195],
      ],
    },
  ];

  const DOOR_POINTS = [
    [330, 95],
    [900, 95],
    [1240, 95],
    [290, 500],
    [290, 980],
    [820, 1185],
  ];

  const STORY_END = 3900;
  const POSTER_T = 2450;

  const AREA_SLOT = 620;
  const AREA_MOVE = 110;
  const AREA_DRAW = 360;
  const AREA_FILL = 160;
  const AREA_END = ROOMS.length * AREA_SLOT + 260;

  const QTY_DOOR_START = 300;
  const QTY_DOOR_GAP = 230;
  const QTY_DOOR_MOVE = 110;
  const QTY_DOOR_END = QTY_DOOR_START + 5 * QTY_DOOR_GAP + QTY_DOOR_MOVE;
  const QTY_WINDOW_START = 1700;
  const QTY_WINDOW_END = 2800;
  const QTY_FIXTURE_START = 2880;
  const QTY_FIXTURE_END = 3420;
  const QTY_EXPORT = 3650;
  const QTY_END = 4300;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

  let mode = "story";
  let t = POSTER_T;
  let playing = false;
  let started = false;
  let reduced = motionQuery.matches;
  let eggActive = false;
  let eggTimers = [];
  let eggGeneration = 0;
  let lastAnnounced = "";
  let lastAreaDone = 0;
  let lastDoors = 0;
  let qtyFinalAnnounced = false;
  let prevCueT = t;

  const clamp01 = (value) => Math.max(0, Math.min(1, value));
  const seg = (value, from, to) => clamp01((value - from) / (to - from));
  const easeOutCubic = (p) => 1 - Math.pow(1 - p, 3);
  const easeInOutCubic = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
  const easeOutBack = (p, s = 1.4) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);

  function formatNumber(value, decimals = 0) {
    return Number(value).toLocaleString(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  function formatArea(value) {
    const rounded = Math.round(value * 10) / 10;
    return `${formatNumber(rounded, Number.isInteger(rounded) ? 0 : 1)} m²`;
  }

  function announce(message) {
    if (!message || message === lastAnnounced) return;
    lastAnnounced = message;
    liveEl.textContent = message;
  }

  function durationFor(name) {
    if (name === "area") return AREA_END;
    if (name === "qty") return QTY_END;
    return STORY_END;
  }

  // ── sound ───────────────────────────────────────────────────────────────

  const SOUND_KEY = "gridscalr-site-sound";

  function readSoundPreference() {
    try {
      return window.localStorage.getItem(SOUND_KEY);
    } catch {
      return null;
    }
  }

  function writeSoundPreference(value) {
    try {
      window.localStorage.setItem(SOUND_KEY, value);
    } catch {
      // Storage can be unavailable in private or hardened browser modes.
    }
  }

  class Sfx {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.on = false;
      this.noiseBuffer = null;
    }

    async enable() {
      try {
        if (!this.ctx) {
          const AudioCtx = window.AudioContext || window.webkitAudioContext;
          if (!AudioCtx) return false;
          this.ctx = new AudioCtx();
          const compressor = this.ctx.createDynamicsCompressor();
          compressor.threshold.value = -16;
          compressor.knee.value = 6;
          compressor.ratio.value = 6;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.12;
          this.master = this.ctx.createGain();
          this.master.gain.value = 0.1;
          this.master.connect(compressor).connect(this.ctx.destination);
        }
        if (this.ctx.state === "suspended") await this.ctx.resume();
        this.on = true;
        return true;
      } catch {
        this.on = false;
        return false;
      }
    }

    disable() {
      this.on = false;
      this.suspend();
    }

    suspend() {
      if (this.ctx && this.ctx.state === "running") this.ctx.suspend().catch(() => {});
    }

    resume() {
      if (this.ctx && this.on && this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    }

    get ready() {
      return Boolean(this.on && this.ctx && this.ctx.state === "running");
    }

    tone({ freq = 900, dur = 0.05, type = "square", gain = 0.3, slide = 0, delay = 0 }) {
      if (!this.ready) return;
      const now = this.ctx.currentTime + delay;
      const osc = this.ctx.createOscillator();
      const volume = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(30, freq), now);
      if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + dur);
      volume.gain.setValueAtTime(0.0001, now);
      volume.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.005);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(volume).connect(this.master);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    noise({ dur = 0.15, gain = 0.2, cutoff = 1200, delay = 0 }) {
      if (!this.ready) return;
      if (!this.noiseBuffer) {
        const length = Math.floor(this.ctx.sampleRate * 0.8);
        const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
        this.noiseBuffer = buffer;
      }
      const now = this.ctx.currentTime + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(cutoff, now);
      const volume = this.ctx.createGain();
      volume.gain.setValueAtTime(0.0001, now);
      volume.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), now + 0.006);
      volume.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      src.connect(filter).connect(volume).connect(this.master);
      src.start(now);
      src.stop(now + dur + 0.02);
    }

    tick(freq = 1500, gain = 0.35) {
      this.tone({ freq, dur: 0.028, type: "square", gain, slide: 90 });
    }

    clack() {
      this.tone({ freq: 320, dur: 0.045, type: "triangle", gain: 0.32 });
      this.noise({ dur: 0.04, gain: 0.12, cutoff: 1700 });
    }

    pop() {
      this.tone({ freq: 540, dur: 0.09, type: "sine", gain: 0.28, slide: 180 });
    }

    whoosh() {
      this.noise({ dur: 0.22, gain: 0.18, cutoff: 850 });
    }

    sweep() {
      this.tone({ freq: 180, dur: 0.24, type: "sine", gain: 0.2, slide: 760 });
    }

    thock(freq = 170) {
      this.tone({ freq, dur: 0.08, type: "sine", gain: 0.38, slide: -40 });
      this.noise({ dur: 0.045, gain: 0.1, cutoff: 600 });
    }

    chime(notes = [880, 1320]) {
      notes.forEach((freq, i) =>
        this.tone({ freq, dur: 0.22, type: "sine", gain: 0.2, delay: i * 0.07 }),
      );
    }

    charge() {
      this.tone({ freq: 150, dur: 0.28, type: "sawtooth", gain: 0.12, slide: 900 });
      this.noise({ dur: 0.28, gain: 0.07, cutoff: 2000 });
    }

    boom() {
      this.tone({ freq: 55, dur: 0.38, type: "sine", gain: 0.5, slide: -18 });
      this.noise({ dur: 0.3, gain: 0.22, cutoff: 300 });
    }

    stamp() {
      this.tone({ freq: 80, dur: 0.13, type: "sine", gain: 0.5, slide: -24 });
      this.noise({ dur: 0.08, gain: 0.18, cutoff: 700 });
    }
  }

  const sfx = new Sfx();
  let soundEnabled = readSoundPreference() !== "off";

  function updateSoundButton() {
    soundBtn.setAttribute("aria-pressed", soundEnabled ? "true" : "false");
    soundBtn.setAttribute("aria-label", soundEnabled ? COPY.mute : COPY.unmute);
    soundLabel.textContent = soundEnabled ? COPY.soundOn : COPY.soundOff;
    playBtn.textContent = COPY.play;
  }

  // ── panels, tool chip and steps ─────────────────────────────────────────

  function setPanel(name) {
    for (const panel of panels) panel.hidden = panel.dataset.hiwPanel !== name;
    tabProps.textContent = name === "rooms" ? COPY.rooms : COPY.properties;
    tabProps.classList.toggle("is-active", name === "props" || name === "rooms");
    tabTakeoff.classList.toggle("is-active", name === "takeoff" || name === "qty");
  }

  function setTool(name) {
    toolChip.dataset.hiwTool = name;
    toolLabel.textContent =
      name === "area" ? COPY.area : name === "count" ? COPY.count : COPY.calibrate;
    toolHint.textContent =
      name === "area" ? COPY.hintArea : name === "count" ? COPY.hintCount : COPY.hintCalibrate;
  }

  function setRail(name) {
    railArea.classList.toggle("is-active", name === "area");
    railCount.classList.toggle("is-active", name === "count");
  }

  function setSteps(index, progress) {
    steps.forEach((step, i) => {
      const active = i === index;
      step.classList.toggle("hiw-step-active", active);
      step.classList.toggle("hiw-step-done", i < index);
      if (active) step.setAttribute("aria-current", "step");
      else step.removeAttribute("aria-current");
      step.style.setProperty("--hiw-step-progress", active ? `${clamp01(progress) * 100}%` : "0%");
    });
  }

  // ── cursor helpers ──────────────────────────────────────────────────────

  function setCursorPoint(x, y) {
    cursor.style.left = `${(x / 2151) * 100}%`;
    cursor.style.top = `${(y / 1521) * 100}%`;
  }

  function showCursor() {
    cursor.hidden = false;
  }

  function hideCursor() {
    cursor.hidden = true;
    cursorRing.classList.remove("is-pinging");
  }

  function setCursorStatus(text) {
    if (cursorStatus.textContent !== text) cursorStatus.textContent = text;
  }

  function pingRing() {
    cursorRing.classList.remove("is-pinging");
    void cursorRing.offsetWidth;
    cursorRing.classList.add("is-pinging");
  }

  function pointAt(points, fraction) {
    const scaled = clamp01(fraction) * points.length;
    const index = Math.min(points.length - 1, Math.floor(scaled));
    const local = scaled - index;
    const from = points[index];
    const to = points[(index + 1) % points.length];
    return [from[0] + (to[0] - from[0]) * local, from[1] + (to[1] - from[1]) * local];
  }

  // ── story scene ─────────────────────────────────────────────────────────

  function resetTakeoffRows() {
    for (const row of rows) {
      row.el.classList.remove("is-landed", "is-flashing");
      row.value.textContent = formatNumber(0, row.decimals);
    }
    for (const chip of exportChips) chip.classList.remove("is-on");
    stamp.classList.remove("is-shown");
    stamp.style.opacity = "";
  }

  function renderStoryTool(now) {
    const areaMode = now >= 1300;
    setTool(areaMode ? "area" : "scale");
    setRail("area");
  }

  function renderStoryPanel(now) {
    const showSelection = now >= 2050;
    selectionKind.textContent = showSelection ? COPY.area : "—";
    const areaP = easeOutCubic(seg(now, 2100, 2400));
    areaBig.textContent = showSelection ? formatArea(484 * areaP) : "—";
    areaSub.textContent = showSelection ? COPY.storyAreaSub : COPY.selectMeasurement;
    fieldLabel.textContent = now >= 2100 ? "6 pt" : "—";
    fieldCategory.textContent = now >= 2100 ? COPY.floor : "—";
    fieldRoom.textContent = now >= 2100 ? COPY.warehouse : "—";
    fieldColour.textContent = now >= 2100 ? "#4cc9f0" : "—";
    fieldStroke.textContent = now >= 2100 ? "0,75 pt" : "—";
  }

  function renderStoryTakeoff(now) {
    const switchToTakeoff = now >= 2800;
    if (!eggActive) setPanel(switchToTakeoff ? "takeoff" : "props");
    if (eggActive) return;

    rows.forEach((row, index) => {
      const start = 3000 + index * 150;
      const p = easeOutCubic(seg(now, start, start + 420));
      row.el.classList.toggle("is-landed", now >= start);
      row.value.textContent = formatNumber(row.target * p, row.decimals);
    });
    for (const chip of exportChips) {
      chip.classList.toggle("is-on", now >= Number(chip.dataset.hiwExport));
    }
  }

  function renderStorySteps(now) {
    let index = 0;
    let progress = 1;
    if (now < 1300) {
      index = 0;
      progress = now / 1300;
    } else if (now < 2800) {
      index = 1;
      progress = (now - 1300) / 1500;
    } else {
      index = 2;
      progress = clamp01((now - 2800) / 1100);
    }
    setSteps(index, progress);
  }

  function renderStory(now) {
    if (eggActive) return;

    const outlineP = easeInOutCubic(seg(now, 1450, 2100));
    areaOutline.setAttribute("stroke-dasharray", "1");
    areaOutline.setAttribute("stroke-dashoffset", String(1 - outlineP));
    areaFill.style.fillOpacity = String(0.2 * easeOutCubic(seg(now, 1900, 2250)));

    handles.forEach((handle, index) => {
      const p = easeOutBack(seg(now, 1450 + index * 150, 1690 + index * 150));
      handle.style.opacity = String(clamp01(p * 1.6));
      handle.setAttribute(
        "transform",
        `translate(${handle.dataset.x} ${handle.dataset.y}) scale(${Math.max(0, p)})`,
      );
    });

    const crosshairP = seg(now, 1400, 2100);
    if (crosshairP <= 0 || crosshairP >= 1) {
      crosshair.style.opacity = "0";
    } else {
      crosshair.style.opacity = "0.95";
      let x;
      let y;
      if (crosshairP < 0.25) {
        const q = easeInOutCubic(crosshairP / 0.25);
        x = 200 + (282 - 200) * q;
        y = 210 + (97 - 210) * q;
      } else if (crosshairP < 0.5) {
        const q = easeInOutCubic((crosshairP - 0.25) / 0.25);
        x = 282 + (1360 - 282) * q;
        y = 97;
      } else if (crosshairP < 0.75) {
        const q = easeInOutCubic((crosshairP - 0.5) / 0.25);
        x = 1360;
        y = 97 + (1180 - 97) * q;
      } else {
        const q = easeInOutCubic((crosshairP - 0.75) / 0.25);
        x = 1360 + (282 - 1360) * q;
        y = 1180;
      }
      crosshair.setAttribute("transform", `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
    }

    const leaderP = easeInOutCubic(seg(now, 2050, 2200));
    leader.setAttribute("stroke-dasharray", "1");
    leader.setAttribute("stroke-dashoffset", String(1 - leaderP));

    measure.classList.toggle("is-shown", now >= 2050);
    measure.classList.toggle("is-pulsing", now >= 2800);

    calibLine.classList.toggle("is-on", now >= 500);
    calibChip.style.opacity = String(easeOutCubic(seg(now, 800, 1100)));

    statusChip.classList.toggle("is-ok", now >= 1100);
    statusText.textContent = now >= 1100 ? COPY.calibrated : COPY.calibrating;
    pageCalibrated.style.opacity = now >= 1100 ? "1" : "0.35";

    badgeDoor.classList.toggle("is-shown", now >= 2300);
    badgeWindow.classList.toggle("is-shown", now >= 2500);
    layerCount.textContent = now >= 2300 ? "1" : "0";
    layerItems.textContent = now >= 2300 ? COPY.itemOne : COPY.itemNone;

    renderStoryTool(now);
    renderStoryPanel(now);
    renderStoryTakeoff(now);
    renderStorySteps(now);

    compactStatus.textContent = now >= 1100 ? COPY.calibrated : COPY.calibrating;
    compactTotal.textContent = formatArea(484 * easeOutCubic(seg(now, 2100, 2400)));

    if (now >= STORY_END - 1) announce(COPY.liveStory);
  }

  // ── area scene ──────────────────────────────────────────────────────────

  function resetRooms() {
    for (const path of roomPaths) {
      path.classList.remove("is-active", "is-done");
      path.style.strokeDasharray = "1";
      path.style.strokeDashoffset = "1";
      path.style.strokeOpacity = "1";
      path.style.fillOpacity = "0";
      path.style.strokeWidth = "";
    }
    for (const row of roomRows) row.classList.remove("is-active", "is-done");
    roomLabel.classList.remove("is-shown");
    roomLabel.hidden = false;
    roomTotal.textContent = formatArea(0);
    roomArea.textContent = "—";
    roomSub.textContent = COPY.measuring;
    roomPaths.forEach((path, index) => {
      path.style.fillOpacity = "0";
      if (index === 0) path.style.strokeDashoffset = "1";
    });
  }

  function renderArea(now) {
    const active = now > 0 ? Math.min(ROOMS.length - 1, Math.floor(now / AREA_SLOT)) : -1;
    let total = 0;
    let lastDone = -1;

    ROOMS.forEach((room, index) => {
      const path = roomPaths[index];
      const p = now - index * AREA_SLOT;
      const drawStart = AREA_MOVE;
      const drawEnd = AREA_MOVE + AREA_DRAW;

      if (p <= 0) {
        path.classList.remove("is-active", "is-done");
        path.style.strokeDasharray = "1";
        path.style.strokeDashoffset = "1";
        path.style.fillOpacity = "0";
        return;
      }

      if (p < drawStart) {
        path.classList.remove("is-active", "is-done");
        path.style.strokeDasharray = "1";
        path.style.strokeDashoffset = "1";
        path.style.fillOpacity = "0";
        return;
      }

      if (p < drawEnd) {
        const fraction = easeInOutCubic((p - drawStart) / AREA_DRAW);
        path.classList.add("is-active");
        path.classList.remove("is-done");
        path.style.strokeDasharray = "1";
        path.style.strokeDashoffset = String(1 - fraction);
        path.style.strokeOpacity = "1";
        path.style.fillOpacity = "0";
        return;
      }

      path.classList.remove("is-active");
      path.classList.add("is-done");
      path.style.strokeDasharray = "";
      path.style.strokeDashoffset = "0";
      path.style.strokeOpacity = "1";
      lastDone = index;
      const filled = easeOutCubic(clamp01((p - drawEnd) / AREA_FILL));
      total += room.value * filled;
    });

    if (active >= 0) {
      const activePath = roomPaths[active];
      const activeP = now - active * AREA_SLOT;
      activePath.classList.add("is-active");
      activePath.style.fillOpacity = activeP >= AREA_MOVE + AREA_DRAW ? "0.34" : "0";
    }

    roomRows.forEach((row, index) => {
      row.classList.toggle("is-active", index === active);
      row.classList.toggle("is-done", index < active);
    });

    const labelRoom = lastDone >= 0 ? ROOMS[lastDone] : null;
    if (labelRoom) {
      roomLabel.hidden = false;
      roomLabel.classList.add("is-shown");
      roomName.textContent = labelRoom.name;
      roomValue.textContent = COPY.roomLabelValue(labelRoom);
      roomLabel.style.left = `${labelRoom.x}%`;
      roomLabel.style.top = `${labelRoom.y}%`;
      roomArea.textContent = labelRoom.area;
      roomSub.textContent = COPY.roomSub(labelRoom);
    } else {
      roomLabel.classList.remove("is-shown");
      roomArea.textContent = "—";
      roomSub.textContent = COPY.measuring;
    }

    roomTotal.textContent = formatArea(total);
    layerCount.textContent = String(Math.max(0, lastDone + 1));
    layerItems.textContent = COPY.roomsCount(Math.max(0, lastDone + 1));

    const done = lastDone + 1;
    compactStatus.textContent = COPY.roomsCount(done);
    compactTotal.textContent = formatArea(total);

    setSteps(1, total / 120);

    if (now >= AREA_END) {
      setCursorStatus(COPY.roomFinal);
      hideCursor();
      announce(COPY.liveArea);
    } else if (active >= 0) {
      showCursor();
      const room = ROOMS[active];
      const p = now - active * AREA_SLOT;
      const points = room.points;
      let x;
      let y;

      if (p < AREA_MOVE) {
        const from = active === 0 ? points[0] : ROOMS[active - 1].points[0];
        const q = active === 0 ? 1 : easeInOutCubic(p / AREA_MOVE);
        x = from[0] + (points[0][0] - from[0]) * q;
        y = from[1] + (points[0][1] - from[1]) * q;
      } else if (p < AREA_MOVE + AREA_DRAW) {
        [x, y] = pointAt(points, easeInOutCubic((p - AREA_MOVE) / AREA_DRAW));
      } else {
        [x, y] = points[0];
      }
      setCursorPoint(x, y);

      setCursorStatus(
        p < AREA_MOVE + AREA_DRAW
          ? COPY.drawingRoom(room.name, active + 1, ROOMS.length)
          : COPY.roomDone(room),
      );

      if (done > lastAreaDone) {
        lastAreaDone = done;
        announce(
          done === ROOMS.length ? COPY.liveArea : COPY.roomProgress(done, formatArea(total)),
        );
      }
    }
  }

  // ── quantities scene ────────────────────────────────────────────────────

  function resetQty() {
    qtyDoors.textContent = "0";
    qtyWindows.textContent = "0";
    qtyFixtures.textContent = "0";
    qtyTotal.textContent = `${formatArea(120)} · ${COPY.objectsCount(0)}`;
    for (const chip of qtyExport) chip.classList.remove("is-on");
    for (const number of doorNumbers) number.classList.remove("is-shown");
    badgeDoor.classList.remove("is-shown");
    badgeWindow.classList.remove("is-shown");
  }

  function showAllRooms() {
    roomsLayer.classList.add("is-shown");
    for (const path of roomPaths) {
      path.classList.remove("is-active", "is-done");
      path.style.strokeDasharray = "";
      path.style.strokeDashoffset = "";
      path.style.strokeOpacity = "1";
      path.style.fillOpacity = "0.24";
      path.style.strokeWidth = "";
    }
    for (const row of roomRows) row.classList.remove("is-active", "is-done");
    roomLabel.classList.remove("is-shown");
    roomTotal.textContent = formatArea(120);
  }

  function renderQty(now) {
    const doors =
      now >= QTY_DOOR_START + QTY_DOOR_MOVE
        ? Math.min(6, Math.floor((now - QTY_DOOR_START - QTY_DOOR_MOVE) / QTY_DOOR_GAP) + 1)
        : 0;
    const windows = Math.round(
      9 * easeOutCubic(clamp01((now - QTY_WINDOW_START) / (QTY_WINDOW_END - QTY_WINDOW_START))),
    );
    const fixtures = Math.round(
      4 * easeOutCubic(clamp01((now - QTY_FIXTURE_START) / (QTY_FIXTURE_END - QTY_FIXTURE_START))),
    );
    const objects = doors + windows + fixtures;

    qtyDoors.textContent = String(doors);
    qtyWindows.textContent = String(windows);
    qtyFixtures.textContent = String(fixtures);
    qtyTotal.textContent = `${formatArea(120)} · ${COPY.objectsCount(objects)}`;

    doorNumbers.forEach((number, index) => {
      number.classList.toggle(
        "is-shown",
        now >= QTY_DOOR_START + index * QTY_DOOR_GAP + QTY_DOOR_MOVE,
      );
    });

    const finished = now >= QTY_EXPORT;
    badgeDoor.classList.toggle("is-shown", finished);
    badgeWindow.classList.toggle("is-shown", finished);
    for (const chip of qtyExport) chip.classList.toggle("is-on", finished);

    setSteps(2, clamp01((now - QTY_DOOR_START) / (QTY_EXPORT - QTY_DOOR_START)));

    compactStatus.textContent = COPY.objectsCount(objects);
    compactTotal.textContent = formatArea(120);

    if (now < QTY_DOOR_END + 80) {
      const index = Math.max(0, Math.min(5, Math.floor((now - QTY_DOOR_START) / QTY_DOOR_GAP)));
      const local = now - (QTY_DOOR_START + index * QTY_DOOR_GAP);
      const from =
        index === 0 ? [DOOR_POINTS[0][0] - 70, DOOR_POINTS[0][1] + 55] : DOOR_POINTS[index - 1];
      const to = DOOR_POINTS[index];
      const q = easeInOutCubic(clamp01(local / QTY_DOOR_MOVE));
      showCursor();
      setCursorPoint(from[0] + (to[0] - from[0]) * q, from[1] + (to[1] - from[1]) * q);
      setCursorStatus(COPY.doorsStatus(doors));
    } else if (now < QTY_EXPORT) {
      hideCursor();
      setCursorStatus(now < QTY_FIXTURE_START ? COPY.windowsStatus : COPY.fixturesStatus);
    } else {
      hideCursor();
      setCursorStatus(COPY.qtyDoneStatus);
    }

    if (doors !== lastDoors) {
      lastDoors = doors;
      if (doors > 0) announce(COPY.liveDoor(doors));
    }
    if (finished && !qtyFinalAnnounced) {
      qtyFinalAnnounced = true;
      announce(COPY.liveQty);
    }
  }

  // ── mode wiring ─────────────────────────────────────────────────────────

  function applyMode() {
    root.dataset.hiwScene = mode;
    modeArea.setAttribute("aria-pressed", mode === "area" ? "true" : "false");
    modeQty.setAttribute("aria-pressed", mode === "qty" ? "true" : "false");

    const story = mode === "story";
    roomsLayer.classList.toggle("is-shown", !story);
    measure.hidden = !story;
    roomLabel.hidden = mode !== "area";
    cursorStatus.hidden = story;

    if (story) {
      areaOutline.style.opacity = "1";
      areaFill.style.fillOpacity = "0";
      for (const handle of handles) handle.style.opacity = "0";
      measure.classList.remove("is-shown", "is-pulsing");
      badgeDoor.classList.remove("is-shown");
      badgeWindow.classList.remove("is-shown");
      setPanel("props");
      setTool("scale");
      setRail("area");
      statusChip.classList.remove("is-ok");
      statusText.textContent = COPY.calibrating;
      pageCalibrated.style.opacity = "0.35";
      layerCount.textContent = "0";
      layerItems.textContent = COPY.itemNone;
      hideCursor();
    } else {
      areaFill.style.fillOpacity = "0.1";
      for (const handle of handles) handle.style.opacity = "0";
      areaOutline.style.opacity = "0.35";
      areaOutline.setAttribute("stroke-dasharray", "");
      areaOutline.setAttribute("stroke-dashoffset", "");
      badgeDoor.classList.remove("is-shown");
      badgeWindow.classList.remove("is-shown");
      statusChip.classList.add("is-ok");
      statusText.textContent = COPY.calibrated;
      pageCalibrated.style.opacity = "1";
      layerCount.textContent = "6";
      layerItems.textContent = COPY.roomsCount(6);
      setTool(mode === "area" ? "area" : "count");
      setRail(mode === "area" ? "area" : "count");
      setPanel(mode === "area" ? "rooms" : "qty");
    }
  }

  function render() {
    if (mode === "story") renderStory(t);
    else if (mode === "area") renderArea(t);
    else renderQty(t);
  }

  function clearEgg() {
    for (const id of eggTimers) window.clearTimeout(id);
    eggTimers = [];
    eggGeneration += 1;
    eggActive = false;
    appEl.classList.remove("hiw-egg", "is-shaking");
    chipsLayer.textContent = "";
    stamp.classList.remove("is-shown");
    stamp.style.opacity = "";
  }

  function restartStory() {
    clearEgg();
    resetTakeoffRows();
    mode = "story";
    t = reduced ? STORY_END : 0;
    prevCueT = t;
    playing = !reduced;
    applyMode();
    render();
    if (reduced) announce(COPY.liveStory);
    else announce(COPY.liveStoryStart);
  }

  function setMode(next) {
    clearEgg();
    resetQty();
    resetRooms();
    mode = next;
    lastAreaDone = 0;
    lastDoors = 0;
    qtyFinalAnnounced = false;
    t = reduced ? durationFor(next) : 0;
    prevCueT = t;
    playing = !reduced;
    applyMode();
    if (next === "qty") showAllRooms();
    render();
    if (reduced) announce(next === "area" ? COPY.liveArea : COPY.liveQty);
    else announce(next === "area" ? COPY.liveAreaStart : COPY.liveQtyStart);
  }

  function openGate(focusApp) {
    if (!started) {
      started = true;
      root.classList.add("is-started");
      playBtn.hidden = true;
      replayBtn.hidden = false;
      measure.disabled = false;
      if (focusApp) appEl.focus({ preventScroll: true });
    }
    if (soundEnabled) sfx.enable();
  }

  function replayCurrent() {
    openGate(false);
    if (mode === "story") restartStory();
    else setMode(mode);
    if (reduced) {
      window.setTimeout(() => {
        if (sfx.ready) sfx.chime([880, 1320]);
      }, 120);
    }
  }

  // ── sound cues ──────────────────────────────────────────────────────────

  const storyCues = [
    { at: 300, fn: () => sfx.tick(1200, 0.35) },
    { at: 500, fn: () => sfx.sweep() },
    { at: 1100, fn: () => sfx.clack() },
    { at: 1300, fn: () => sfx.tick(1100, 0.3) },
    { at: 1450, fn: () => sfx.tick(1450, 0.4) },
    { at: 1600, fn: () => sfx.tick(1550, 0.4) },
    { at: 1750, fn: () => sfx.tick(1650, 0.4) },
    { at: 1900, fn: () => sfx.whoosh() },
    { at: 1900, fn: () => sfx.tick(1750, 0.4) },
    { at: 2050, fn: () => sfx.pop() },
    { at: 2300, fn: () => sfx.thock(165) },
    { at: 2500, fn: () => sfx.thock(205) },
    { at: 2800, fn: () => sfx.tick(1100, 0.3) },
    { at: 3000, fn: () => sfx.tick(1000, 0.35) },
    { at: 3150, fn: () => sfx.tick(1120, 0.35) },
    { at: 3300, fn: () => sfx.tick(1240, 0.35) },
    { at: 3450, fn: () => sfx.tick(1360, 0.35) },
    { at: 3600, fn: () => sfx.chime([880, 1320]) },
  ];

  const areaCues = [];
  ROOMS.forEach((room, index) => {
    const base = index * AREA_SLOT + AREA_MOVE;
    for (let step = 1; step <= 4; step += 1) {
      areaCues.push({
        at: base + (step * AREA_DRAW) / 4,
        fn: () => {
          pingRing();
          if (step === 4) sfx.clack();
          else sfx.tick(1480, 0.24);
        },
      });
    }
    areaCues.push({
      at: base + AREA_DRAW + 30,
      fn: () => sfx.pop(),
    });
  });
  areaCues.push({ at: AREA_END - 220, fn: () => sfx.chime([880, 1320]) });

  const qtyCues = [];
  for (let index = 0; index < 6; index += 1) {
    qtyCues.push({
      at: QTY_DOOR_START + index * QTY_DOOR_GAP + QTY_DOOR_MOVE,
      fn: () => {
        pingRing();
        sfx.thock(165 + index * 8);
      },
    });
  }
  qtyCues.push({ at: QTY_DOOR_END + 100, fn: () => sfx.sweep() });
  [1800, 2050, 2300, 2550, 2750].forEach((at, index) =>
    qtyCues.push({ at, fn: () => sfx.tick(1000 + index * 120, 0.24) }),
  );
  [2950, 3150, 3350].forEach((at, index) =>
    qtyCues.push({ at, fn: () => sfx.tick(1100 + index * 150, 0.26) }),
  );
  qtyCues.push({ at: QTY_EXPORT, fn: () => sfx.chime([880, 1320]) });

  function fireCues(from, to) {
    if (!sfx.ready) return;
    const list = mode === "area" ? areaCues : mode === "qty" ? qtyCues : storyCues;
    for (const cue of list) {
      if (cue.at > from && cue.at <= to) cue.fn();
    }
  }

  // ── easter egg (hidden bonus on the measurement label) ──────────────────

  function later(fn, ms) {
    const id = window.setTimeout(fn, ms);
    eggTimers.push(id);
    return id;
  }

  function fillEggRows(gen) {
    if (gen !== eggGeneration) return;
    rows.forEach((row, index) => {
      later(() => {
        if (gen !== eggGeneration) return;
        row.el.classList.add("is-landed");
        const start = performance.now();
        const tick = (now) => {
          const p = clamp01((now - start) / 260);
          row.value.textContent = formatNumber(row.target * easeOutCubic(p), row.decimals);
          if (p < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
        row.el.classList.add("is-flashing");
        later(() => row.el.classList.remove("is-flashing"), 220);
        sfx.tick(1000 + index * 120, 0.25);
      }, index * 80);
    });
    later(() => {
      if (gen !== eggGeneration) return;
      for (const chip of exportChips) chip.classList.add("is-on");
    }, 500);
    later(() => {
      if (gen !== eggGeneration) return;
      sfx.stamp();
      sfx.chime([880, 1320]);
      stamp.classList.add("is-shown");
      later(() => {
        stamp.classList.remove("is-shown");
        stamp.style.opacity = "0";
      }, 1400);
    }, 620);
  }

  function spawnBurstRing() {
    const appRect = appEl.getBoundingClientRect();
    const labelRect = measure.getBoundingClientRect();
    const ring = document.createElement("span");
    ring.className = "hiw-flash-ring";
    ring.style.left = `${labelRect.left - appRect.left + labelRect.width / 2 - 75}px`;
    ring.style.top = `${labelRect.top - appRect.top + labelRect.height / 2 - 75}px`;
    chipsLayer.append(ring);
    const anim = ring.animate(
      [
        { transform: "scale(0.2)", opacity: 0.9 },
        { transform: "scale(2.6)", opacity: 0 },
      ],
      { duration: 620, easing: "ease-out", fill: "forwards" },
    );
    anim.onfinish = () => ring.remove();
  }

  function spawnChips(gen) {
    const appRect = appEl.getBoundingClientRect();
    const labelRect = measure.getBoundingClientRect();
    const startX = labelRect.left - appRect.left + labelRect.width / 2;
    const startY = labelRect.top - appRect.top + labelRect.height / 2;
    const rowRects = rows.map((row) => {
      const rect = row.el.getBoundingClientRect();
      return {
        x: rect.left - appRect.left + rect.width * 0.72,
        y: rect.top - appRect.top + rect.height / 2,
      };
    });

    let index = 0;
    const total = 20;
    for (let i = 0; i < total; i += 1) {
      const isLine = i % 5 === 4;
      const el = document.createElement("span");
      el.className = isLine ? "hiw-chip hiw-chip--line" : "hiw-chip";
      if (isLine) el.style.width = `${18 + (i % 4) * 9}px`;
      else el.textContent = COPY.chipLabels[i % COPY.chipLabels.length];
      chipsLayer.append(el);

      const target = rowRects[i % rowRects.length];
      const targetX = target.x + (Math.random() * 18 - 9);
      const targetY = target.y + (Math.random() * 10 - 5);
      const midX = startX + (targetX - startX) * 0.45 + (Math.random() * 80 - 40);
      const midY = startY + (targetY - startY) * 0.35 - 70 - Math.random() * 70;
      const rot0 = Math.random() * 40 - 20;
      const rot1 = Math.random() * 180 - 90;

      el.style.left = `${startX}px`;
      el.style.top = `${startY}px`;

      const anim = el.animate(
        [
          { transform: `translate(-50%, -50%) rotate(${rot0}deg) scale(0.8)`, opacity: 0 },
          { opacity: 1, offset: 0.12 },
          {
            transform: `translate(calc(-50% + ${midX - startX}px), calc(-50% + ${midY - startY}px)) rotate(${rot1 * 0.5}deg) scale(1)`,
            opacity: 1,
            offset: 0.55,
          },
          {
            transform: `translate(calc(-50% + ${targetX - startX}px), calc(-50% + ${targetY - startY}px)) rotate(${rot1}deg) scale(0.9)`,
            opacity: 0,
          },
        ],
        {
          duration: 620 + Math.random() * 260,
          delay: (i % 8) * 45,
          easing: "cubic-bezier(0.18, 0.8, 0.22, 1)",
          fill: "forwards",
        },
      );
      anim.onfinish = () => {
        el.remove();
        if (gen !== eggGeneration) return;
        index += 1;
        if (index === total) fillEggRows(gen);
      };
    }
  }

  function triggerEgg() {
    if (!started || mode !== "story" || eggActive) return;
    if (!measure.classList.contains("is-shown")) return;

    if (reduced) {
      setPanel("takeoff");
      resetTakeoffRows();
      for (const row of rows) {
        row.el.classList.add("is-landed");
        row.value.textContent = formatNumber(row.target, row.decimals);
      }
      for (const chip of exportChips) chip.classList.add("is-on");
      if (sfx.ready) sfx.chime([880, 1320]);
      return;
    }

    eggActive = true;
    const gen = ++eggGeneration;
    playing = false;
    for (const id of eggTimers) window.clearTimeout(id);
    eggTimers = [];
    resetTakeoffRows();
    appEl.classList.add("hiw-egg");
    setPanel("takeoff");
    sfx.charge();

    eggTimers.push(
      window.setTimeout(() => {
        if (gen !== eggGeneration) return;
        sfx.boom();
        appEl.classList.add("is-shaking");
        eggTimers.push(window.setTimeout(() => appEl.classList.remove("is-shaking"), 260));
        spawnBurstRing();
        spawnChips(gen);
      }, 240),
    );

    eggTimers.push(
      window.setTimeout(() => {
        if (gen !== eggGeneration) return;
        appEl.classList.remove("hiw-egg");
        eggActive = false;
      }, 2600),
    );
  }

  // ── events ──────────────────────────────────────────────────────────────

  playBtn.addEventListener("click", () => {
    openGate(true);
    restartStory();
  });

  modeArea.addEventListener("click", () => {
    openGate(false);
    setMode("area");
  });

  modeQty.addEventListener("click", () => {
    openGate(false);
    setMode("qty");
  });

  replayBtn.addEventListener("click", replayCurrent);

  soundBtn.addEventListener("click", async () => {
    if (soundEnabled) {
      soundEnabled = false;
      writeSoundPreference("off");
      sfx.disable();
      updateSoundButton();
      return;
    }
    soundEnabled = true;
    writeSoundPreference("on");
    updateSoundButton();
    await sfx.enable();
  });

  measure.addEventListener("click", triggerEgg);

  // ── clock, visibility and motion preference ─────────────────────────────

  let lastFrame = performance.now();

  function isInView() {
    const rect = root.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < window.innerHeight;
  }

  function frame(now) {
    const dt = Math.min(64, now - lastFrame);
    lastFrame = now;

    if (playing && !document.hidden && isInView()) {
      const end = durationFor(mode);
      const next = Math.min(end, t + dt);
      fireCues(prevCueT, next);
      prevCueT = next;
      t = next;
      if (t >= end) playing = false;
      render();
    }

    requestAnimationFrame(frame);
  }

  function syncAudio() {
    if (document.hidden || !isInView()) sfx.suspend();
    else if (started && soundEnabled) sfx.resume();
  }

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      () => {
        lastFrame = performance.now();
        syncAudio();
      },
      { threshold: 0.05 },
    );
    observer.observe(root);
  }

  document.addEventListener("visibilitychange", () => {
    lastFrame = performance.now();
    syncAudio();
  });

  function applyReducedMotion() {
    reduced = motionQuery.matches;
    if (reduced && started) {
      t = durationFor(mode);
      prevCueT = t;
      playing = false;
      render();
      announce(mode === "story" ? COPY.liveStory : mode === "area" ? COPY.liveArea : COPY.liveQty);
    }
  }

  if (motionQuery.addEventListener) motionQuery.addEventListener("change", applyReducedMotion);

  // ── boot ────────────────────────────────────────────────────────────────

  handles.forEach((handle) => {
    const match = /translate\(([-\d.]+)\s+([-\d.]+)\)/.exec(handle.getAttribute("transform") || "");
    if (match) {
      handle.dataset.x = match[1];
      handle.dataset.y = match[2];
    }
  });

  updateSoundButton();
  applyMode();
  render();
  requestAnimationFrame(frame);
})();
