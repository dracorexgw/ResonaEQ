import type { ParamBand } from "../types/audio";

export type AutoEqImportResult = {
  name: string;
  preamp: number;
  parametricBands: ParamBand[];
};

function colorForBand(index: number) {
  const colors = [
    "#1ed760",
    "#84cc16",
    "#facc15",
    "#fb923c",
    "#ef4444",
    "#a855f7",
    "#6366f1",
    "#38bdf8",
    "#14b8a6",
    "#22c55e",
  ];

  return colors[index % colors.length];
}

export function parseAutoEqText(raw: string, fallbackName = "AutoEQ Import"): AutoEqImportResult {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let name = fallbackName.replace(/\.[^.]+$/, "");
  let preamp = -6;
  const parametricBands: ParamBand[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith("preamp:")) {
      const match = line.match(/preamp:\s*([+-]?\d+(?:\.\d+)?)\s*d?b?/i);

      if (match) {
        preamp = Number(match[1]);
      }

      continue;
    }

    const filterMatch = line.match(
      /filter\s+(\d+):\s+on\s+(\w+)\s+fc\s+([+-]?\d+(?:\.\d+)?)\s+hz\s+gain\s+([+-]?\d+(?:\.\d+)?)\s+db\s+q\s+([+-]?\d+(?:\.\d+)?)/i
    );

    if (!filterMatch) continue;

    const index = Number(filterMatch[1]);
    const autoEqType = filterMatch[2].toUpperCase();
    const freq = Number(filterMatch[3]);
    const gain = Number(filterMatch[4]);
    const q = Number(filterMatch[5]);

    let type: ParamBand["type"] = "bell";

    if (autoEqType === "PK" || autoEqType === "PEAK") {
      type = "bell";
    } else if (autoEqType === "LSC" || autoEqType === "LS") {
      type = "lowShelf";
    } else if (autoEqType === "HSC" || autoEqType === "HS") {
      type = "highShelf";
    }

    parametricBands.push({
      id: index,
      type,
      freq,
      gain,
      q,
      color: colorForBand(index - 1),
      enabled: true,
    });
  }

  if (parametricBands.length === 0) {
    throw new Error("No AutoEQ parametric filters found.");
  }

  return {
    name,
    preamp,
    parametricBands,
  };
}
