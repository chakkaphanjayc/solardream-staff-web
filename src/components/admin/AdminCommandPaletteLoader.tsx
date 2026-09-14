"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const LazyCommandPalette = dynamic(() => import("./CommandPalette"), {
  ssr: false,
});

/**
 * Keep cmdk, Radix dialog, and the command search action out of the initial
 * admin bundle. The palette is only needed after an explicit search intent.
 */
export default function AdminCommandPaletteLoader() {
  const [enabled, setEnabled] = useState(false);
  const [initialOpen, setInitialOpen] = useState(false);
  const enabledRef = useRef(false);

  useEffect(() => {
    const activate = () => {
      if (enabledRef.current) return;
      enabledRef.current = true;
      setInitialOpen(true);
      setEnabled(true);
    };

    const handleShortcut = (event: KeyboardEvent) => {
      if (event.key !== "k" || (!event.metaKey && !event.ctrlKey)) return;
      if (enabledRef.current) return;
      event.preventDefault();
      activate();
    };

    const handleOpenEvent = () => {
      if (enabledRef.current) return;
      activate();
    };

    document.addEventListener("keydown", handleShortcut);
    window.addEventListener("open-command-palette", handleOpenEvent);

    return () => {
      document.removeEventListener("keydown", handleShortcut);
      window.removeEventListener("open-command-palette", handleOpenEvent);
    };
  }, []);

  return enabled ? <LazyCommandPalette initialOpen={initialOpen} /> : null;
}
