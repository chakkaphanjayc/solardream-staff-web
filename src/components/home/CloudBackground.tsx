"use client";

import dynamic from "next/dynamic";

const Threads = dynamic(() => import("@/components/reactbits/Threads"), {
  ssr: false,
});

export default function CloudBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 isolate overflow-hidden bg-[#F0EEE9]">
      <div className="absolute inset-0 bg-[linear-gradient(155deg,#e9f2f4_0%,#f0eee9_42%,#f3e7d7_100%)]" />
      <div className="absolute inset-0 opacity-[0.18] mix-blend-multiply">
        <Threads
          color={[0.25, 0.43, 0.62]}
          amplitude={0.52}
          distance={0.22}
          enableMouseInteraction={false}
          maxDpr={1.35}
          maxFps={24}
          maxRenderDimension={1280}
        />
      </div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_14%,rgba(255,235,175,0.36),transparent_27%),radial-gradient(circle_at_25%_75%,rgba(183,209,234,0.18),transparent_35%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(245,242,235,0.1),rgba(240,238,233,0.35)_62%,rgba(240,238,233,0.58))]" />
    </div>
  );
}
