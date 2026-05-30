import { invoke } from "@tauri-apps/api/core";
import type { ParamBand } from "../types/audio";

export type AudioDevice = {
  id: string;
  name: string;
  kind: "input" | "output" | "virtual";
  isDefault: boolean;
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

export async function getAudioDevices(): Promise<AudioDevice[]> {
  return invoke<AudioDevice[]>("list_audio_devices");
}

export async function applyEqPreview(state: EqState): Promise<string> {
  return invoke<string>("apply_eq_preview", { state });
}

export async function startStandaloneEngine(outputDeviceId: string): Promise<string> {
  return invoke<string>("start_standalone_engine", {
    outputDeviceId,
  });
}

export async function stopStandaloneEngine(): Promise<string> {
  return invoke<string>("stop_standalone_engine");
}

export async function testDspEngine(state: EqState): Promise<string> {
  return invoke<string>("test_dsp_engine", { state });
}

export async function testDspEngineWav(state: EqState): Promise<string> {
  return invoke<string>("test_dsp_engine_wav", { state });
}

export async function playDspTestTone(state: EqState, outputDeviceId: string): Promise<string> {
  return invoke<string>("play_dsp_test_tone", {
    state,
    outputDeviceId,
  });
}

export async function startLiveEngine(
  state: EqState,
  inputDeviceId: string,
  outputDeviceId: string
): Promise<string> {
  return invoke<string>("start_live_engine", {
    state,
    inputDeviceId,
    outputDeviceId,
  });
}

export async function stopLiveEngine(): Promise<string> {
  return invoke<string>("stop_live_engine");
}

export async function updateLiveEq(state: EqState): Promise<string> {
  return invoke<string>("update_live_eq", { state });
}

export async function getLiveSpectrum(): Promise<number[]> {
  return invoke<number[]>("get_live_spectrum");
}

export async function getResonaDataDir(): Promise<string> {
  return invoke<string>("get_resona_data_dir");
}

export async function savePresetFile(name: string, preset: PresetFile): Promise<void> {
  return invoke<void>("save_preset", {
    name,
    preset,
  });
}

export async function loadPresetFiles(): Promise<PresetFile[]> {
  return invoke<PresetFile[]>("load_presets");
}

export async function deletePresetFile(name: string): Promise<void> {
  return invoke<void>("delete_preset", {
    name,
  });
}

export async function exportPresetFile(name: string): Promise<string> {
  return invoke<string>("export_preset", {
    name,
  });
}

export async function getLiveLatency(): Promise<number> {
  return invoke<number>("get_live_latency");
}
