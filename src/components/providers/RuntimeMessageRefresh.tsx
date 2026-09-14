"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const STORAGE_KEY = "solardream_runtime_messages_version";
const CHANNEL_NAME = "solardream_runtime_messages";

export default function RuntimeMessageRefresh() {
  const router = useRouter();

  useEffect(() => {
    const refresh = () => router.refresh();
    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", handleStorage);

    if (!("BroadcastChannel" in window)) {
      return () => window.removeEventListener("storage", handleStorage);
    }

    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", refresh);
    return () => {
      window.removeEventListener("storage", handleStorage);
      channel.removeEventListener("message", refresh);
      channel.close();
    };
  }, [router]);

  return null;
}
