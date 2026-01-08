import { create } from 'zustand'

interface TimeStore {
  currentTime: number
  setTime: (time: number) => void
}

export const useTimeStore = create<TimeStore>((set) => ({
  currentTime: 0,
  setTime: (time: number) => set({ currentTime: time }),
}))
