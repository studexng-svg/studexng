// src/lib/bookingStore.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type BookingItem = {
  providerId: string;
  providerName: string;
  providerImg: string;
  service: string;
  date: string | null;
  time: string;
  location: string;
  addons: Record<string, number | string>;
  note: string;
  total: number;
  bookingId?: number;
  category?: string;
};

type BookingStore = {
  booking: BookingItem | null;
  setBooking: (booking: BookingItem | null) => void;
  clearBooking: () => void;
};

export const useBookingStore = create<BookingStore>()(
  persist(
    (set) => ({
      booking: null,
      setBooking: (booking) => set({ booking }),
      clearBooking: () => set({ booking: null }),
    }),
    { name: "studex-booking" }
  )
);