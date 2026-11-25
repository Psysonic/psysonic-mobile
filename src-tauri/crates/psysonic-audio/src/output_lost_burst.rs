//! When a lost Android output is reopened (`output_lost`). Android moves the route in bursts
//! (Bluetooth, Android Auto): the first loss reopens the output, and the stream opened on the
//! way can be lost again a moment later. The shared resume debounce dropped that second loss
//! for 900 ms from the first one, so the app showed the song playing on a dead output. Here a
//! burst collapses into one pending reopen, and a loss after that reopen began is taken again.

use std::collections::VecDeque;
use std::time::{Duration, Instant};

/// Losses this close after the first one join its reopen.
pub(crate) const SETTLE: Duration = Duration::from_millis(300);
/// A device that keeps failing: stop after this many reopens within `GIVE_UP_WINDOW`.
const GIVE_UP_AFTER: usize = 6;
const GIVE_UP_WINDOW: Duration = Duration::from_secs(30);

#[derive(Debug)]
pub(crate) struct LossBurst {
    pending: bool,
    reopens: VecDeque<Instant>,
}

impl LossBurst {
    pub(crate) const fn new() -> Self {
        Self {
            pending: false,
            reopens: VecDeque::new(),
        }
    }

    /// A loss was reported. True when the caller schedules a reopen after `SETTLE`.
    pub(crate) fn on_loss(&mut self, now: Instant) -> bool {
        if self.pending {
            return false;
        }
        while self
            .reopens
            .front()
            .is_some_and(|t| now.duration_since(*t) > GIVE_UP_WINDOW)
        {
            self.reopens.pop_front();
        }
        if self.reopens.len() >= GIVE_UP_AFTER {
            return false;
        }
        self.pending = true;
        self.reopens.push_back(now);
        true
    }

    /// The scheduled reopen starts; a loss from here on (also of the stream it opens) counts anew.
    pub(crate) fn reopen_started(&mut self) {
        self.pending = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_burst_of_losses_reopens_once() {
        let mut burst = LossBurst::new();
        let t0 = Instant::now();
        assert!(burst.on_loss(t0));
        assert!(!burst.on_loss(t0 + Duration::from_millis(50)));
        assert!(!burst.on_loss(t0 + Duration::from_millis(250)));
    }

    #[test]
    fn the_reopened_stream_lost_again_soon_after_is_reopened() {
        let mut burst = LossBurst::new();
        let t0 = Instant::now();
        assert!(burst.on_loss(t0));
        burst.reopen_started();
        // The second route change of the burst, well inside the shared 900 ms debounce.
        assert!(burst.on_loss(t0 + Duration::from_millis(600)));
    }

    #[test]
    fn a_device_that_keeps_failing_is_given_up_and_tried_again_later() {
        let mut burst = LossBurst::new();
        let t0 = Instant::now();
        for i in 0..GIVE_UP_AFTER {
            assert!(burst.on_loss(t0 + Duration::from_secs(i as u64)));
            burst.reopen_started();
        }
        assert!(!burst.on_loss(t0 + Duration::from_secs(GIVE_UP_AFTER as u64)));
        assert!(burst.on_loss(t0 + GIVE_UP_WINDOW + Duration::from_secs(1)));
    }
}
