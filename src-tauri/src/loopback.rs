use std::{
    collections::VecDeque,
    sync::{Arc, Mutex},
    thread,
};

use ringbuf::{traits::Producer, HeapProd};
use wasapi::*;

type StereoFrame = [f32; 2];

pub fn start_loopback_capture(
    render_device_name: String,
    shared_producer: Arc<Mutex<HeapProd<StereoFrame>>>,
) -> Result<(), String> {
    let hr = initialize_mta();

    if hr.is_err() {
        return Err(format!("Failed to initialize WASAPI MTA: {:?}", hr));
    }

    let enumerator = DeviceEnumerator::new().map_err(|e| format!("{:?}", e))?;

    // Use default Windows render endpoint.
    // Set Windows default output to CABLE Input for VB-CABLE testing.
    let device = enumerator
        .get_default_device(&Direction::Render)
        .map_err(|e| format!("{:?}", e))?;

    let mut audio_client = device.get_iaudioclient().map_err(|e| format!("{:?}", e))?;

    let desired_format = WaveFormat::new(32, 32, &SampleType::Float, 44_100, 2, None);

    let block_align = desired_format.get_blockalign();

    let (_default_time, min_time) = audio_client
        .get_device_period()
        .map_err(|e| format!("{:?}", e))?;

    let mode = StreamMode::EventsShared {
        autoconvert: true,
        buffer_duration_hns: min_time,
    };

    audio_client
        .initialize_client(&desired_format, &Direction::Capture, &mode)
        .map_err(|e| format!("{:?}", e))?;

    let event_handle = audio_client
        .set_get_eventhandle()
        .map_err(|e| format!("{:?}", e))?;

    let capture_client = audio_client
        .get_audiocaptureclient()
        .map_err(|e| format!("{:?}", e))?;

    let mut raw_queue: VecDeque<u8> = VecDeque::with_capacity(100 * block_align as usize * 4096);

    audio_client
        .start_stream()
        .map_err(|e| format!("{:?}", e))?;

    eprintln!(
        "WASAPI loopback capture started on render endpoint: {}",
        render_device_name
    );

    loop {
        capture_client
            .read_from_device_to_deque(&mut raw_queue)
            .map_err(|e| format!("{:?}", e))?;

        // 32-bit float stereo = 8 bytes per frame.
        while raw_queue.len() >= 8 {
            let l0 = raw_queue.pop_front().unwrap();
            let l1 = raw_queue.pop_front().unwrap();
            let l2 = raw_queue.pop_front().unwrap();
            let l3 = raw_queue.pop_front().unwrap();

            let r0 = raw_queue.pop_front().unwrap();
            let r1 = raw_queue.pop_front().unwrap();
            let r2 = raw_queue.pop_front().unwrap();
            let r3 = raw_queue.pop_front().unwrap();

            let left = f32::from_le_bytes([l0, l1, l2, l3]);
            let right = f32::from_le_bytes([r0, r1, r2, r3]);

            if let Ok(mut producer) = shared_producer.lock() {
                let _ = producer.try_push([left, right]);
            }
        }

        let _ = event_handle.wait_for_event(1000);

        thread::sleep(std::time::Duration::from_millis(1));
    }
}
