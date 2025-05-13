import { create } from "zustand";

interface SideMenuState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useSideMenuStore = create<SideMenuState>((set) => ({
  open: false, // Initial state
  setOpen: (open) => set({ open }), // Method to update the state
}));
