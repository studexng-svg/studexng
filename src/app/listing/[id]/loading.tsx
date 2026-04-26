export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAFAF9]">
      <div className="sticky top-0 bg-white/80 backdrop-blur-md border-b border-stone-100 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-10 h-10 rounded-full bg-stone-200 animate-pulse" />
          <div className="h-5 bg-stone-200 rounded-full w-1/2 animate-pulse" />
        </div>
      </div>

      <div className="pb-28 max-w-2xl mx-auto">
        <div className="h-64 bg-stone-200 animate-pulse w-full" />

        <div className="px-4 pt-4 space-y-4">
          <div className="bg-white border border-stone-100 rounded-2xl p-5 shadow-sm space-y-3 animate-pulse">
            <div className="h-3 bg-stone-200 rounded-full w-1/4" />
            <div className="h-6 bg-stone-200 rounded-full w-3/4" />
            <div className="h-4 bg-stone-100 rounded-full" />
            <div className="h-4 bg-stone-100 rounded-full w-5/6" />
          </div>

          <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm animate-pulse">
            <div className="h-3 bg-stone-200 rounded-full w-1/4 mb-3" />
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-stone-200" />
              <div className="space-y-2 flex-1">
                <div className="h-4 bg-stone-200 rounded-full w-1/3" />
                <div className="h-3 bg-stone-100 rounded-full w-1/4" />
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-100 rounded-2xl p-4 shadow-sm h-14 animate-pulse" />
        </div>
      </div>
    </div>
  );
}
