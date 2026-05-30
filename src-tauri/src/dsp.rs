use std::f32::consts::PI;

#[derive(Clone, Debug)]
pub enum FilterType {
    Bell,
    LowShelf,
    HighShelf,
    HighPass,
    LowPass,
}

#[derive(Clone, Debug)]
pub struct EqBand {
    pub filter_type: FilterType,
    pub freq: f32,
    pub gain_db: f32,
    pub q: f32,
    pub enabled: bool,
}

#[derive(Clone, Debug)]
pub struct Biquad {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
    z1: f32,
    z2: f32,
}

impl Biquad {
    pub fn new(filter_type: FilterType, sample_rate: f32, freq: f32, gain_db: f32, q: f32) -> Self {
        let freq = freq.clamp(20.0, sample_rate * 0.45);
        let q = q.max(0.1);

        let omega = 2.0 * PI * freq / sample_rate;
        let sin = omega.sin();
        let cos = omega.cos();
        let alpha = sin / (2.0 * q);
        let a = 10.0_f32.powf(gain_db / 40.0);

        let (b0, b1, b2, a0, a1, a2) = match filter_type {
            FilterType::Bell => (
                1.0 + alpha * a,
                -2.0 * cos,
                1.0 - alpha * a,
                1.0 + alpha / a,
                -2.0 * cos,
                1.0 - alpha / a,
            ),

            FilterType::LowShelf => {
                let sqrt_a = a.sqrt();
                let two_sqrt_a_alpha = 2.0 * sqrt_a * alpha;

                (
                    a * ((a + 1.0) - (a - 1.0) * cos + two_sqrt_a_alpha),
                    2.0 * a * ((a - 1.0) - (a + 1.0) * cos),
                    a * ((a + 1.0) - (a - 1.0) * cos - two_sqrt_a_alpha),
                    (a + 1.0) + (a - 1.0) * cos + two_sqrt_a_alpha,
                    -2.0 * ((a - 1.0) + (a + 1.0) * cos),
                    (a + 1.0) + (a - 1.0) * cos - two_sqrt_a_alpha,
                )
            }

            FilterType::HighShelf => {
                let sqrt_a = a.sqrt();
                let two_sqrt_a_alpha = 2.0 * sqrt_a * alpha;

                (
                    a * ((a + 1.0) + (a - 1.0) * cos + two_sqrt_a_alpha),
                    -2.0 * a * ((a - 1.0) + (a + 1.0) * cos),
                    a * ((a + 1.0) + (a - 1.0) * cos - two_sqrt_a_alpha),
                    (a + 1.0) - (a - 1.0) * cos + two_sqrt_a_alpha,
                    2.0 * ((a - 1.0) - (a + 1.0) * cos),
                    (a + 1.0) - (a - 1.0) * cos - two_sqrt_a_alpha,
                )
            }

            FilterType::HighPass => (
                (1.0 + cos) / 2.0,
                -(1.0 + cos),
                (1.0 + cos) / 2.0,
                1.0 + alpha,
                -2.0 * cos,
                1.0 - alpha,
            ),

            FilterType::LowPass => (
                (1.0 - cos) / 2.0,
                1.0 - cos,
                (1.0 - cos) / 2.0,
                1.0 + alpha,
                -2.0 * cos,
                1.0 - alpha,
            ),
        };

        Self {
            b0: b0 / a0,
            b1: b1 / a0,
            b2: b2 / a0,
            a1: a1 / a0,
            a2: a2 / a0,
            z1: 0.0,
            z2: 0.0,
        }
    }

    pub fn process(&mut self, input: f32) -> f32 {
        let output = input * self.b0 + self.z1;
        self.z1 = input * self.b1 + self.z2 - self.a1 * output;
        self.z2 = input * self.b2 - self.a2 * output;
        output
    }
}

pub struct EqProcessor {
    filters: Vec<Biquad>,
    preamp_gain: f32,
}

impl EqProcessor {
    pub fn new(sample_rate: f32, preamp_db: f32, bands: Vec<EqBand>) -> Self {
        let filters = bands
            .into_iter()
            .filter(|band| band.enabled)
            .map(|band| {
                let gain = match band.filter_type {
                    FilterType::HighPass | FilterType::LowPass => 0.0,
                    _ => band.gain_db,
                };

                Biquad::new(band.filter_type, sample_rate, band.freq, gain, band.q)
            })
            .collect();

        Self {
            filters,
            preamp_gain: db_to_gain(preamp_db),
        }
    }

    pub fn process_sample(&mut self, sample: f32) -> f32 {
        let mut x = sample * self.preamp_gain;

        for filter in self.filters.iter_mut() {
            x = filter.process(x);
        }

        let output = x * 0.95;

        output.clamp(-1.0, 1.0)
    }

    pub fn process_buffer(&mut self, buffer: &mut [f32]) {
        for sample in buffer.iter_mut() {
            *sample = self.process_sample(*sample);
        }
    }
}

pub fn db_to_gain(db: f32) -> f32 {
    10.0_f32.powf(db / 20.0)
}

pub fn rms(buffer: &[f32]) -> f32 {
    let sum = buffer.iter().map(|x| x * x).sum::<f32>();
    (sum / buffer.len() as f32).sqrt()
}

pub fn soft_clip(x: f32) -> f32 {
    let drive = 1.15;
    let driven = x * drive;

    driven / (1.0 + driven.abs())
}
