export default function Loading() {
  return (
    <div className="min-h-screen bg-[#FAFAF9] px-4 pt-6 pb-28 max-w-2xl mx-auto space-y-6">
      <div className="h-4 bg-stone-200 rounded-full w-1/4 animate-pulse" />
      <div className="h-7 bg-stone-200 rounded-full w-1/2 animate-pulse" />
      <div className="h-4 bg-stone-100 rounded-full w-1/3 animate-pulse" />

      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="aspect-square rounded-2xl bg-stone-200 animate-pulse" />
        ))}
      </div>
    </div>
  );
}
