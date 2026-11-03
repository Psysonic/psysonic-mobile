// ⚠️ iOS territory: the app target's bridging header (`patch-gen.mjs`). Rust functions in
// `src-tauri/src/ios/widgets.rs` that `WidgetBridge.swift` calls.

#include <stdbool.h>

void psysonic_widget_command(const char *action);
bool psysonic_widget_web_ready(void);
