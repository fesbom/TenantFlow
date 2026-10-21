import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { User } from "lucide-react";
import { ProtectedImage } from "@/components/ui/protected-image";

interface ZoomPhotoProps {
  src?: string | null;
  alt: string;
  className?: string;
  iconClassName?: string;
  zoomSize?: number;
  children?: ReactNode;
  "data-testid"?: string;
}

// Circular photo that shows an enlarged preview while hovered.
// The preview is portaled with fixed positioning so it is never clipped by scroll containers.
export function ZoomPhoto({
  src,
  alt,
  className = "w-10 h-10",
  iconClassName = "w-5 h-5",
  zoomSize = 192,
  children,
  ...rest
}: ZoomPhotoProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const show = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!src) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const margin = 8;
    const left = Math.min(Math.max(margin, rect.left), window.innerWidth - zoomSize - margin);
    const top = Math.min(Math.max(margin, rect.top), window.innerHeight - zoomSize - margin);
    setPos({ top, left });
  };

  return (
    <div
      className={`relative flex-shrink-0 ${className}`}
      onMouseEnter={show}
      onMouseLeave={() => setPos(null)}
    >
      <div className="w-full h-full rounded-full overflow-hidden border border-gray-200 bg-gray-100 flex items-center justify-center">
        {src ? (
          <ProtectedImage
            src={src}
            alt={alt}
            className="w-full h-full object-cover"
            data-testid={rest["data-testid"]}
          />
        ) : (
          <User className={`${iconClassName} text-gray-400`} />
        )}
      </div>
      {children}
      {src && pos &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] overflow-hidden rounded-xl border-2 border-white bg-white shadow-2xl"
            style={{ top: pos.top, left: pos.left, width: zoomSize, height: zoomSize }}
          >
            <ProtectedImage src={src} alt={alt} className="w-full h-full object-cover" />
          </div>,
          document.body,
        )}
    </div>
  );
}
