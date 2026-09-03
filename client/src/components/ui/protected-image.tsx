import { useEffect, useState } from "react";
import type { ImgHTMLAttributes } from "react";

export function isProtectedUploadUrl(src: string | null | undefined): src is string {
  if (!src || src.startsWith("blob:") || src.startsWith("data:")) return false;

  try {
    const url = new URL(src, window.location.origin);
    return (
      url.origin === window.location.origin &&
      url.pathname.startsWith("/uploads/")
    );
  } catch {
    return false;
  }
}

/**
 * Resolves authenticated local uploads to temporary blob URLs. Other image
 * sources are returned unchanged so browser-native loading continues to work.
 */
export function useMediaUrl(src: string | null | undefined) {
  const [resolved, setResolved] = useState<{ source?: string | null; url?: string }>(() => ({
    source: src,
    url: isProtectedUploadUrl(src) ? undefined : src || undefined,
  }));

  useEffect(() => {
    if (!src) {
      setResolved({ source: src, url: undefined });
      return;
    }

    if (!isProtectedUploadUrl(src)) {
      setResolved({ source: src, url: src });
      return;
    }

    const controller = new AbortController();
    let objectUrl: string | undefined;
    setResolved({ source: src, url: undefined });

    const load = async () => {
      try {
        const token = localStorage.getItem("dental_token");
        if (!token) throw new Error("Authentication is required to load this image");

        const response = await fetch(src, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`Unable to load image: ${response.status}`);

        objectUrl = URL.createObjectURL(await response.blob());
        if (controller.signal.aborted) {
          URL.revokeObjectURL(objectUrl);
        } else {
          setResolved({ source: src, url: objectUrl });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("Erro ao carregar imagem protegida:", error);
          setResolved({ source: src, url: undefined });
        }
      }
    };

    load();
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  // Never render a protected source itself while its authenticated request is pending.
  return resolved.source === src ? resolved.url : isProtectedUploadUrl(src) ? undefined : src || undefined;
}

export function ProtectedImage({ src, ...props }: Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src?: string | null }) {
  const resolvedSrc = useMediaUrl(src);

  if (!resolvedSrc) return null;
  return <img src={resolvedSrc} {...props} />;
}

export async function downloadMedia(src: string, filename: string) {
  const headers: HeadersInit = {};
  if (isProtectedUploadUrl(src)) {
    const token = localStorage.getItem("dental_token");
    if (!token) throw new Error("Authentication is required to download this image");
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(src, { headers, credentials: "include" });
  if (!response.ok) throw new Error(`Unable to download image: ${response.status}`);

  const objectUrl = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(objectUrl);
}