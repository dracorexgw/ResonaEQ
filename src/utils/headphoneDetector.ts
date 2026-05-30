export type HeadphoneMatch = {
  brand: string;
  model: string;
  regex: RegExp;
};

export type DetectedHeadphone = {
  brand: string;
  model: string;
  target: string;
};

export const HEADPHONE_DATABASE: HeadphoneMatch[] = [
  { brand: "Sennheiser", model: "HD 490 Pro", regex: /\bhd[\s\-_]?490\b/i },
  { brand: "Sennheiser", model: "HD 650", regex: /\bhd[\s\-_]?650\b/i },
  { brand: "Sennheiser", model: "HD 600", regex: /\bhd[\s\-_]?600\b/i },

  { brand: "Audeze", model: "MM-500", regex: /\bmm[\s\-_]?500\b/i },
  { brand: "Audeze", model: "LCD-X", regex: /\blcd[\s\-_]?x\b/i },
  { brand: "Audeze", model: "LCD-2", regex: /\blcd[\s\-_]?2\b/i },

  { brand: "HIFIMAN", model: "Arya", regex: /\barya\b/i },
  { brand: "HIFIMAN", model: "HE1000SE", regex: /\bhe[\s\-_]?1000[\s\-_]?se\b/i },
  { brand: "HIFIMAN", model: "HE1000", regex: /\bhe[\s\-_]?1000\b/i },

  { brand: "Beyerdynamic", model: "DT 1990 Pro", regex: /\bdt[\s\-_]?1990\b/i },
  { brand: "Beyerdynamic", model: "DT 770 Pro", regex: /\bdt[\s\-_]?770\b/i },

  { brand: "Focal", model: "Clear", regex: /\bclear\b/i },
  { brand: "Focal", model: "Utopia", regex: /\butopia\b/i },
];

export function cleanPresetName(filename: string) {
  return filename
    .replace(/\.[^/.]+$/, "")
    .replace(/[_]+/g, " ")
    .trim();
}

export function detectHeadphone(filename: string): DetectedHeadphone {
  const cleaned = cleanPresetName(filename);

  for (const headphone of HEADPHONE_DATABASE) {
    if (headphone.regex.test(cleaned)) {
      return {
        brand: headphone.brand,
        model: headphone.model,
        target: "Harman",
      };
    }
  }

  return {
    brand: "Unknown",
    model: "Unknown",
    target: "Harman",
  };
}
