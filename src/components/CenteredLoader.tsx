// src/components/CenteredLoader.tsx
// The app-wide loading state — a centered, breathing StudEx logo. Replaces
// the old per-page skeleton placeholders (gray animate-pulse boxes mimicking
// each page's layout) with one consistent loading state everywhere: same
// mark, same animation (globals.css's animate-breathe — the same pulse the
// header logo uses while navProgressStore.isLoading() is true), the same
// place on screen every time, so "the app is loading" always looks and
// feels identical regardless of which page it's on.
//
// Usage:
//   if (loading) return <CenteredLoader />;                 // whole page
//   {loading ? <CenteredLoader fullScreen={false} /> : ...} // one section
//     of an already-rendered page (e.g. a tab's content, a list panel)
export default function CenteredLoader({
  fullScreen = true,
  className = "",
}: {
  fullScreen?: boolean;
  className?: string;
}) {
  return (
    <div
      className={`flex items-center justify-center ${fullScreen ? "min-h-screen" : "py-20"} ${className}`}
    >
      <div className="w-16 h-16 rounded-2xl overflow-hidden border border-stone-100 shadow-sm flex items-center justify-center p-2 bg-white animate-breathe">
        <img src="/images/logo-1.jpg" alt="Loading" className="w-full h-full object-contain" />
      </div>
    </div>
  );
}
