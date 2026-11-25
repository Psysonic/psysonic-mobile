//! Where a list or the now-playing screen goes on CarPlay's template stack. Plain logic
//! without UIKit, so it can be tested on any machine:
//! `rustc --edition 2021 --test src-tauri/src/ios/carplay_stack.rs -o carplay_stack && ./carplay_stack`.
//!
//! CarPlay limits an audio app to five templates, the root (our tab bar) included, and raises an
//! Objective-C exception past that, which aborts the app. Pushing a template that is already on
//! the stack raises as well. The car's lists loop (now playing → album → artist → album → track
//! → now playing …), so every push first looks for the same screen further down.

/// Most templates on the stack for an audio app, the root included (CarPlay Developer Guide).
pub(crate) const MAX_DEPTH: usize = 5;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum StackStep {
    /// The screen is already on top.
    Stay,
    /// The screen is further down: go back to it (`popToTemplate:`).
    PopTo(usize),
    /// A new screen fits: push it.
    Push,
    /// The stack is full: go back to the template at this index, then push the new screen,
    /// so it replaces the top one(s) and the stack stays at `MAX_DEPTH`.
    PopToThenPush(usize),
}

/// The step that shows a screen, given the stack's depth (root included) and the index of the
/// same screen on the stack, if it is there.
pub(crate) fn step(depth: usize, existing: Option<usize>) -> StackStep {
    match existing {
        Some(index) if index + 1 >= depth => StackStep::Stay,
        Some(index) => StackStep::PopTo(index),
        None if depth >= MAX_DEPTH => StackStep::PopToThenPush(MAX_DEPTH - 2),
        None => StackStep::Push,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pushes_while_there_is_room() {
        assert_eq!(step(1, None), StackStep::Push);
        assert_eq!(step(MAX_DEPTH - 1, None), StackStep::Push);
    }

    #[test]
    fn a_full_stack_replaces_its_top_and_never_grows() {
        assert_eq!(
            step(MAX_DEPTH, None),
            StackStep::PopToThenPush(MAX_DEPTH - 2)
        );
        // After the pop the stack holds MAX_DEPTH - 1 templates; the push makes it MAX_DEPTH.
        let after_pop = MAX_DEPTH - 2 + 1;
        assert_eq!(after_pop + 1, MAX_DEPTH);
    }

    #[test]
    fn a_screen_further_down_is_popped_back_to() {
        // Now playing at index 1, two lists above it: tapping a track goes back to it.
        assert_eq!(step(4, Some(1)), StackStep::PopTo(1));
    }

    #[test]
    fn the_screen_on_top_stays() {
        assert_eq!(step(3, Some(2)), StackStep::Stay);
    }

    #[test]
    fn a_loop_through_the_lists_never_exceeds_the_limit() {
        // now playing, album, artist, album, track list, now playing, … as node ids.
        let taps = [
            "np",
            "album:a",
            "artist:x",
            "album:b",
            "playlist:p",
            "np",
            "album:a",
            "artist:x",
            "album:c",
            "np",
        ];
        let mut stack: Vec<&str> = vec!["root"];
        for tap in taps {
            let existing = stack.iter().position(|node| *node == tap);
            match step(stack.len(), existing) {
                StackStep::Stay => {}
                StackStep::PopTo(index) => stack.truncate(index + 1),
                StackStep::Push => stack.push(tap),
                StackStep::PopToThenPush(index) => {
                    stack.truncate(index + 1);
                    stack.push(tap);
                }
            }
            assert!(stack.len() <= MAX_DEPTH, "{stack:?}");
            assert_eq!(stack.last(), Some(&tap));
            // Never the same screen twice.
            let mut seen = stack.clone();
            seen.sort_unstable();
            seen.dedup();
            assert_eq!(seen.len(), stack.len(), "{stack:?}");
        }
    }
}
