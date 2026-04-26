export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] px-4 pt-6 pb-28 max-w-2xl mx-auto space-y-6">
      <div className="h-8 bg-stone-200 rounded-full w-1/3 animate-pulse" />
      <div className="h-4 bg-stone-100 rounded-full w-1/2 animate-pulse" />

      <div className="h-36 bg-stone-200 rounded-2xl animate-pulse" />

      <div className="flex gap-4 overflow-hidden">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex-shrink-0 flex flex-col items-center gap-2">
            <div className="w-16 h-16 rounded-full bg-stone-200 animate-pulse" />
            <div className="h-3 w-12 bg-stone-100 rounded-full animate-pulse" />
          </div>
        ))}
      </div>

      <div className="flex gap-3 overflow-hidden">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="flex-shrink-0 w-[155px] bg-white rounded-2xl overflow-hidden border border-stone-100 animate-pulse">
            <div className="h-28 bg-stone-200" />
            <div className="p-3 space-y-2">
              <div className="h-3 bg-stone-200 rounded-full" />
              <div className="h-3 bg-stone-100 rounded-full w-2/3" />
              <div className="h-4 bg-stone-200 rounded-full w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
