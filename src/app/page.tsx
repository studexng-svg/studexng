import LandingClient from "./LandingClient";

async function fetchFeaturedListings(): Promise<any[]> {
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  try {
    const [pau, futo] = await Promise.all([
      fetch(`${API_URL}/api/services/listings/?campus=pau&page_size=100`, { next: { revalidate: 300 } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
      fetch(`${API_URL}/api/services/listings/?campus=futo&page_size=100`, { next: { revalidate: 300 } })
        .then(r => r.ok ? r.json() : null).catch(() => null),
    ]);
    const shuffle = <T,>(arr: T[]) =>
      arr.map(v => ({ v, k: Math.random() })).sort((a, b) => a.k - b.k).map(x => x.v);
    const p = shuffle(((pau?.results ?? pau ?? []) as any[]).filter((l: any) => l.image?.startsWith("http")));
    const f = shuffle(((futo?.results ?? futo ?? []) as any[]).filter((l: any) => l.image?.startsWith("http")));
    return shuffle([...f.slice(0, Math.min(f.length, 14)), ...p.slice(0, Math.min(p.length, 6))]);
  } catch {
    return [];
  }
}

export default async function Page() {
  const listings = await fetchFeaturedListings();
  return <LandingClient initialListings={listings} />;
}
