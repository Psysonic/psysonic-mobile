import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface MobilePlaybackStore {
  /**
   * Settings → System: music that stopped because the car went away carries on when
   * CarPlay or Android Auto connects again. Off by default.
   */
  resumeOnCarConnect: boolean;
  setResumeOnCarConnect: (resumeOnCarConnect: boolean) => void;
}

export const useMobilePlaybackStore = create<MobilePlaybackStore>()(
  persist(
    set => ({
      resumeOnCarConnect: false,
      setResumeOnCarConnect: resumeOnCarConnect => set({ resumeOnCarConnect }),
    }),
    {
      name: 'psysonic_mobile_playback',
      version: 1,
      merge: (persistedState, currentState) => ({
        ...currentState,
        resumeOnCarConnect:
          (persistedState as { resumeOnCarConnect?: unknown } | undefined)?.resumeOnCarConnect === true,
      }),
    },
  ),
);
