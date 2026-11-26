//! Throttled progress reporting for create and extract.
//!
//! A progress event is forced at a phase or file boundary and throttled in
//! between, so a large drawing does not flood the IPC channel.

use std::time::{Duration, Instant};

use tauri::ipc::Channel;

use super::types::PackageProgress;

const PROGRESS_INTERVAL: Duration = Duration::from_millis(60);

pub(crate) struct Progress {
    channel: Option<Channel<PackageProgress>>,
    phase: String,
    processed: u64,
    total: u64,
    current: String,
    last_emit: Instant,
}

impl Progress {
    pub(crate) fn new(channel: Option<Channel<PackageProgress>>, phase: &str, total: u64) -> Self {
        let mut progress = Self {
            channel,
            phase: phase.to_string(),
            processed: 0,
            total,
            current: String::new(),
            last_emit: Instant::now(),
        };
        progress.send(true);
        progress
    }

    pub(crate) fn start_file(&mut self, file: &str) {
        self.current = file.to_string();
        self.send(true);
    }

    pub(crate) fn add(&mut self, bytes: u64) {
        self.processed = self.processed.saturating_add(bytes);
        if self.last_emit.elapsed() >= PROGRESS_INTERVAL {
            self.send(false);
        }
    }

    pub(crate) fn finish(&mut self) {
        self.processed = self.total;
        self.send(true);
    }

    fn send(&mut self, force: bool) {
        if !force && self.last_emit.elapsed() < PROGRESS_INTERVAL {
            return;
        }
        self.last_emit = Instant::now();
        if let Some(channel) = &self.channel {
            let _ = channel.send(PackageProgress {
                phase: self.phase.clone(),
                processed_bytes: self.processed.min(self.total),
                total_bytes: self.total,
                current_file: self.current.clone(),
            });
        }
    }
}
