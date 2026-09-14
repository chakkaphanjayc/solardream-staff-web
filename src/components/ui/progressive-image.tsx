"use client";

import { useMemo, useState } from "react";
import Image, { type ImageProps } from "next/image";
import { cn } from "@/lib/utils";

const DEFAULT_BLUR_DATA_URL =
  "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAxNiAxNiIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIGZpbGw9IiNGMEVFRTkiLz48L3N2Zz4=";

type ProgressiveImageProps = ImageProps & {
  className?: string;
};

export default function ProgressiveImage({
  className,
  onLoad,
  placeholder,
  blurDataURL,
  ...props
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);

  const resolvedBlurDataURL = useMemo(
    () => blurDataURL || DEFAULT_BLUR_DATA_URL,
    [blurDataURL]
  );

  return (
    <Image
      {...props}
      alt={props.alt ?? ""}
      placeholder={placeholder ?? "blur"}
      blurDataURL={resolvedBlurDataURL}
      onLoad={(event) => {
        setLoaded(true);
        onLoad?.(event);
      }}
      className={cn(
        "transition-all duration-700 ease-out will-change-transform",
        loaded ? "blur-0 scale-100 opacity-100" : "filter blur-xl scale-95 opacity-80",
        className
      )}
    />
  );
}
