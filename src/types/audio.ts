export type ParamBand = {
  id: number;
  type: "bell" | "lowShelf" | "highShelf" | "highPass" | "lowPass";
  freq: number;
  gain: number;
  q: number;
  color: string;
  enabled: boolean;
};