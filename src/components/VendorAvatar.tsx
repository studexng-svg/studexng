import { TEAL } from "@/lib/tokens";
const FALLBACK_GRAD = TEAL;

interface Props {
  name: string;
  picture: string | null;
  size?: number;
  shape?: "circle" | "rounded";
  /** Coloured ring around the avatar — used for podium medals */
  ring?: string;
}

export default function VendorAvatar({ name, picture, size = 48, shape = "circle", ring }: Props) {
  const src = picture?.startsWith("http") ? picture : null;
  const letter = (name || "?")[0].toUpperCase();
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-2xl";

  const inner = (
    <div className={`${shapeClass} overflow-hidden w-full h-full`}>
      {src ? (
        <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-black text-white"
          style={{ background: FALLBACK_GRAD, fontSize: size * 0.36 }}
        >
          {letter}
        </div>
      )}
    </div>
  );

  if (ring) {
    return (
      <div
        className={`${shapeClass} p-[3px] flex-shrink-0`}
        style={{ background: ring, width: size, height: size }}
      >
        <div className={`${shapeClass} overflow-hidden bg-white w-full h-full`}>
          {src ? (
            <img src={src} alt={name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center font-black text-white"
              style={{ background: FALLBACK_GRAD, fontSize: size * 0.36 }}
            >
              {letter}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`${shapeClass} overflow-hidden flex-shrink-0 shadow-sm`}
      style={{ width: size, height: size }}
    >
      {inner}
    </div>
  );
}
