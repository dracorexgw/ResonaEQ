# Resona

A Spotify-style standalone system audio control app scaffold built with Tauri, React, Tailwind CSS v4, and Rust.

## Important

This version is **not** an Equalizer APO skin. It removes APO config writing and uses a standalone architecture scaffold.

The GUI works now, including:

- Spotify-style dark interface
- EQ sliders and preamp
- Presets
- Startup toggle
- Device selector placeholder
- Rust command bridge
- DSP preview command
- Standalone engine start/stop placeholder

True system-wide audio processing on Windows requires a virtual audio driver or a WASAPI routing service. This scaffold is ready for that next step, but it does not yet install a signed virtual audio device.

## Run

```bash
npm install
npm run tauri:dev
```

or:

```bash
npm install
npm run tauri dev
```

## Next production steps

1. Add a Rust DSP crate for real filter processing.
2. Add WASAPI device enumeration using Rust/Windows APIs.
3. Build a background audio routing service.
4. Add a signed virtual audio device named `Resona Audio`.
5. Route: Windows Output → Resona Virtual Device → DSP Engine → Selected Real Device.

## File locations

- UI: `src/App.tsx`
- Frontend audio bridge: `src/lib/audio.ts`
- Rust commands: `src-tauri/src/lib.rs`
- Tauri config: `src-tauri/tauri.conf.json`

# ResonaEQ v1.5.0

A modern real-time system-wide audio equalizer for Windows.

ResonaEQ allows you to apply DSP-based equalization to any audio source without requiring Equalizer APO. Built with Tauri, Rust, React, and CPAL, ResonaEQ provides a clean interface for audio tuning, custom presets, and real-time audio processing.

---

# Features

## Real-Time Live Audio Processing

- System-wide audio equalization
- Real-time DSP engine
- Low-latency audio routing
- Live EQ updates without restarting playback

## Equalizer Modes

- 10-Band Graphic Equalizer
- Parametric Equalizer
- Adjustable preamp control
- Real-time frequency response visualization

## Preset Management

- Save custom presets
- Load presets instantly
- Import presets from JSON
- Export presets to JSON
- Favorite presets for quick access
- Dedicated Preset Manager

## Audio Device Management

- Select capture device
- Select output device
- Automatic device persistence
- Auto-restart engine when devices change

## Monitoring

- Live FFT Spectrum Analyzer
- Latency Monitoring
- System Health Dashboard
- Audio Routing Status

## Convenience

- Setup Wizard
- Launch on Startup
- Auto-start Live Engine
- Persistent settings and presets

---

# Installation

## Requirements

- Windows 10 or Windows 11

## Recommended

VB-CABLE Virtual Audio Device

Download:

https://vb-audio.com/Cable/

## Installation Steps

1. Download the latest ResonaEQ installer.
2. Run the installer.
3. Launch ResonaEQ.
4. Complete the Setup Wizard.
5. Install VB-CABLE if prompted.
6. Select your preferred output device.
7. Start the Live Engine.

---

# First-Time Setup

## Step 1

Install VB-CABLE.

## Step 2

Set your Windows playback device to:

**CABLE Input (VB-Audio Virtual Cable)**

This allows Windows audio to be routed through ResonaEQ.

## Step 3

Open ResonaEQ.

## Step 4

Configure devices:

### Capture Device

**CABLE Output (VB-Audio Virtual Cable)**

### Output Device

Your headphones, speakers, DAC, or audio interface.

Examples:

- Focusrite USB Audio
- Universal Audio Apollo
- Topping DAC
- Built-in Speakers
- Bluetooth Headphones

## Step 5

Start Live Engine.

You should now hear audio routed through ResonaEQ.

---

# Sample Rate Configuration (Important)

For the best experience, ensure that all audio devices use the same sample rate.

ResonaEQ works best when:

- VB-CABLE Input
- VB-CABLE Output
- Your playback device (Focusrite, Apollo, DAC, Speakers, etc.)

all use the same sample rate.

## Recommended Settings

- 48,000 Hz (48 kHz) - Recommended
- 44,100 Hz (44.1 kHz)

## Windows Configuration

1. Open **Sound Settings**
2. Open **More Sound Settings**
3. Select **VB-CABLE Input**
4. Click **Properties**
5. Open the **Advanced** tab
6. Set the **Default Format**

Repeat the process for:

- VB-CABLE Output
- Your audio interface
- Your speakers or headphones

### Example

VB-CABLE Input:

- 24 bit, 48000 Hz

VB-CABLE Output:

- 24 bit, 48000 Hz

Focusrite USB Audio:

- 24 bit, 48000 Hz

All devices should match.

## Common Symptoms of Mismatched Sample Rates

- No audio playback
- Distorted audio
- Crackling or popping
- Increased latency
- Live Engine startup failures
- Playback at incorrect pitch or speed

If you experience audio issues, verify that all devices are configured to the same sample rate.

---

# Using the Equalizer

## Graphic EQ

The Graphic EQ provides ten frequency bands:

- 31 Hz
- 62 Hz
- 125 Hz
- 250 Hz
- 500 Hz
- 1 kHz
- 2 kHz
- 4 kHz
- 8 kHz
- 16 kHz

Adjust sliders to shape your sound.

## Parametric EQ

The Parametric EQ allows:

- Frequency adjustment
- Gain adjustment
- Q adjustment
- Individual filter control

Ideal for headphone correction and advanced tuning.

---

# Presets

## Factory Presets

Included presets:

- Clean
- Arya Air
- Club Warm
- Vocal Focus

## User Presets

Create your own presets:

1. Configure EQ settings
2. Enter a preset name
3. Click Save

Presets are stored automatically.

## Favorites

Star frequently used presets in the Preset Manager.

Favorite presets appear directly on the Equalizer page for quick access.

---

# Preset Storage

Presets are stored locally at:

```txt
AppData\Roaming\com.yodders.resona\presets
```

Exports are stored at:

```txt
AppData\Roaming\com.yodders.resona\exports
```

---

# Auto-Start Features

## Launch on Startup

Automatically starts ResonaEQ when Windows starts.

## Auto-start Live Engine

Automatically starts audio routing when ResonaEQ launches.

Your previously selected audio devices are restored automatically.

---

# Troubleshooting

## No Audio

Verify:

- VB-CABLE is installed
- Windows output is set to VB-CABLE Input
- Capture device is set to VB-CABLE Output
- Output device is selected
- Live Engine is running

## Distorted or Crackling Audio

Verify that:

- VB-CABLE Input sample rate matches VB-CABLE Output
- VB-CABLE sample rate matches your audio interface
- All devices use either 44.1 kHz or 48 kHz

## Audio Stops After Device Change

ResonaEQ automatically restarts the Live Engine when devices are changed.

If audio does not resume:

1. Stop Live Engine
2. Start Live Engine again

## Live Engine Will Not Start

Verify:

- VB-CABLE is installed
- Devices are selected
- Sample rates match across all devices

---

# Technology Stack

## Frontend

- React
- TypeScript
- TailwindCSS

## Backend

- Rust
- Tauri

## Audio

- CPAL
- Rubato
- Real-Time DSP Processing

---

# Roadmap

## v2.0.0 — Resona Audio Platform

* Resona Virtual Audio Device
* Virtual Playback Device
* Virtual Recording Device
* OBS Native Integration
* Multi-Channel Audio Routing
* Streamer Mode
* Creator Mode

## v2.1.0 — Reference Edition

* AutoEQ Batch Folder Import
* Reference Profile Statistics
* Headphone Comparison Mode
* Multiple Target Curves (Harman, Diffuse Field, Studio Flat)
* Custom Reference Targets
* Profile Versioning
* Backup & Restore Library

## v2.2.0

* Headphone Image Library
* AutoEQ Online Repository
* One-Click Profile Downloads
* Featured Headphone Database
* Community Reference Profiles

## v2.5.0

* OBS Recording Mode
* Post-DSP Recording Support
* Resona Monitor Device
* Improved Device Switching
* Audio Routing Diagnostics
* Live Engine Stability Improvements
* Enhanced Latency Monitoring

## v2.6.0

* Enhanced FFT Analyzer
* Reference Library Search
* Reference Library Filtering
* Preset Renaming
* Preset Duplication
* Bulk Preset Actions
* Profile Import/Export Improvements

## Future

* APO-Based System-Wide Processing
* Crossfeed
* Convolution Filters
* FIR Filter Support
* Room Correction
* Speaker Calibration
* Per-Device Profiles
* Cloud Sync
* Mobile Companion App
* macOS Support
* Linux Support

---


## Future

- APO-Based System-Wide Processing
- Crossfeed
- Convolution Filters
- FIR Filter Support
- Room Correction
- Speaker Calibration
- Per-Device Profiles
- Cloud Sync
- Mobile Companion App
- macOS Support
- Linux Support

---

# License

GPL-3.0 License

---

Built with ❤️ by YODDERS.
