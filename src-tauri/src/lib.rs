mod dsp;
mod loopback;

type StereoFrame = [f32; 2];

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use dsp::{EqBand, EqProcessor, FilterType};
use ringbuf::{
    traits::{Consumer, Split},
    HeapRb,
};
use rustfft::{num_complex::Complex, FftPlanner};
use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{mpsc, Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PresetFile {
    name: String,
    mode: String,
    preamp: f32,
    graphic_bands: Vec<f32>,
    parametric_bands: Vec<ParamBand>,
    favorite: Option<bool>,
}

#[derive(Default)]
struct LiveEngineState {
    stop_tx: Mutex<Option<mpsc::Sender<()>>>,
    processor_l: Mutex<Option<Arc<Mutex<EqProcessor>>>>,
    processor_r: Mutex<Option<Arc<Mutex<EqProcessor>>>>,
    sample_rate: Mutex<f32>,
    spectrum: Arc<Mutex<Vec<f32>>>,
    latency_ms: Arc<Mutex<f32>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AudioDevice {
    id: String,
    name: String,
    kind: String,
    is_default: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ParamBand {
    id: u32,

    #[serde(rename = "type")]
    band_type: String,

    freq: f32,
    gain: f32,
    q: f32,
    color: String,
    enabled: bool,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EqState {
    mode: String,
    preamp: f32,
    graphic_bands: Vec<f32>,
    parametric_bands: Vec<ParamBand>,
}

#[tauri::command]
fn get_live_latency(live_state: tauri::State<LiveEngineState>) -> Result<f32, String> {
    let latency = live_state.latency_ms.lock().map_err(|e| e.to_string())?;

    Ok(*latency)
}

#[tauri::command]
fn get_live_spectrum(live_state: tauri::State<LiveEngineState>) -> Result<Vec<f32>, String> {
    let spectrum = live_state.spectrum.lock().map_err(|e| e.to_string())?;

    Ok(spectrum.clone())
}

#[tauri::command]
fn list_audio_devices() -> Vec<AudioDevice> {
    let host = cpal::default_host();

    let default_input_name = host.default_input_device().and_then(|d| d.name().ok());
    let default_output_name = host.default_output_device().and_then(|d| d.name().ok());

    let mut devices = Vec::new();

    if let Ok(input_devices) = host.input_devices() {
        for device in input_devices {
            if let Ok(name) = device.name() {
                devices.push(AudioDevice {
                    id: format!("input::{}", name),
                    name: name.clone(),
                    kind: "input".into(),
                    is_default: default_input_name.as_ref() == Some(&name),
                });
            }
        }
    }

    if let Ok(output_devices) = host.output_devices() {
        for device in output_devices {
            if let Ok(name) = device.name() {
                devices.push(AudioDevice {
                    id: format!("output::{}", name),
                    name: name.clone(),
                    kind: "output".into(),
                    is_default: default_output_name.as_ref() == Some(&name),
                });
            }
        }
    }

    devices
}

#[tauri::command]
fn apply_eq_preview(state: EqState) -> Result<String, String> {
    if state.graphic_bands.len() != 10 {
        return Err("Expected exactly 10 graphic EQ bands.".into());
    }

    let mut output = String::new();

    output.push_str("Resona DSP Preview\n");
    output.push_str("==================\n\n");

    output.push_str(&format!("Mode: {}\n", state.mode));
    output.push_str(&format!("Preamp: {:.1} dB\n\n", state.preamp));

    output.push_str("Graphic EQ\n");
    output.push_str("----------\n");

    let freqs = [
        "31", "62", "125", "250", "500", "1k", "2k", "4k", "8k", "16k",
    ];

    for (i, gain) in state.graphic_bands.iter().enumerate() {
        let freq = freqs.get(i).unwrap_or(&"?");

        output.push_str(&format!(
            "Band {:02} | {:>5} Hz | {:+.1} dB\n",
            i + 1,
            freq,
            gain
        ));
    }

    output.push_str("\nParametric EQ\n");
    output.push_str("-------------\n");

    if state.parametric_bands.is_empty() {
        output.push_str("No parametric bands received.\n");
    } else {
        for band in state.parametric_bands.iter() {
            let status = if band.enabled { "ON " } else { "OFF" };

            let gain_text = match band.band_type.as_str() {
                "highPass" | "lowPass" => "Cut filter".to_string(),
                _ => format!("{:+.1} dB", band.gain),
            };

            output.push_str(&format!(
                "Band {:02} | {} | {:<9} | {:>7.1} Hz | {:>10} | Q {:.1}\n",
                band.id, status, band.band_type, band.freq, gain_text, band.q
            ));
        }
    }

    output.push_str("\nEngine Notes\n");
    output.push_str("------------\n");
    output.push_str("Frontend EQ state is reaching Rust.\n");

    Ok(output)
}

#[tauri::command]
fn start_standalone_engine(output_device_id: String) -> String {
    format!("Running on {}", output_device_id)
}

#[tauri::command]
fn stop_standalone_engine() -> String {
    "Offline".into()
}

#[tauri::command]
fn test_dsp_engine(state: EqState) -> Result<String, String> {
    let sample_rate = 44_100.0;
    let duration_seconds = 1.0;
    let sample_count = (sample_rate * duration_seconds) as usize;

    let bands = build_eq_bands(&state);
    let mut processor = EqProcessor::new(sample_rate, state.preamp, bands);

    let mut buffer: Vec<f32> = (0..sample_count)
        .map(|i| {
            let t = i as f32 / sample_rate;
            let sine_80 = (2.0 * std::f32::consts::PI * 80.0 * t).sin() * 0.25;
            let sine_1000 = (2.0 * std::f32::consts::PI * 1000.0 * t).sin() * 0.25;
            let sine_8000 = (2.0 * std::f32::consts::PI * 8000.0 * t).sin() * 0.25;

            sine_80 + sine_1000 + sine_8000
        })
        .collect();

    let before_rms = dsp::rms(&buffer);
    processor.process_buffer(&mut buffer);
    let after_rms = dsp::rms(&buffer);

    Ok(format!(
        "Resona DSP Engine Test\n======================\n\nMode: {}\nSample Rate: {:.0} Hz\nSamples Processed: {}\nInput RMS: {:.5}\nOutput RMS: {:.5}\n\nDSP chain built successfully.\nBiquad filters processed a generated test signal.",
        state.mode,
        sample_rate,
        sample_count,
        before_rms,
        after_rms
    ))
}

#[tauri::command]
fn test_dsp_engine_wav(state: EqState) -> Result<String, String> {
    let sample_rate = 44_100.0;
    let duration_seconds = 3.0;
    let sample_count = (sample_rate * duration_seconds) as usize;

    let bands = build_eq_bands(&state);
    let mut processor = EqProcessor::new(sample_rate, state.preamp, bands);

    let mut buffer: Vec<f32> = (0..sample_count)
        .map(|i| {
            let t = i as f32 / sample_rate;

            let sub = (2.0 * std::f32::consts::PI * 60.0 * t).sin() * 0.35;
            let mids = (2.0 * std::f32::consts::PI * 1000.0 * t).sin() * 0.25;
            let highs = (2.0 * std::f32::consts::PI * 9000.0 * t).sin() * 0.15;

            sub + mids + highs
        })
        .collect();

    processor.process_buffer(&mut buffer);

    let spec = hound::WavSpec {
        channels: 1,
        sample_rate: sample_rate as u32,
        bits_per_sample: 16,
        sample_format: hound::SampleFormat::Int,
    };

    let path = "resona_dsp_test.wav";

    let mut writer = hound::WavWriter::create(path, spec).map_err(|e| e.to_string())?;

    for sample in buffer {
        let value = (sample.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;
        writer.write_sample(value).map_err(|e| e.to_string())?;
    }

    writer.finalize().map_err(|e| e.to_string())?;

    Ok(format!(
        "DSP WAV test exported successfully.\n\nFile: {}",
        path
    ))
}

#[tauri::command]
fn play_dsp_test_tone(state: EqState, output_device_id: String) -> Result<String, String> {
    let host = cpal::default_host();

    let output_name = output_device_id.replace("output::", "");

    let device = host
        .output_devices()
        .map_err(|e| e.to_string())?
        .find(|d| d.name().ok().as_deref() == Some(output_name.as_str()))
        .ok_or("Output device not found")?;

    let supported_config = device.default_output_config().map_err(|e| e.to_string())?;
    let sample_format = supported_config.sample_format();
    let config: cpal::StreamConfig = supported_config.into();

    let sample_rate = config.sample_rate.0 as f32;
    let channels = config.channels as usize;

    let bands = build_eq_bands(&state);

    match sample_format {
        cpal::SampleFormat::F32 => {
            play_stream_f32(device, config, sample_rate, channels, bands, state.preamp)
        }
        cpal::SampleFormat::I16 => {
            play_stream_i16(device, config, sample_rate, channels, bands, state.preamp)
        }
        cpal::SampleFormat::U16 => {
            play_stream_u16(device, config, sample_rate, channels, bands, state.preamp)
        }
        _ => Err("Unsupported sample format".into()),
    }
}

#[tauri::command]
fn start_live_engine(
    state: EqState,
    input_device_id: String,
    output_device_id: String,
    live_state: tauri::State<LiveEngineState>,
) -> Result<String, String> {
    if input_device_id == output_device_id {
        return Err("Input and output device must be different to avoid feedback.".into());
    }

    let mut current = live_state.stop_tx.lock().map_err(|e| e.to_string())?;

    if current.is_some() {
        return Err("Live engine is already running.".into());
    }

    let sample_rate = 44_100.0;
    let processor_l = Arc::new(Mutex::new(EqProcessor::new(
        sample_rate,
        state.preamp,
        build_eq_bands(&state),
    )));

    let processor_r = Arc::new(Mutex::new(EqProcessor::new(
        sample_rate,
        state.preamp,
        build_eq_bands(&state),
    )));

    *live_state.spectrum.lock().map_err(|e| e.to_string())? = vec![0.0; 96];
    *live_state.processor_l.lock().map_err(|e| e.to_string())? = Some(Arc::clone(&processor_l));
    *live_state.processor_r.lock().map_err(|e| e.to_string())? = Some(Arc::clone(&processor_r));
    *live_state.sample_rate.lock().map_err(|e| e.to_string())? = sample_rate;

    let (tx, rx) = mpsc::channel::<()>();
    *current = Some(tx);

    let spectrum_state = Arc::clone(&live_state.spectrum);
    let latency_state = Arc::clone(&live_state.latency_ms);

    std::thread::spawn(move || {
        if let Err(err) = run_live_engine_thread(
            state,
            input_device_id,
            output_device_id,
            rx,
            processor_l,
            processor_r,
            spectrum_state,
            latency_state,
        ) {
            eprintln!("Live engine error: {}", err);
        }
    });

    Ok("Live engine started. Routing capture → Resona DSP → playback.".into())
}

#[tauri::command]
fn stop_live_engine(live_state: tauri::State<LiveEngineState>) -> Result<String, String> {
    let mut current = live_state.stop_tx.lock().map_err(|e| e.to_string())?;

    if let Some(tx) = current.take() {
        let _ = tx.send(());

        *live_state.processor_l.lock().map_err(|e| e.to_string())? = None;
        *live_state.processor_r.lock().map_err(|e| e.to_string())? = None;

        Ok("Live engine stopped.".into())
    } else {
        Ok("Live engine was not running.".into())
    }
}

#[tauri::command]
fn update_live_eq(
    state: EqState,
    live_state: tauri::State<LiveEngineState>,
) -> Result<String, String> {
    let sample_rate = *live_state.sample_rate.lock().map_err(|e| e.to_string())?;

    let processor_l = live_state
        .processor_l
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Live engine is not running.")?;

    let processor_r = live_state
        .processor_r
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or("Live engine is not running.")?;

    let new_l = EqProcessor::new(sample_rate, state.preamp, build_eq_bands(&state));
    let new_r = EqProcessor::new(sample_rate, state.preamp, build_eq_bands(&state));

    *processor_l.lock().map_err(|e| e.to_string())? = new_l;
    *processor_r.lock().map_err(|e| e.to_string())? = new_r;

    Ok("Live EQ updated.".into())
}

#[tauri::command]
fn save_preset(app: tauri::AppHandle, name: String, preset: PresetFile) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("presets");

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let safe_name = name.replace("/", "-").replace("\\", "-");
    let path = dir.join(format!("{safe_name}.json"));

    let json = serde_json::to_string_pretty(&preset).map_err(|e| e.to_string())?;

    std::fs::write(path, json).map_err(|e| e.to_string())?;

    Ok(())
}
#[tauri::command]
fn load_presets(app: tauri::AppHandle) -> Result<Vec<PresetFile>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("presets");

    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut presets = Vec::new();

    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }

        let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;

        if let Ok(preset) = serde_json::from_str::<PresetFile>(&content) {
            presets.push(preset);
        }
    }

    Ok(presets)
}

#[tauri::command]
fn delete_preset(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("presets");

    let safe_name = name.replace("/", "-").replace("\\", "-");
    let path = dir.join(format!("{safe_name}.json"));

    if path.exists() {
        std::fs::remove_file(path).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn get_resona_data_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    Ok(dir.display().to_string())
}

#[tauri::command]
fn export_preset(app: tauri::AppHandle, name: String) -> Result<String, String> {
    let appdata = app.path().app_data_dir().map_err(|e| e.to_string())?;

    let presets_dir = appdata.join("presets");
    let exports_dir = appdata.join("exports");

    std::fs::create_dir_all(&presets_dir).map_err(|e| e.to_string())?;

    std::fs::create_dir_all(&exports_dir).map_err(|e| e.to_string())?;

    let safe_name = name.replace("/", "-").replace("\\", "-");

    let preset_path = presets_dir.join(format!("{}.json", safe_name));

    if !preset_path.exists() {
        return Err(format!("Preset '{}' does not exist.", safe_name));
    }

    let content = std::fs::read_to_string(&preset_path).map_err(|e| e.to_string())?;

    let export_path = exports_dir.join(format!("{}.json", safe_name));

    std::fs::write(&export_path, content).map_err(|e| e.to_string())?;

    Ok(export_path.display().to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let appdata = app.path().app_data_dir()?;

            std::fs::create_dir_all(appdata.join("presets"))?;
            std::fs::create_dir_all(appdata.join("profiles"))?;
            std::fs::create_dir_all(appdata.join("exports"))?;

            println!("Resona data directory: {:?}", appdata);

            let show_item = MenuItem::with_id(app, "show", "Show Resona", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide Resona", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit Resona", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .tooltip("ResonaEQ")
                .icon(app.default_window_icon().unwrap().clone())
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();

                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            Ok(())
        })
        .manage(LiveEngineState::default())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_audio_devices,
            apply_eq_preview,
            test_dsp_engine,
            test_dsp_engine_wav,
            play_dsp_test_tone,
            start_live_engine,
            stop_live_engine,
            start_standalone_engine,
            stop_standalone_engine,
            get_live_spectrum,
            get_resona_data_dir,
            save_preset,
            load_presets,
            delete_preset,
            export_preset,
            get_live_latency,
            update_live_eq
        ])
        .run(tauri::generate_context!())
        .expect("error while running Resona");
}

fn compute_spectrum(samples: &[f32]) -> Vec<f32> {
    let fft_size = 1024;

    if samples.len() < fft_size {
        return vec![0.0; 96];
    }

    let start = samples.len() - fft_size;
    let window = &samples[start..];

    let mut planner = FftPlanner::<f32>::new();
    let fft = planner.plan_fft_forward(fft_size);

    let mut buffer: Vec<Complex<f32>> = window
        .iter()
        .enumerate()
        .map(|(i, sample)| {
            let hann =
                0.5 - 0.5 * ((2.0 * std::f32::consts::PI * i as f32) / fft_size as f32).cos();

            Complex {
                re: sample * hann,
                im: 0.0,
            }
        })
        .collect();

    fft.process(&mut buffer);

    let bin_count = 96;
    let half_fft = fft_size / 2;

    let mut spectrum = Vec::with_capacity(bin_count);

    for i in 0..bin_count {
        let start_bin = ((i as f32 / bin_count as f32).powf(2.0) * half_fft as f32) as usize;
        let end_bin = (((i + 1) as f32 / bin_count as f32).powf(2.0) * half_fft as f32) as usize;

        let start_bin = start_bin.max(1).min(half_fft - 1);
        let end_bin = end_bin.max(start_bin + 1).min(half_fft);

        let mut sum = 0.0;

        for bin in start_bin..end_bin {
            let mag = buffer[bin].norm();
            sum += mag;
        }

        let avg = sum / (end_bin - start_bin) as f32;

        let db = 20.0 * avg.max(0.000001).log10();
        let normalized = ((db + 80.0) / 80.0).clamp(0.0, 1.0);

        spectrum.push(normalized);
    }

    spectrum
}

fn run_live_engine_thread(
    state: EqState,
    input_device_id: String,
    output_device_id: String,
    stop_rx: mpsc::Receiver<()>,
    processor_l: Arc<Mutex<EqProcessor>>,
    processor_r: Arc<Mutex<EqProcessor>>,
    spectrum_state: Arc<Mutex<Vec<f32>>>,
    latency_state: Arc<Mutex<f32>>,
) -> Result<(), String> {
    let host = cpal::default_host();

    let input_name = input_device_id
        .replace("input::", "")
        .replace("output::", "");

    let output_name = output_device_id.replace("output::", "");

    let output_device = host
        .output_devices()
        .map_err(|e| e.to_string())?
        .find(|d| d.name().ok().as_deref() == Some(output_name.as_str()))
        .ok_or("Output device not found")?;

    let output_config = output_device
        .default_output_config()
        .map_err(|e| e.to_string())?;

    let output_channels = output_config.channels() as usize;
    let output_sample_rate = output_config.sample_rate().0 as f32;

    let rb = HeapRb::<StereoFrame>::new(44_100 * 4);
    let (producer, consumer) = rb.split();

    let shared_producer = Arc::new(Mutex::new(producer));
    let shared_consumer = Arc::new(Mutex::new(consumer));

    std::thread::spawn({
        let shared_producer = Arc::clone(&shared_producer);
        let input_name = input_name.clone();

        move || {
            if let Err(err) = loopback::start_loopback_capture(input_name, shared_producer) {
                eprintln!("Loopback capture error: {}", err);
            }
        }
    });

    let analyzer_buffer = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(8192)));

    std::thread::spawn({
        let analyzer_buffer = Arc::clone(&analyzer_buffer);
        let spectrum_state = Arc::clone(&spectrum_state);

        move || loop {
            let samples: Vec<f32> = match analyzer_buffer.lock() {
                Ok(buffer) => buffer.iter().copied().collect(),
                Err(_) => Vec::new(),
            };

            let spectrum = compute_spectrum(&samples);

            if let Ok(mut target) = spectrum_state.lock() {
                *target = spectrum;
            }

            std::thread::sleep(std::time::Duration::from_millis(33));
        }
    });

    let output_stream = build_output_stream(
        output_device,
        output_config,
        output_channels,
        Arc::clone(&shared_consumer),
        Arc::clone(&processor_l),
        Arc::clone(&processor_r),
        Arc::clone(&analyzer_buffer),
        Arc::clone(&latency_state),
        output_sample_rate,
    )?;

    output_stream.play().map_err(|e| e.to_string())?;

    loop {
        if stop_rx.try_recv().is_ok() {
            break;
        }

        std::thread::sleep(std::time::Duration::from_millis(50));
    }

    drop(output_stream);

    Ok(())
}

fn build_output_stream<C>(
    device: cpal::Device,
    supported_config: cpal::SupportedStreamConfig,
    channels: usize,
    shared_consumer: Arc<Mutex<C>>,
    processor_l: Arc<Mutex<EqProcessor>>,
    processor_r: Arc<Mutex<EqProcessor>>,
    analyzer_buffer: Arc<Mutex<VecDeque<f32>>>,
    latency_state: Arc<Mutex<f32>>,
    sample_rate: f32,
) -> Result<cpal::Stream, String>
where
    C: Consumer<Item = StereoFrame> + Send + 'static,
{
    let sample_format = supported_config.sample_format();
    let config: cpal::StreamConfig = supported_config.into();

    match sample_format {
        cpal::SampleFormat::F32 => device
            .build_output_stream(
                &config,
                move |data: &mut [f32], _| {
                    fill_output_stereo(
                        data,
                        channels,
                        &shared_consumer,
                        &processor_l,
                        &processor_r,
                        &analyzer_buffer,
                        &latency_state,
                        sample_rate,
                        |x| x,
                    );
                },
                move |err| eprintln!("Output stream error: {:?}", err),
                None,
            )
            .map_err(|e| e.to_string()),

        cpal::SampleFormat::I16 => device
            .build_output_stream(
                &config,
                move |data: &mut [i16], _| {
                    fill_output_stereo(
                        data,
                        channels,
                        &shared_consumer,
                        &processor_l,
                        &processor_r,
                        &analyzer_buffer,
                        &latency_state,
                        sample_rate,
                        |x| (x.clamp(-1.0, 1.0) * i16::MAX as f32) as i16,
                    );
                },
                move |err| eprintln!("Output stream error: {:?}", err),
                None,
            )
            .map_err(|e| e.to_string()),

        cpal::SampleFormat::U16 => device
            .build_output_stream(
                &config,
                move |data: &mut [u16], _| {
                    fill_output_stereo(
                        data,
                        channels,
                        &shared_consumer,
                        &processor_l,
                        &processor_r,
                        &analyzer_buffer,
                        &latency_state,
                        sample_rate,
                        |x| ((x.clamp(-1.0, 1.0) * 0.5 + 0.5) * u16::MAX as f32) as u16,
                    );
                },
                move |err| eprintln!("Output stream error: {:?}", err),
                None,
            )
            .map_err(|e| e.to_string()),

        _ => Err("Unsupported output sample format.".into()),
    }
}

fn fill_output_stereo<T, F, C>(
    data: &mut [T],
    channels: usize,
    shared_consumer: &Arc<Mutex<C>>,
    processor_l: &Arc<Mutex<EqProcessor>>,
    processor_r: &Arc<Mutex<EqProcessor>>,
    analyzer_buffer: &Arc<Mutex<VecDeque<f32>>>,
    latency_state: &Arc<Mutex<f32>>,
    sample_rate: f32,
    convert: F,
) where
    C: Consumer<Item = StereoFrame>,
    F: Fn(f32) -> T,
{
    let queued_frames = shared_consumer
        .lock()
        .map(|consumer| consumer.occupied_len())
        .unwrap_or(0);

    let estimated_ms = (queued_frames as f32 / sample_rate) * 1000.0;

    if let Ok(mut latency) = latency_state.lock() {
        *latency = estimated_ms;
    }

    for frame in data.chunks_mut(channels) {
        let input = shared_consumer
            .lock()
            .ok()
            .and_then(|mut consumer| consumer.try_pop())
            .unwrap_or([0.0, 0.0]);

        let left = processor_l
            .lock()
            .map(|mut p| p.process_sample(input[0]))
            .unwrap_or(input[0]);

        let right = processor_r
            .lock()
            .map(|mut p| p.process_sample(input[1]))
            .unwrap_or(input[1]);

        let mono_for_fft = (left + right) * 0.5;

        if let Ok(mut buffer) = analyzer_buffer.lock() {
            if buffer.len() >= 4096 {
                buffer.pop_front();
            }

            buffer.push_back(mono_for_fft);
        }

        if channels == 1 {
            frame[0] = convert(mono_for_fft);
        } else {
            frame[0] = convert(left);

            if frame.len() > 1 {
                frame[1] = convert(right);
            }

            for sample in frame.iter_mut().skip(2) {
                *sample = convert(mono_for_fft);
            }
        }
    }
}

fn build_eq_bands(state: &EqState) -> Vec<EqBand> {
    let mut dsp_bands = Vec::new();

    if state.mode == "graphic" {
        let freqs = [
            31.0, 62.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
        ];

        for (freq, gain) in freqs.iter().zip(state.graphic_bands.iter()) {
            dsp_bands.push(EqBand {
                filter_type: FilterType::Bell,
                freq: *freq,
                gain_db: *gain,
                q: 1.0,
                enabled: true,
            });
        }
    } else {
        for band in state.parametric_bands.iter() {
            dsp_bands.push(EqBand {
                filter_type: parse_filter_type(&band.band_type),
                freq: band.freq,
                gain_db: band.gain,
                q: band.q,
                enabled: band.enabled,
            });
        }
    }

    dsp_bands
}

fn parse_filter_type(value: &str) -> FilterType {
    match value {
        "lowShelf" => FilterType::LowShelf,
        "highShelf" => FilterType::HighShelf,
        "highPass" => FilterType::HighPass,
        "lowPass" => FilterType::LowPass,
        _ => FilterType::Bell,
    }
}

fn make_test_sample(phase: f32, sample_rate: f32) -> f32 {
    let t = phase / sample_rate;

    let low = (2.0 * std::f32::consts::PI * 80.0 * t).sin() * 0.35;
    let mid = (2.0 * std::f32::consts::PI * 1000.0 * t).sin() * 0.25;
    let high = (2.0 * std::f32::consts::PI * 8000.0 * t).sin() * 0.18;

    low + mid + high
}

fn play_stream_f32(
    device: cpal::Device,
    config: cpal::StreamConfig,
    sample_rate: f32,
    channels: usize,
    bands: Vec<EqBand>,
    preamp: f32,
) -> Result<String, String> {
    let mut processor = EqProcessor::new(sample_rate, preamp, bands);
    let mut phase = 0.0_f32;

    let stream = device
        .build_output_stream(
            &config,
            move |data: &mut [f32], _| {
                for frame in data.chunks_mut(channels) {
                    let raw = make_test_sample(phase, sample_rate);
                    let processed = processor.process_sample(raw);

                    for sample in frame.iter_mut() {
                        *sample = processed;
                    }

                    phase += 1.0;
                }
            },
            move |err| eprintln!("Audio stream error: {:?}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_secs(5));
    drop(stream);

    Ok("Played 5-second DSP test tone as F32.".into())
}

fn play_stream_i16(
    device: cpal::Device,
    config: cpal::StreamConfig,
    sample_rate: f32,
    channels: usize,
    bands: Vec<EqBand>,
    preamp: f32,
) -> Result<String, String> {
    let mut processor = EqProcessor::new(sample_rate, preamp, bands);
    let mut phase = 0.0_f32;

    let stream = device
        .build_output_stream(
            &config,
            move |data: &mut [i16], _| {
                for frame in data.chunks_mut(channels) {
                    let raw = make_test_sample(phase, sample_rate);
                    let processed = processor.process_sample(raw);
                    let output = (processed.clamp(-1.0, 1.0) * i16::MAX as f32) as i16;

                    for sample in frame.iter_mut() {
                        *sample = output;
                    }

                    phase += 1.0;
                }
            },
            move |err| eprintln!("Audio stream error: {:?}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_secs(5));
    drop(stream);

    Ok("Played 5-second DSP test tone as I16.".into())
}

fn play_stream_u16(
    device: cpal::Device,
    config: cpal::StreamConfig,
    sample_rate: f32,
    channels: usize,
    bands: Vec<EqBand>,
    preamp: f32,
) -> Result<String, String> {
    let mut processor = EqProcessor::new(sample_rate, preamp, bands);
    let mut phase = 0.0_f32;

    let stream = device
        .build_output_stream(
            &config,
            move |data: &mut [u16], _| {
                for frame in data.chunks_mut(channels) {
                    let raw = make_test_sample(phase, sample_rate);
                    let processed = processor.process_sample(raw).clamp(-1.0, 1.0);
                    let output = ((processed * 0.5 + 0.5) * u16::MAX as f32) as u16;

                    for sample in frame.iter_mut() {
                        *sample = output;
                    }

                    phase += 1.0;
                }
            },
            move |err| eprintln!("Audio stream error: {:?}", err),
            None,
        )
        .map_err(|e| e.to_string())?;

    stream.play().map_err(|e| e.to_string())?;
    std::thread::sleep(std::time::Duration::from_secs(5));
    drop(stream);

    Ok("Played 5-second DSP test tone as U16.".into())
}
