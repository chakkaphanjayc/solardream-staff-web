"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";

type StaggeredTextRevealProps = Readonly<{
  text: string;
  className?: string;
}>;

export default function StaggeredTextReveal({ text, className }: StaggeredTextRevealProps) {
  const words = text.split(" ");
  const wordRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const targets = wordRefs.current.filter((word): word is HTMLSpanElement => Boolean(word));
    if (!targets.length) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const context = gsap.context(() => {
      gsap.fromTo(
        targets,
        {
          y: prefersReducedMotion ? "0%" : "112%",
          autoAlpha: prefersReducedMotion ? 1 : 0,
          filter: prefersReducedMotion ? "blur(0px)" : "blur(8px)",
        },
        {
          y: "0%",
          autoAlpha: 1,
          filter: "blur(0px)",
          duration: prefersReducedMotion ? 0.08 : 0.72,
          stagger: prefersReducedMotion ? 0 : 0.075,
          ease: prefersReducedMotion ? "none" : "expo.out",
        },
      );
    });

    return () => context.revert();
  }, [text]);

  return (
    <span className={className} aria-label={text}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`}>
          <span className="inline-block overflow-hidden align-bottom">
            <span
              ref={(element) => {
                wordRefs.current[index] = element;
              }}
              aria-hidden="true"
              className="inline-block"
            >
              {word}
            </span>
          </span>
          {index < words.length - 1 ? " " : null}
        </span>
      ))}
    </span>
  );
}
