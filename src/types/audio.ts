export type ParamBand = {
  id: number;
  type: "bell" | "lowShelf" | "highShelf" | "highPass" | "lowPass";
  freq: number;
  gain: number;
  q: number;
  color: string;
  enabled: boolean;
};

export type EqState = {
  mode: "graphic" | "parametric";
  preamp: number;
  graphicBands: number[];
  parametricBands: ParamBand[];
};

export type PresetFile = EqState & {
  name: string;
  favorite?: boolean;
  category?: string;
  brand?: string;
  model?: string;
  target?: string;
};
