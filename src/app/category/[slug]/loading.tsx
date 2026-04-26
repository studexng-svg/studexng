export default function Loading() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-teal-50">
      <div className="sticky top-0 bg-white/95 backdrop-blur-xl border-b border-purple-100 shadow-sm">
        <div className="flex items-center justify-between p-4">
          <div className="w-10 h-10 rounded-full bg-stone-200 animate-pulse" />
          <div className="h-6 bg-stone-200 rounded-full w-1/3 animate-pulse" />
          <div className="w-10" />
        </div>
        <div className="px-4 pb-3">
          <div className="h-12 bg-stone-100 rounded-xl animate-pulse" />
        </div>
      </div>

      <div className="pb-32 px-4 pt-4 space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-100 animate-pulse">
            <div className="h-48 bg-stone-200" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-stone-200 rounded-full w-3/4" />
              <div className="h-3 bg-stone-100 rounded-full" />
              <div className="h-3 bg-stone-100 rounded-full w-5/6" />
              <div className="flex items-center justify-between">
                <div className="h-7 bg-stone-200 rounded-full w-24" />
                <div className="h-9 bg-stone-200 rounded-xl w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
