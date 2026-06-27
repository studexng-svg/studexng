'use client';

import { TEAL } from "@/lib/tokens";

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#FAFAF9] flex items-center justify-center p-6">
      <div className="text-center">
        <p className="text-stone-400 text-sm mb-4">Something went wrong loading this page.</p>
        <button
          onClick={reset}
          className="px-6 py-3 text-white font-medium rounded-full text-sm"
          style={{ background: TEAL }}>
          Try again
        </button>
      </div>
    </div>
  );
}
