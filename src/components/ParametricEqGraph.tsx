import { useMemo } from "react";
import type { ParamBand } from "../types/audio";

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

function getBandLabel(type: ParamBand["type"]) {
  switch (type) {
    case "bell":
      return "B";
    case "lowShelf":
      return "LS";
    case "highShelf":
      return "HS";
    case "highPass":
      return "HP";
    case "lowPass":
      return "LP";
  }
}

function bandResponse(freq: number, band: ParamBand) {
  if (!band.enabled) return 0;

  const distance = Math.log2(freq / band.freq);
  const qWidth = Math.max(0.15, 1 / band.q);

  switch (band.type) {
    case "bell":
      return band.gain * Math.exp(-(distance * distance) / qWidth);

    case "lowShelf": {
      const slope = 1 / (1 + Math.exp(distance * band.q * 3));
      return band.gain * slope;
    }

    case "highShelf": {
      const slope = 1 / (1 + Math.exp(-distance * band.q * 3));
      return band.gain * slope;
    }

    case "highPass": {
      const slope = 1 / (1 + Math.exp(-distance * band.q * 8));
      return -12 * (1 - slope);
    }

    case "lowPass": {
      const slope = 1 / (1 + Math.exp(distance * band.q * 8));
      return -12 * (1 - slope);
    }

    default:
      return 0;
  }
}

export function ParametricEqGraph({
  bands,
  setBands,
  defaultParamBands,
  spectrum = [],
}: {
  bands: ParamBand[];
  setBands: React.Dispatch<React.SetStateAction<ParamBand[]>>;
  defaultParamBands: ParamBand[];
  spectrum?: number[];
}) {

  const width = 1200;
  const height = 420;
  const zeroY = gainToY(0, height);

  const curvePoints = useMemo(() => {
    return Array.from({ length: 512 }, (_, i) => {
      const t = i / 511;
      const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);

      const gain = clamp(
        bands.reduce((sum, band) => sum + bandResponse(freq, band), 0),
        MIN_GAIN,
        MAX_GAIN
      );

      return {
        x: t * width,
        y: gainToY(gain, height),
      };
    });
  }, [bands]);

  const masterPath = curvePoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return (
    <div className="rounded-[2rem] border border-white/10 bg-[#111] p-6">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black">Parametric Equalizer</h2>
          <p className="text-sm text-white/40">
            Bell, shelf, high-pass, low-pass, and live spectrum preview
          </p>
        </div>

        <button
          onClick={() => setBands(defaultParamBands)}
          className="rounded-full border border-white/15 px-5 py-2 text-sm font-black text-white/80 hover:bg-white/10"
        >
          Reset
        </button>
      </div>

      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[460px] w-full rounded-3xl border border-white/10 bg-gradient-to-br from-white/[.06] to-black"
      >
        <defs>
          <linearGradient
            id="paramMasterFill"
            x1="0"
            y1="0"
            x2="0"
            y2={height}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="rgba(30,215,96,.25)" />
            <stop offset="55%" stopColor="rgba(30,215,96,.08)" />
            <stop offset="100%" stopColor="rgba(30,215,96,0)" />
          </linearGradient>

          <linearGradient
            id="spectrumFill"
            x1="0"
            y1="0"
            x2="0"
            y2={height}
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="rgba(30,215,96,.24)" />
            <stop offset="60%" stopColor="rgba(255,255,255,.10)" />
            <stop offset="100%" stopColor="rgba(255,255,255,.02)" />
          </linearGradient>

          <filter id="paramGlow">
            <feGaussianBlur stdDeviation="4" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {[...Array(14)].map((_, i) => (
          <line
            key={`v-${i}`}
            x1={(i / 13) * width}
            y1="0"
            x2={(i / 13) * width}
            y2={height}
            stroke="rgba(255,255,255,.07)"
          />
        ))}

        {[...Array(9)].map((_, i) => (
          <line
            key={`h-${i}`}
            x1="0"
            y1={(i / 8) * height}
            x2={width}
            y2={(i / 8) * height}
            stroke="rgba(255,255,255,.07)"
          />
        ))}

        {spectrum.map((value, i) => {
          const x = (i / spectrum.length) * width;
          const barWidth = width / spectrum.length;
          const barHeight = value * height * 0.72;
          const y = height - barHeight;

          return (
            <rect
              key={`fft-${i}`}
              x={x}
              y={y}
              width={barWidth * 0.76}
              height={barHeight}
              fill="url(#spectrumFill)"
              opacity="0.75"
              rx="2"
            />
          );
        })}

        <line
          x1="0"
          y1={zeroY}
          x2={width}
          y2={zeroY}
          stroke="rgba(255,255,255,.32)"
          strokeDasharray="6 8"
        />

        <path
          d={`${masterPath} L ${width} ${zeroY} L 0 ${zeroY} Z`}
          fill="url(#paramMasterFill)"
        />

        <path
          d={masterPath}
          fill="none"
          stroke="rgba(30,215,96,.45)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeLinejoin="round"
          filter="url(#paramGlow)"
        />

        <path
          d={masterPath}
          fill="none"
          stroke="#1ed760"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {bands
          .filter((band) => band.enabled)
          .map((band) => {
            const bandCurve = Array.from({ length: 220 }, (_, i) => {
              const t = i / 219;
              const freq = MIN_FREQ * Math.pow(MAX_FREQ / MIN_FREQ, t);
              const gain = clamp(bandResponse(freq, band), MIN_GAIN, MAX_GAIN);

              return {
                x: t * width,
                y: gainToY(gain, height),
              };
            });

            const bandPath = bandCurve
              .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
              .join(" ");

            const x = freqToX(band.freq, width);

            const y =
              band.type === "highPass" || band.type === "lowPass"
                ? zeroY
                : gainToY(band.gain, height);

            return (
              <g key={band.id}>
                <path
                  d={bandPath}
                  fill="none"
                  stroke={band.color}
                  strokeWidth="2.2"
                  opacity="0.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                <circle
                  cx={x}
                  cy={y}
                  r="15"
                  fill={band.color}
                  stroke="white"
                  strokeWidth="3"
                  className="cursor-grab"
                  onPointerDown={(e) => {
                    const svg = e.currentTarget.ownerSVGElement!;
                    const rect = svg.getBoundingClientRect();

                    const move = (event: PointerEvent) => {
                      const px =
                        ((event.clientX - rect.left) / rect.width) * width;
                      const py =
                        ((event.clientY - rect.top) / rect.height) * height;

                      const nextFreq = clamp(
                        xToFreq(px, width),
                        MIN_FREQ,
                        MAX_FREQ
                      );

                      const nextGain =
                        band.type === "highPass" || band.type === "lowPass"
                          ? band.gain
                          : clamp(yToGain(py, height), MIN_GAIN, MAX_GAIN);

                      setBands((prev) =>
                        prev.map((b) =>
                          b.id === band.id
                            ? {
                                ...b,
                                freq: nextFreq,
                                gain: Number(nextGain.toFixed(1)),
                              }
                            : b
                        )
                      );
                    };

                    const up = () => {
                      window.removeEventListener("pointermove", move);
                      window.removeEventListener("pointerup", up);
                    };

                    window.addEventListener("pointermove", move);
                    window.addEventListener("pointerup", up);
                  }}
                />

                <text
                  x={x}
                  y={y + 4}
                  textAnchor="middle"
                  fill="black"
                  fontSize="9"
                  fontWeight="900"
                  pointerEvents="none"
                >
                  {getBandLabel(band.type)}
                </text>
              </g>
            );
          })}

        {["20", "50", "100", "200", "500", "1k", "2k", "5k", "10k", "20k"].map(
          (label, i) => (
            <text
              key={label}
              x={(i / 9) * width}
              y={height - 14}
              fill="rgba(255,255,255,.45)"
              fontSize="13"
              fontWeight="700"
              textAnchor={i === 0 ? "start" : i === 9 ? "end" : "middle"}
            >
              {label}
            </text>
          )
        )}

        {["+12", "+6", "0", "-6", "-12"].map((label, i) => (
          <text
            key={label}
            x="12"
            y={(i / 4) * height + 18}
            fill="rgba(255,255,255,.35)"
            fontSize="12"
            fontWeight="700"
          >
            {label}dB
          </text>
        ))}
      </svg>

      <div className="mt-4 grid grid-cols-5 gap-3">
        {bands.map((band) => (
          <div
            key={band.id}
            className={`rounded-2xl border p-3 transition ${
              band.enabled
                ? "border-white/10 bg-white/[.05]"
                : "border-white/5 bg-white/[.02] opacity-45"
            }`}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="text-xs font-bold text-white/35">
                Band {band.id}
              </div>

              <button
                onClick={() =>
                  setBands((prev) =>
                    prev.map((b) =>
                      b.id === band.id
                        ? { ...b, enabled: !b.enabled }
                        : b
                    )
                  )
                }
                className={`h-6 w-10 rounded-full p-1 transition ${
                  band.enabled ? "bg-[#1ed760]" : "bg-white/15"
                }`}
              >
                <span
                  className={`block h-4 w-4 rounded-full bg-white transition ${
                    band.enabled ? "translate-x-4" : ""
                  }`}
                />
              </button>
            </div>

            <select
              value={band.type}
              onChange={(e) => {
                const nextType = e.target.value as ParamBand["type"];

                setBands((prev) =>
                  prev.map((b) =>
                    b.id === band.id
                      ? {
                          ...b,
                          type: nextType,
                          gain:
                            nextType === "highPass" || nextType === "lowPass"
                              ? 0
                              : b.gain,
                        }
                      : b
                  )
                );
              }}
              className="mb-3 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-xs font-bold text-white outline-none"
            >
              <option value="bell">Bell</option>
              <option value="lowShelf">Low Shelf</option>
              <option value="highShelf">High Shelf</option>
              <option value="highPass">High Pass</option>
              <option value="lowPass">Low Pass</option>
            </select>

            <label className="text-[11px] font-bold uppercase tracking-wide text-white/35">
              Frequency
            </label>
            <input
              type="number"
              min={20}
              max={20000}
              value={band.freq}
              onChange={(e) =>
                setBands((prev) =>
                  prev.map((b) =>
                    b.id === band.id
                      ? {
                          ...b,
                          freq: clamp(Number(e.target.value), 20, 20000),
                        }
                      : b
                  )
                )
              }
              className="mb-3 mt-1 w-full rounded-xl border border-white/10 bg-black px-3 py-2 text-sm font-black text-white outline-none"
            />

            <label className="text-[11px] font-bold uppercase tracking-wide text-white/35">
              Gain
            </label>
            <input
              type="range"
              min={-12}
              max={12}
              step={0.1}
              value={band.gain}
              disabled={band.type === "highPass" || band.type === "lowPass"}
              onChange={(e) =>
                setBands((prev) =>
                  prev.map((b) =>
                    b.id === band.id
                      ? { ...b, gain: Number(e.target.value) }
                      : b
                  )
                )
              }
              className="slider mb-2 mt-1 disabled:opacity-30"
            />

            <div className="mb-3 text-xs text-white/55">
              {band.type === "highPass" || band.type === "lowPass"
                ? "Cut filter"
                : `${band.gain > 0 ? "+" : ""}${band.gain} dB`}
            </div>

            <label className="text-[11px] font-bold uppercase tracking-wide text-white/35">
              Q
            </label>
            <input
              type="range"
              min={0.1}
              max={10}
              step={0.1}
              value={band.q}
              onChange={(e) =>
                setBands((prev) =>
                  prev.map((b) =>
                    b.id === band.id ? { ...b, q: Number(e.target.value) } : b
                  )
                )
              }
              className="slider mt-1"
            />

            <div className="mt-2 text-xs text-white/55">Q {band.q}</div>
          </div>
        ))}
      </div>
    </div>
  );
}