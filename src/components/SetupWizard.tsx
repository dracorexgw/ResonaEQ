import { useMemo, useState } from "react";
import { AudioWaveform, CheckCircle2, ExternalLink, Headphones, RefreshCw, XCircle } from "lucide-react";
import type { AudioDevice, EqState } from "../lib/audio";
import { open } from "@tauri-apps/plugin-shell";

type SetupWizardProps = {
  devices: AudioDevice[];
  selectedOutput: string;
  setSelectedOutput: (id: string) => void;
  onRefreshDevices: () => void;
  onPlayTestTone: (state: EqState) => Promise<void>;
  onFinish: () => void;
};

const defaultTestState: EqState = {
  mode: "parametric",
  preamp: -3,
  graphicBands: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  parametricBands: [
    { id: 1, type: "bell", freq: 80, gain: 2, q: 0.8, color: "#1ed760", enabled: true },
    { id: 2, type: "bell", freq: 1000, gain: 0, q: 0.8, color: "#facc15", enabled: true },
    { id: 3, type: "highShelf", freq: 8000, gain: 1, q: 0.7, color: "#38bdf8", enabled: true },
  ],
};

export function SetupWizard({
  devices,
  selectedOutput,
  setSelectedOutput,
  onRefreshDevices,
  onPlayTestTone,
  onFinish,
}: SetupWizardProps) {
  const [step, setStep] = useState(0);
  const [heardTone, setHeardTone] = useState(false);

  const outputDevices = devices.filter((d) => d.kind === "output");

  const cableDetected = useMemo(() => {
    return devices.some((d) => {
      const name = d.name.toLowerCase();
      return name.includes("cable") || name.includes("vb-audio") || name.includes("vb");
    });
  }, [devices]);

  const selectedOutputName =
    outputDevices.find((d) => d.id === selectedOutput)?.name ?? "No output selected";

  return (
    <main className="min-h-screen bg-[#050505] p-8 text-white">
      <div className="mx-auto max-w-3xl rounded-[2rem] border border-white/10 bg-[#111] p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-4">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#1ed760] text-black">
            <AudioWaveform size={26} strokeWidth={3} />
          </div>

          <div>
            <h1 className="text-3xl font-black">Welcome to Resona</h1>
            <p className="text-sm text-white/45">Let’s set up system-wide audio routing.</p>
          </div>
        </div>

        {step === 0 && (
          <section>
            <h2 className="text-2xl font-black">Resona Setup</h2>

            <div className="mt-6 space-y-4 text-white/70">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-[#1ed760]" /> System-wide EQ with VB-CABLE routing
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-[#1ed760]" /> Real-time parametric DSP
              </div>
              <div className="flex items-center gap-3">
                <CheckCircle2 className="text-[#1ed760]" /> Presets, limiter, and live EQ updates
              </div>
            </div>

            <button
              onClick={() => setStep(1)}
              className="mt-8 rounded-full bg-[#1ed760] px-6 py-3 font-black text-black"
            >
              Continue
            </button>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2 className="text-2xl font-black">Check VB-CABLE</h2>

            <div className="mt-6 rounded-3xl bg-black/40 p-5">
              {cableDetected ? (
                <div className="flex items-center gap-3 text-[#1ed760]">
                  <CheckCircle2 /> VB-CABLE detected
                </div>
              ) : (
                <div className="flex items-center gap-3 text-yellow-300">
                  <XCircle /> VB-CABLE was not detected
                </div>
              )}

              <p className="mt-3 text-sm leading-6 text-white/50">
                For clean routing, set Windows Output to <b>CABLE Input</b>, then Resona captures it
                and sends processed audio to your headphones/interface.
              </p>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => open("https://vb-audio.com/Cable/")}
                className="flex items-center gap-2 rounded-full bg-white px-5 py-3 font-black text-black"
              >
                Download VB-CABLE <ExternalLink size={16} />
              </button>

              <button
                onClick={onRefreshDevices}
                className="flex items-center gap-2 rounded-full border border-white/10 px-5 py-3 font-black text-white"
              >
                Refresh Devices <RefreshCw size={16} />
              </button>

              <button
                onClick={() => setStep(2)}
                className="rounded-full bg-[#1ed760] px-5 py-3 font-black text-black"
              >
                Continue
              </button>
            </div>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2 className="text-2xl font-black">Choose Playback Device</h2>

            <p className="mt-2 text-sm text-white/45">
              Select where Resona should send processed audio.
            </p>

            <select
              value={selectedOutput}
              onChange={(e) => {
                setSelectedOutput(e.target.value);
                localStorage.setItem("resona-default-output", e.target.value);
              }}
              className="mt-6 w-full rounded-2xl border border-white/10 bg-black px-4 py-4 text-white outline-none"
            >
              {outputDevices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>

            <div className="mt-5 rounded-3xl bg-white/[.04] p-4 text-sm text-white/55">
              Selected: <b className="text-white">{selectedOutputName}</b>
            </div>

            <button
              onClick={() => setStep(3)}
              className="mt-6 rounded-full bg-[#1ed760] px-6 py-3 font-black text-black"
            >
              Continue
            </button>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2 className="text-2xl font-black">Test Audio</h2>

            <p className="mt-2 text-sm text-white/45">
              Play a short processed tone to confirm your output device works.
            </p>

            <button
              onClick={() => onPlayTestTone(defaultTestState)}
              className="mt-6 flex items-center gap-2 rounded-full bg-[#1ed760] px-6 py-3 font-black text-black"
            >
              <Headphones size={18} /> Play Test Tone
            </button>

            <label className="mt-6 flex cursor-pointer items-center gap-3 rounded-3xl bg-white/[.04] p-4">
              <input
                type="checkbox"
                checked={heardTone}
                onChange={(e) => setHeardTone(e.target.checked)}
              />
              <span className="font-bold text-white/75">I heard the test tone</span>
            </label>

            <button
              disabled={!heardTone}
              onClick={() => {
                localStorage.setItem("resona-setup-complete", "true");
                onFinish();
              }}
              className="mt-6 rounded-full bg-white px-6 py-3 font-black text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              Finish Setup
            </button>
          </section>
        )}
      </div>
    </main>
  );
}