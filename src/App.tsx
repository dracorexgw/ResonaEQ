import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  AudioWaveform,
  CirclePower,
  Headphones,
  Music2,
  RadioTower,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  Waves,
} from "lucide-react";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import {
  applyEqPreview,
  getAudioDevices,
  startStandaloneEngine,
  stopStandaloneEngine,
  testDspEngine,
  testDspEngineWav,
  playDspTestTone,
  startLiveEngine,
  stopLiveEngine,
  updateLiveEq,
  getLiveSpectrum,
  savePresetFile,
  loadPresetFiles,
  deletePresetFile,
  exportPresetFile,
  getLiveLatency,
  type AudioDevice,
} from "./lib/audio";
import "./index.css";
import { ParametricEqGraph } from "./components/ParametricEqGraph";
import type { ParamBand } from "./types/audio";
import { SetupWizard } from "./components/SetupWizard";

const AUTO_START_LIVE_KEY = "resona-auto-start-live";
const LAST_INPUT_DEVICE_KEY = "resona-last-input-device";
const LAST_OUTPUT_DEVICE_KEY = "resona-last-output-device";
const defaultBands = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const freqs = ["31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
const presets = [
  {
    name: "Clean",
    desc: "Flat profile for production checks",
    bands: defaultBands,
    preamp: 0,
  },
  {
    name: "Arya Air",
    desc: "Smooth highs, open low-end",
    bands: [2, 1.5, 0, -0.5, 0, 0.5, 1, -1.5, -2, -1],
    preamp: -3,
  },
  {
    name: "Club Warm",
    desc: "More low-end pressure",
    bands: [4, 3, 2, 0, -1, -1, 0, 1, 1.5, 1],
    preamp: -5,
  },
  {
    name: "Vocal Focus",
    desc: "Forward mids and clarity",
    bands: [-1, -1, 0, 1, 2, 2, 1.5, 1, 0, -0.5],
    preamp: -3,
  },
];

type UserPreset = {
  name: string;
  mode: EqMode;
  preamp: number;
  graphicBands: number[];
  parametricBands: ParamBand[];
  favorite?: boolean;
};

const PRESET_STORAGE_KEY = "resona-user-presets";

type EqMode = "graphic" | "parametric";

const defaultParamBands: ParamBand[] = [
  {
    id: 1,
    type: "bell",
    freq: 31,
    gain: 0,
    q: 0.7,
    color: "#1ed760",
    enabled: true,
  },
  {
    id: 2,
    type: "bell",
    freq: 62,
    gain: 0,
    q: 0.7,
    color: "#84cc16",
    enabled: true,
  },
  {
    id: 3,
    type: "bell",
    freq: 125,
    gain: 0,
    q: 0.7,
    color: "#facc15",
    enabled: true,
  },
  {
    id: 4,
    type: "bell",
    freq: 250,
    gain: 0,
    q: 0.7,
    color: "#fb923c",
    enabled: true,
  },
  {
    id: 5,
    type: "bell",
    freq: 500,
    gain: 0,
    q: 0.7,
    color: "#ef4444",
    enabled: true,
  },
  {
    id: 6,
    type: "bell",
    freq: 1000,
    gain: 0,
    q: 0.7,
    color: "#a855f7",
    enabled: true,
  },
  {
    id: 7,
    type: "bell",
    freq: 2000,
    gain: 0,
    q: 0.7,
    color: "#6366f1",
    enabled: true,
  },
  {
    id: 8,
    type: "bell",
    freq: 4000,
    gain: 0,
    q: 0.7,
    color: "#38bdf8",
    enabled: true,
  },
  {
    id: 9,
    type: "bell",
    freq: 8000,
    gain: 0,
    q: 0.7,
    color: "#14b8a6",
    enabled: true,
  },
  {
    id: 10,
    type: "highShelf",
    freq: 16000,
    gain: 0,
    q: 0.7,
    color: "#22c55e",
    enabled: true,
  },
];

const MIN_FREQ = 20;
const MAX_FREQ = 20000;
const MIN_GAIN = -12;
const MAX_GAIN = 12;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function freqToX(freq: number, width: number) {
  const min = Math.log10(MIN_FREQ);
  const max = Math.log10(MAX_FREQ);
  const value = Math.log10(freq);
  return ((value - min) / (max - min)) * width;
}

function xToFreq(x: number, width: number) {
  const min = Math.log10(MIN_FREQ);
  const max = Math.log10(MAX_FREQ);
  const value = min + (x / width) * (max - min);
  return Math.round(Math.pow(10, value));
}

function gainToY(gain: number, height: number) {
  return ((MAX_GAIN - gain) / (MAX_GAIN - MIN_GAIN)) * height;
}

function yToGain(y: number, height: number) {
  return Number((MAX_GAIN - (y / height) * (MAX_GAIN - MIN_GAIN)).toFixed(1));
}

function Logo() {
  return (
    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-[#1ed760] to-[#8cffb2] text-black shadow-[0_0_30px_rgba(30,215,96,.35)]">
      <AudioWaveform size={23} strokeWidth={3} />
    </div>
  );
}

function WaveVisualizer({ bands }: { bands: number[] }) {
  const width = 500;
  const height = 100;

  const padX = 10;
  const padTop = 10;
  const padBottom = 10;

  const graphTop = padTop;
  const graphBottom = height - padBottom;
  const graphHeight = graphBottom - graphTop;

  const dbToY = (db: number) => {
    const safeDb = clamp(db, -12, 12);
    const normalized = (12 - safeDb) / 24;
    return graphTop + normalized * graphHeight;
  };

  const points = useMemo(
    () =>
      bands.map((gain, i) => ({
        x: padX + (i / (bands.length - 1)) * (width - padX * 2),
        y: dbToY(gain),
      })),
    [bands]
  );

  const path = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  const fillPath = `${path} L ${points[points.length - 1].x} ${graphBottom} L ${
    points[0].x
  } ${graphBottom} Z`;

  return (
    <div className="relative h-[420px] overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[.08] to-white/[.025] p-6 shadow-2xl">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(30,215,96,.22),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(255,255,255,.10),transparent_30%)]" />

      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-sm text-white/50">Resona Engine</p>
          <h2 className="mt-1 text-3xl font-black tracking-tight">
            Resona Core
          </h2>
        </div>

        <div className="rounded-full border border-[#1ed760]/30 bg-[#1ed760]/10 px-4 py-2 text-sm font-bold text-[#8cffb2]">
          DSP Preview
        </div>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="relative mt-10 h-[260px] w-full overflow-visible"
      >
        <defs>
          <linearGradient
            id="coreEqFill"
            x1="0"
            y1={graphTop}
            x2="0"
            y2={graphBottom}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="rgba(30,215,96,.36)" />
            <stop offset="60%" stopColor="rgba(30,215,96,.14)" />
            <stop offset="100%" stopColor="rgba(30,215,96,0)" />
          </linearGradient>

          <filter id="coreEqGlow">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {points.map((p, i) => (
          <line
            key={`grid-${i}`}
            x1={p.x}
            y1={graphTop}
            x2={p.x}
            y2={graphBottom}
            stroke="rgba(255,255,255,.08)"
            strokeWidth="1"
          />
        ))}

        <line
          x1={padX}
          y1={dbToY(0)}
          x2={width - padX}
          y2={dbToY(0)}
          stroke="rgba(255,255,255,.18)"
          strokeWidth="1"
          strokeDasharray="4 6"
        />

        <path d={fillPath} fill="url(#coreEqFill)" />

        <path
          d={path}
          fill="none"
          stroke="rgba(30,215,96,.35)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#coreEqGlow)"
        />

        <path
          d={path}
          fill="none"
          stroke="rgba(30,215,96,.98)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="6"
            fill="#ffffff"
            stroke="#1ed760"
            strokeWidth="3"
          />
        ))}
      </svg>
    </div>
  );
}

export default function App() {
  type ActivePanel =
    | "equalizer"
    | "presets"
    | "devices"
    | "engine"
    | "settings";
  const [activePanel, setActivePanel] = useState<ActivePanel>("equalizer");
  const [showSetupWizard, setShowSetupWizard] = useState(() => {
    return localStorage.getItem("resona-setup-complete") !== "true";
  });
  const [bands, setBands] = useState(defaultBands);
  const [paramBands, setParamBands] = useState<ParamBand[]>(defaultParamBands);
  const [eqMode, setEqMode] = useState<EqMode>("graphic");
  const [preamp, setPreamp] = useState(-3);
  const [startup, setStartup] = useState(false);
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState("default-output");
  const [engineStatus, setEngineStatus] = useState("Offline");
  const [preview, setPreview] = useState("No DSP preview generated yet.");
  const [selectedInputDevice, setSelectedInputDevice] = useState("");
  const [liveEngineRunning, setLiveEngineRunning] = useState(false);
  const [standaloneRunning, setStandaloneRunning] = useState(false);
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);
  const favoriteUserPresets = userPresets.filter((preset) => preset.favorite);
  const [presetName, setPresetName] = useState("");
  const cableDetected = devices.some((d) => {
    const name = d.name.toLowerCase();
    return (
      name.includes("cable") || name.includes("vb-audio") || name.includes("vb")
    );
  });
  const [liveSpectrum, setLiveSpectrum] = useState<number[]>([]);
  const healthChecks = [
    {
      label: "VB-CABLE Detected",
      ok: cableDetected,
    },
    {
      label: "Capture Device Selected",
      ok: !!selectedInputDevice,
    },
    {
      label: "Output Device Selected",
      ok: !!selectedDevice,
    },
    {
      label: "Live Engine Running",
      ok: liveEngineRunning,
    },
    {
      label: "Live EQ Connected",
      ok: liveEngineRunning,
    },
  ];
  const DEV_MODE = false;
  const presetFileInputRef = useRef<HTMLInputElement | null>(null);
  const [devicesLoaded, setDevicesLoaded] = useState(false);
  const [autoStartAttempted, setAutoStartAttempted] = useState(false);
  const [liveLatencyMs, setLiveLatencyMs] = useState(0);

  useEffect(() => {
    if (!liveEngineRunning) {
      setLiveLatencyMs(0);
      return;
    }

    const interval = window.setInterval(() => {
      getLiveLatency()
        .then(setLiveLatencyMs)
        .catch((err) => console.error("Latency fetch failed:", err));
    }, 250);

    return () => window.clearInterval(interval);
  }, [liveEngineRunning]);

  useEffect(() => {
    invoke<string>("get_resona_data_dir")
      .then((dir) => {
        console.log("Resona Data Dir:", dir);
      })
      .catch(console.error);
  }, []);

  const [autoStartLive, setAutoStartLive] = useState(() => {
    return localStorage.getItem(AUTO_START_LIVE_KEY) === "true";
  });

  useEffect(() => {
    if (!autoStartLive) return;
    if (autoStartAttempted) return;
    if (showSetupWizard) return;
    if (!devicesLoaded) return;

    const timeout = window.setTimeout(async () => {
      if (!selectedInputDevice || !selectedDevice) {
        setPreview(
          `Auto-start skipped.\n\nInput: ${
            selectedInputDevice || "missing"
          }\nOutput: ${selectedDevice || "missing"}`
        );
        return;
      }

      if (liveEngineRunning) return;

      setAutoStartAttempted(true);

      try {
        const result = await startLiveEngine(
          {
            mode: eqMode,
            preamp,
            graphicBands: bands,
            parametricBands: paramBands,
          },
          selectedInputDevice,
          selectedDevice
        );

        setPreview(
          `Live Engine auto-started.\n\n${selectedInputDevice}\n→ ${selectedDevice}\n\n${result}`
        );
        setEngineStatus("Running");
        setLiveEngineRunning(true);
      } catch (err) {
        console.error("Auto-start live engine failed:", err);
        setPreview(`Auto-start failed:\n${String(err)}`);
      }
    }, 1200);

    return () => window.clearTimeout(timeout);
  }, [
    autoStartLive,
    autoStartAttempted,
    showSetupWizard,
    devicesLoaded,
    selectedInputDevice,
    selectedDevice,
  ]);

  useEffect(() => {
    if (!liveEngineRunning) return;

    const interval = window.setInterval(() => {
      getLiveSpectrum()
        .then(setLiveSpectrum)
        .catch((err) => console.error("Spectrum fetch failed:", err));
    }, 33);

    return () => window.clearInterval(interval);
  }, [liveEngineRunning]);

  async function refreshDevices() {
    const items = await getAudioDevices();
    setDevices(items);

    const savedInput = localStorage.getItem(LAST_INPUT_DEVICE_KEY);
    const savedOutput = localStorage.getItem(LAST_OUTPUT_DEVICE_KEY);

    const defaultInput =
      items.find((d) => d.id === savedInput) ??
      items.find((d) => d.kind === "input" && d.isDefault) ??
      items.find((d) => d.kind === "input");

    const defaultOutput =
      items.find((d) => d.id === savedOutput) ??
      items.find((d) => d.kind === "output" && d.isDefault) ??
      items.find((d) => d.kind === "output");

    if (defaultInput) setSelectedInputDevice(defaultInput.id);
    if (defaultOutput) setSelectedDevice(defaultOutput.id);

    setDevicesLoaded(true);
  }

  useEffect(() => {
    if (selectedInputDevice) {
      localStorage.setItem(LAST_INPUT_DEVICE_KEY, selectedInputDevice);
    }
  }, [selectedInputDevice]);

  useEffect(() => {
    if (selectedDevice) {
      localStorage.setItem(LAST_OUTPUT_DEVICE_KEY, selectedDevice);
    }
  }, [selectedDevice]);

  useEffect(() => {
    isEnabled()
      .then(setStartup)
      .catch(() => setStartup(false));
    refreshDevices();
  }, []);

  useEffect(() => {
    loadPresetFiles()
      .then((presets) => {
        setUserPresets(presets);
      })
      .catch((err) => {
        console.error("Failed to load preset files:", err);
      });
  }, []);

  useEffect(() => {
    if (!liveEngineRunning) return;

    const timeout = window.setTimeout(() => {
      updateLiveEq({
        mode: eqMode,
        preamp,
        graphicBands: bands,
        parametricBands: paramBands,
      })
        .then((result) => setPreview(result))
        .catch((err) => console.error("Live EQ update failed:", err));
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [eqMode, preamp, bands, paramBands, liveEngineRunning]);

  async function handleUpdateLiveEq() {
    const result = await updateLiveEq({
      mode: eqMode,
      preamp,
      graphicBands: bands,
      parametricBands: paramBands,
    });

    setPreview(result);
  }

  async function handleStopLiveEngine() {
    const result = await stopLiveEngine();

    setPreview(result);
    setEngineStatus("Offline");
    setLiveEngineRunning(false);
  }

  async function handleStartLiveEngine() {
    const result = await startLiveEngine(
      {
        mode: eqMode,
        preamp,
        graphicBands: bands,
        parametricBands: paramBands,
      },
      selectedInputDevice,
      selectedDevice
    );

    setPreview(result);
    setEngineStatus("Running");
    setLiveEngineRunning(true);
  }

  async function handlePlayDspTone() {
    const result = await playDspTestTone(
      {
        mode: eqMode,
        preamp,
        graphicBands: bands,
        parametricBands: paramBands,
      },
      selectedDevice
    );

    setPreview(result);
  }

  async function handleWavTest() {
    const result = await testDspEngineWav({
      mode: eqMode,
      preamp,
      graphicBands: bands,
      parametricBands: paramBands,
    });

    setPreview(result);
  }

  async function handleDspTest() {
    const result = await testDspEngine({
      mode: eqMode,
      preamp,
      graphicBands: bands,
      parametricBands: paramBands,
    });

    setPreview(result);
  }

  async function toggleStartup() {
    try {
      if (startup) {
        await disable();
        setStartup(false);
        setPreview("Launch on startup disabled.");
      } else {
        await enable();
        setStartup(true);
        setPreview("Launch on startup enabled.");
      }
    } catch (err) {
      console.error(err);
      setPreview(`Failed to update startup setting:\n${String(err)}`);
    }
  }

  async function handleApply() {
    const result = await applyEqPreview({
      mode: eqMode,
      preamp,
      graphicBands: bands,
      parametricBands: paramBands,
    });

    setPreview(result);
  }

  async function toggleEngine() {
    if (standaloneRunning) {
      await stopStandaloneEngine();
      setStandaloneRunning(false);
    } else {
      await startStandaloneEngine(selectedDevice);
      setStandaloneRunning(true);
    }
  }

  async function togglePresetFavorite(name: string) {
    const nextPresets = userPresets.map((preset) =>
      preset.name === name
        ? { ...preset, favorite: !preset.favorite }
        : preset
    );

    setUserPresets(nextPresets);

    const changed = nextPresets.find((preset) => preset.name === name);

    if (changed) {
      await savePresetFile(changed.name, changed);
    }
  }

  function importUserPresets(file: File) {
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const raw = String(reader.result);
        const parsed = JSON.parse(raw);

        const importedPresets: UserPreset[] = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed.presets)
          ? parsed.presets
          : parsed.name
          ? [parsed]
          : [];

        if (!Array.isArray(importedPresets) || importedPresets.length === 0) {
          throw new Error("Invalid preset file.");
        }

        const cleaned = importedPresets.filter((preset) => {
          return (
            typeof preset.name === "string" &&
            (preset.mode === "graphic" || preset.mode === "parametric") &&
            typeof preset.preamp === "number" &&
            Array.isArray(preset.graphicBands) &&
            Array.isArray(preset.parametricBands)
          );
        });

        for (const preset of cleaned) {
          await savePresetFile(preset.name, preset);
        }

        const presets = await loadPresetFiles();
        setUserPresets(presets);

        setPreview(`Imported ${cleaned.length} preset(s).`);
      } catch (error) {
        console.error(error);
        setPreview("Failed to import presets. Invalid JSON file.");
      }
    };

    reader.readAsText(file);
  }

  async function saveCurrentPreset() {
    const name = presetName.trim();

    if (!name) return;

    const nextPreset: UserPreset = {
      name,
      mode: eqMode,
      preamp,
      graphicBands: bands,
      parametricBands: paramBands,
    };

    await savePresetFile(name, {
      name,
      mode: eqMode,
      preamp,
      graphicBands: bands,
      parametricBands: paramBands,
    });

    const presets = await loadPresetFiles();
    setUserPresets(presets);

    setPreview(`Saved preset to Resona presets folder: ${name}`);
    setPresetName("");
  }

  function loadUserPreset(preset: UserPreset) {
    setEqMode(preset.mode);
    setPreamp(preset.preamp);
    setBands(preset.graphicBands);
    setParamBands(preset.parametricBands);
  }

  async function deleteUserPreset(name: string) {
    await deletePresetFile(name);

    const presets = await loadPresetFiles();
    setUserPresets(presets);

    setPreview(`Deleted preset: ${name}`);
  }

  async function restartLiveEngineWithDevices(
    nextInputDevice = selectedInputDevice,
    nextOutputDevice = selectedDevice
  ) {
    if (!liveEngineRunning) return;

    try {
      await stopLiveEngine();

      setLiveEngineRunning(false);
      setEngineStatus("Offline");

      await new Promise((resolve) => window.setTimeout(resolve, 350));

      const result = await startLiveEngine(
        {
          mode: eqMode,
          preamp,
          graphicBands: bands,
          parametricBands: paramBands,
        },
        nextInputDevice,
        nextOutputDevice
      );

      setPreview(
        `Live Engine restarted.\n\n${nextInputDevice}\n→ ${nextOutputDevice}\n\n${result}`
      );

      setEngineStatus("Running");
      setLiveEngineRunning(true);
    } catch (err) {
      console.error("Failed to restart live engine:", err);
      setPreview(`Failed to restart Live Engine:\n${String(err)}`);
    }
  }

  if (showSetupWizard) {
    return (
      <SetupWizard
        devices={devices}
        selectedOutput={selectedDevice}
        setSelectedOutput={setSelectedDevice}
        onRefreshDevices={refreshDevices}
        onPlayTestTone={async (state) => {
          const result = await playDspTestTone(state, selectedDevice);
          setPreview(result);
        }}
        onFinish={() => setShowSetupWizard(false)}
      />
    );
  }

  function StatusItem({ label, ok }: { label: string; ok: boolean }) {
    return (
      <div className="flex items-center justify-between rounded-2xl bg-white/[.03] px-4 py-3">
        <div className="flex items-center gap-3">
          <div
            className={`h-3 w-3 rounded-full ${
              ok
                ? "bg-[#1ed760] shadow-[0_0_12px_rgba(30,215,96,.8)]"
                : "bg-red-500 shadow-[0_0_12px_rgba(239,68,68,.8)]"
            }`}
          />

          <span className="font-medium">{label}</span>
        </div>

        <span
          className={`text-xs font-black uppercase tracking-wider ${
            ok ? "text-[#1ed760]" : "text-red-400"
          }`}
        >
          {ok ? "Ready" : "Missing"}
        </span>
      </div>
    );
  }

  return (
    <main className="flex h-screen bg-[#050505] text-white">
      <aside className="flex w-72 flex-col border-r border-white/10 bg-[#090909] p-6">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <div className="text-xl font-black tracking-tight">Resona</div>
            <div className="text-xs font-semibold uppercase tracking-[.22em] text-white/35">
              System Audio
            </div>
          </div>
        </div>

        <nav className="mt-10 space-y-2 text-sm font-semibold text-white/65">
          {[
            { icon: SlidersHorizontal, label: "Equalizer", panel: "equalizer" },
            { icon: Music2, label: "Presets", panel: "presets" },
            // { icon: Headphones, label: "Devices", panel: "devices" },
            // { icon: RadioTower, label: "Engine", panel: "engine" },
            // { icon: Settings, label: "Settings", panel: "settings" },
          ].map(({ icon: Icon, label, panel }) => (
            <button
              key={panel}
              onClick={() => setActivePanel(panel as ActivePanel)}
              className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                activePanel === panel
                  ? "bg-white/10 text-white"
                  : "hover:bg-white/[.06]"
              }`}
            >
              <Icon size={18} /> {label}
            </button>
          ))}
        </nav>

        <div className="mt-auto rounded-3xl border border-white/10 bg-white/[.04] p-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <Sparkles size={16} className="text-[#1ed760]" /> ResonaEQ{" "}
            <span>v1.0.0</span>
          </div>
          <p className="mt-2 text-xs leading-5 text-white/45">
            Enhance your audio with powerful EQ controls, custom presets, and
            real-time sound tuning.
          </p>
        </div>
        <button
          onClick={() => {
            localStorage.removeItem("resona-setup-complete");
            setShowSetupWizard(true);
          }}
          className="rounded-3xl border border-white/10 bg-white/[.04] p-4 mt-4 font-extrabold"
        >
          Run Setup Again
        </button>
      </aside>

      <section className="flex-1 overflow-y-auto p-8 ">
        <div className="flex items-center justify-between mb-6">
          <div>
            <p className="text-sm font-semibold text-[#1ed760]">
              No Equalizer APO Required
            </p>
            <h1 className="mt-1 text-5xl font-black tracking-tight">
              Standalone Audio Control
            </h1>
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleStartLiveEngine}
              className="rounded-full bg-[#1ed760] px-5 py-2 text-sm font-black text-black"
            >
              Start Live Engine
            </button>
            <button
              onClick={handleStopLiveEngine}
              className="rounded-full bg-white px-5 py-2 text-sm font-black text-black"
            >
              Stop Live Engine
            </button>
          </div>
        </div>
        {activePanel === "equalizer" && (
          <>
            <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6 flex gap-x-4">
              <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5 flex-1">
                <div className="flex items-center gap-3">
                  <Volume2 className="text-[#1ed760]" />
                  <h3 className="text-xl font-black">Capture Device</h3>
                </div>

                <select
                  value={selectedInputDevice}
                  onChange={(e) => {
                    const nextDevice = e.target.value;

                    setSelectedInputDevice(nextDevice);
                    localStorage.setItem(LAST_INPUT_DEVICE_KEY, nextDevice);

                    restartLiveEngineWithDevices(nextDevice, selectedDevice);
                  }}
                  className="mt-4 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
                >
                  {devices
                    .filter((d) => d.kind === "input")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>

              <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5 flex-1">
                <div className="flex items-center gap-3">
                  <Volume2 className="text-[#1ed760]" />
                  <h3 className="text-xl font-black">Output Device</h3>
                </div>

                <select
                  value={selectedDevice}
                  onChange={(e) => {
                    const nextDevice = e.target.value;

                    setSelectedDevice(nextDevice);
                    localStorage.setItem(LAST_OUTPUT_DEVICE_KEY, nextDevice);

                    restartLiveEngineWithDevices(
                      selectedInputDevice,
                      nextDevice
                    );
                  }}
                  className="mt-4 w-full rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
                >
                  {devices
                    .filter((d) => d.kind === "output")
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>

                <div className="mt-4 rounded-2xl bg-white/[.04] p-4 text-sm text-white/55">
                  Engine status:{" "}
                  <b className="text-white">
                    {liveEngineRunning
                      ? "Live Engine Running"
                      : standaloneRunning
                      ? "Standalone Engine Running"
                      : "Offline"}
                  </b>
                </div>
              </div>
            </div>
            <div className="mt-8 grid grid-cols-[1fr_360px] gap-6">
              <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6">
                <div className="space-y-6">
                  <WaveVisualizer bands={bands} />
                  {DEV_MODE && (
                    <>
                      <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6">
                        <div className="flex justify-end">
                          <div className="flex flex-center gap-3">
                            <button
                              onClick={handleDspTest}
                              className="rounded-full bg-[#1ed760] px-5 py-2 text-sm font-black text-black"
                            >
                              Run DSP Test
                            </button>
                            <button
                              onClick={handleWavTest}
                              className="rounded-full bg-white px-5 py-2 text-sm font-black text-black"
                            >
                              Export DSP WAV
                            </button>
                            <button
                              onClick={handlePlayDspTone}
                              className="rounded-full bg-[#1ed760] px-5 py-2 text-sm font-black text-black"
                            >
                              Play DSP Tone
                            </button>
                            <button
                              onClick={handleUpdateLiveEq}
                              className="rounded-full bg-white px-5 py-2 text-sm font-black text-black"
                            >
                              Update Live EQ
                            </button>
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                  <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6">
                    <div className="mb-6 flex items-center justify-between">
                      <div>
                        <h2 className="text-2xl font-black">Equalizer</h2>
                        <p className="text-sm text-white/40">
                          {eqMode === "graphic"
                            ? "10-band DSP profile"
                            : "Parametric DSP profile"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex rounded-full bg-white/[.06] p-1">
                          <button
                            onClick={() => setEqMode("graphic")}
                            className={`rounded-full px-4 py-2 text-sm font-black ${
                              eqMode === "graphic"
                                ? "bg-white text-black"
                                : "text-white/50"
                            }`}
                          >
                            Graphic
                          </button>

                          <button
                            onClick={() => setEqMode("parametric")}
                            className={`rounded-full px-4 py-2 text-sm font-black ${
                              eqMode === "parametric"
                                ? "bg-[#1ed760] text-black"
                                : "text-white/50"
                            }`}
                          >
                            Parametric
                          </button>
                        </div>

                        <button
                          onClick={handleApply}
                          className="rounded-full bg-white px-5 py-2 text-sm font-black text-black"
                        >
                          Apply Preview
                        </button>
                      </div>
                    </div>

                    {eqMode === "parametric" ? (
                      <ParametricEqGraph
                        bands={paramBands}
                        setBands={setParamBands}
                        defaultParamBands={defaultParamBands}
                        spectrum={liveSpectrum}
                      />
                    ) : (
                      <>
                        <div className="grid grid-cols-10 gap-4">
                          {bands.map((value, index) => (
                            <div
                              key={freqs[index]}
                              className="relative flex h-72 flex-col items-center justify-between rounded-3xl bg-white/[.04] p-3"
                            >
                              <div className="text-xs font-bold text-white/40">
                                {value > 0 ? `+${value}` : value} dB
                              </div>

                              <div className="relative flex h-48 w-full items-center justify-center">
                                <input
                                  className="absolute z-20 h-full w-48 cursor-pointer opacity-0"
                                  type="range"
                                  min="-12"
                                  max="12"
                                  step="0.5"
                                  value={value}
                                  onChange={(e) =>
                                    setBands((prev) =>
                                      prev.map((b, i) =>
                                        i === index ? Number(e.target.value) : b
                                      )
                                    )
                                  }
                                  style={{
                                    transform: "rotate(-90deg)",
                                  }}
                                />

                                <div className="h-40 w-1 rounded-full bg-white/15" />

                                <div
                                  className="absolute h-5 w-5 rounded-full bg-[#1ed760] shadow-[0_0_18px_rgba(30,215,96,.7)]"
                                  style={{
                                    top: `${((12 - value) / 24) * 100}%`,
                                  }}
                                />
                              </div>

                              <div className="text-xs font-black text-white/70">
                                {freqs[index]}
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="mt-7 rounded-3xl bg-white/[.04] p-5">
                          <div className="mb-3 flex items-center justify-between text-sm font-bold">
                            <span>Preamp</span>
                            <span>{preamp} dB</span>
                          </div>
                          <input
                            className="slider"
                            type="range"
                            min="-12"
                            max="6"
                            step="0.5"
                            value={preamp}
                            onChange={(e) => setPreamp(Number(e.target.value))}
                          />
                        </div>
                      </>
                    )}
                  </div>
                                    <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
                    <h3 className="text-xl font-black">Preset Mini-Manager</h3>
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => presetFileInputRef.current?.click()}
                        className="flex-1 rounded-2xl border border-white/10 px-4 py-3 text-sm font-black text-white/70 hover:bg-white/10"
                      >
                        Import JSON
                      </button>

                      <input
                        ref={presetFileInputRef}
                        type="file"
                        accept="application/json,.json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];

                          if (file) {
                            importUserPresets(file);
                          }

                          e.target.value = "";
                        }}
                      />
                    </div>
                    <div className="mt-4 flex gap-2">
                      <input
                        value={presetName}
                        onChange={(e) => setPresetName(e.target.value)}
                        placeholder="Preset name"
                        className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white outline-none"
                      />

                      <button
                        onClick={saveCurrentPreset}
                        className="rounded-2xl bg-[#1ed760] px-4 py-3 text-sm font-black text-black"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                  <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
                    <h3 className="text-xl font-black">
                      Favorite User Presets
                    </h3>

                    <div className="mt-4 space-y-3">
                      {favoriteUserPresets.length === 0 ? (
                        <div className="rounded-3xl bg-white/[.04] p-4 text-sm text-white/40">
                          No favorites yet. Star presets in the Preset Manager.
                        </div>
                      ) : (
                        favoriteUserPresets.map((preset) => (
                          <div
                            key={preset.name}
                            className="flex items-center justify-between rounded-3xl bg-white/[.045] p-4"
                          >
                            <button
                              onClick={() => loadUserPreset(preset)}
                              className="text-left cursor-pointer"
                            >
                              <div className="font-black">{preset.name}</div>
                              <div className="mt-1 text-xs text-white/40">
                                {preset.mode} · {preset.preamp} dB
                              </div>
                            </button>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => deleteUserPreset(preset.name)}
                                className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/60 hover:bg-white/10 cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                className="rounded-full border border-white/10 px-3 py-1 text-xs font-black text-white/60 hover:bg-white/10 cursor-pointer"
                                onClick={async () => {
                                  try {
                                    const path = await exportPresetFile(
                                      preset.name
                                    );

                                    setPreview(
                                      `Exported ${preset.name} to:\n${path}`
                                    );
                                  } catch (err) {
                                    console.error(err);

                                    setPreview(
                                      `Failed to export ${preset.name}`
                                    );
                                  }
                                }}
                              >
                                Export
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <aside className="space-y-6">
                <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black">Launch on startup</h3>
                      <p className="text-xs text-white/40">
                        Start Resona with Windows
                      </p>
                    </div>

                    <button
                      onClick={toggleStartup}
                      className={`h-8 w-14 rounded-full p-1 transition ${
                        startup ? "bg-[#1ed760]" : "bg-white/15"
                      }`}
                    >
                      <span
                        className={`block h-6 w-6 rounded-full bg-white transition ${
                          startup ? "translate-x-6" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="mt-4 rounded-[2rem] border border-white/10 bg-[#111] p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-black">
                        Auto-start Live Engine
                      </h3>
                      <p className="text-xs text-white/40">
                        Start audio routing automatically on launch
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        const next = !autoStartLive;

                        setAutoStartLive(next);

                        localStorage.setItem(AUTO_START_LIVE_KEY, String(next));
                      }}
                      className={`h-8 w-14 rounded-full p-1 transition ${
                        autoStartLive ? "bg-[#1ed760]" : "bg-white/15"
                      }`}
                    >
                      <span
                        className={`block h-6 w-6 rounded-full bg-white transition ${
                          autoStartLive ? "translate-x-6" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
                <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
                  <h3 className="text-xl font-black">System Health</h3>

                  <div className="mt-4 space-y-3">
                    <StatusItem label="VB-CABLE Detected" ok={cableDetected} />

                    <StatusItem
                      label="Capture Device Selected"
                      ok={!!selectedInputDevice}
                    />

                    <StatusItem
                      label="Output Device Selected"
                      ok={!!selectedDevice}
                    />

                    <StatusItem
                      label="Live Engine Running"
                      ok={liveEngineRunning}
                    />

                    <StatusItem
                      label="Live EQ Connected"
                      ok={liveEngineRunning}
                    />
                  </div>
                </div>
                <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
                  <h3 className="text-xl font-black">Presets</h3>
                  <div className="mt-4 space-y-3">
                    {presets.map((preset) => (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setBands(preset.bands);
                          setPreamp(preset.preamp);
                          setEqMode("graphic");
                        }}
                        className="w-full rounded-3xl bg-white/[.045] p-4 text-left transition hover:bg-white/[.08]"
                      >
                        <div className="font-black">{preset.name}</div>
                        <div className="mt-1 text-xs text-white/40">
                          {preset.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
                  <div className="mb-3 flex items-center gap-2 font-black">
                    <Waves className="text-[#1ed760]" /> DSP Preview
                  </div>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl bg-black/60 p-4 text-xs leading-5 text-white/55">
                    {preview}
                  </pre>
                </div>
                <div className="rounded-[2rem] border border-white/10 bg-[#111] p-5">
                  <div className="mb-3 flex flex-col gap-2 font-black">
                    <div className="mb-3 flex items-center gap-2 font-black">
                      Latency
                    </div>
                    <div className="font-bold text-sm">
                      <span className=""> Current Latency: </span>
                      <span
                        className={
                          liveLatencyMs < 25
                            ? "text-[#1ed760]"
                            : liveLatencyMs < 60
                            ? "text-yellow-300"
                            : "text-red-400"
                        }
                      >
                        {liveEngineRunning
                          ? `${liveLatencyMs.toFixed(1)} ms`
                          : "Offline"}
                      </span>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </>
        )}
        {activePanel === "presets" && (
          <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6">
            <h2 className="text-3xl font-black">Preset Manager</h2>
            <p className="mt-1 text-sm text-white/40">
              Manage, favorite, load, export, import, and delete user presets.
            </p>

            <div className="mt-6 space-y-3">
              {userPresets.length === 0 ? (
                <div className="rounded-3xl bg-white/[.04] p-5 text-sm text-white/40">
                  No user presets saved yet.
                </div>
              ) : (
                userPresets.map((preset) => (
                  <div
                    key={preset.name}
                    className="flex items-center justify-between rounded-3xl bg-white/[.045] p-4"
                  >
                    <button onClick={() => loadUserPreset(preset)} className="text-left">
                      <div className="font-black">
                        {preset.favorite ? "★ " : "☆ "}
                        {preset.name}
                      </div>
                      <div className="mt-1 text-xs text-white/40">
                        {preset.mode} · {preset.preamp} dB
                      </div>
                    </button>

                    <div className="flex gap-2">
                      <button
                        onClick={() => togglePresetFavorite(preset.name)}
                        className={`rounded-full px-4 py-2 text-xs font-black ${
                          preset.favorite
                            ? "bg-[#1ed760] text-black"
                            : "border border-white/10 text-white/70"
                        }`}
                      >
                        {preset.favorite ? "Starred" : "Star"}
                      </button>

                      <button
                        onClick={() => loadUserPreset(preset)}
                        className="rounded-full bg-[#1ed760] px-4 py-2 text-xs font-black text-black"
                      >
                        Load
                      </button>

                      <button
                        onClick={async () => {
                          const path = await exportPresetFile(preset.name);
                          setPreview(`Exported ${preset.name} to:\n${path}`);
                        }}
                        className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-white/70"
                      >
                        Export
                      </button>

                      <button
                        onClick={() => deleteUserPreset(preset.name)}
                        className="rounded-full border border-red-500/30 px-4 py-2 text-xs font-black text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
