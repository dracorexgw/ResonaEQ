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
