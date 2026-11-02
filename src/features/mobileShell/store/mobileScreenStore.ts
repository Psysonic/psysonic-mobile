import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MobileScreenStore {
  /** Settings → System: the screen stays on while Psysonic is in front. Off by default. */
  keepScreenOn: boolean;
  setKeepScreenOn: (keepScreenOn: boolean) => void;
}

export const useMobileScreenStore = create<MobileScreenStore>()(
  persist(
    set => ({
      keepScreenOn: false,
      setKeepScreenOn: keepScreenOn => set({ keepScreenOn }),
    }),
    {
      name: 'psysonic_mobile_screen',
      version: 1,
      merge: (persistedState, currentState) => ({
        ...currentState,
        keepScreenOn: (persistedState as { keepScreenOn?: unknown } | undefined)?.keepScreenOn === true,
      }),
    },
  ),
);

/** Calls `onChange` now and whenever the setting changes. Returns the cleanup. */
export function watchKeepScreenOnSetting(onChange: (keepScreenOn: boolean) => void): () => void {
  onChange(useMobileScreenStore.getState().keepScreenOn);
  return useMobileScreenStore.subscribe((state, prev) => {
    if (state.keepScreenOn !== prev.keepScreenOn) onChange(state.keepScreenOn);
  });
}
