"use client";

import { useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { cn } from "@/lib/utils";

type ThreadsProps = Readonly<{
  className?: string;
  color?: readonly [number, number, number];
  amplitude?: number;
  distance?: number;
  enableMouseInteraction?: boolean;
  maxDpr?: number;
  maxFps?: number;
  maxRenderDimension?: number;
}>;

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float iTime;
uniform vec3 iResolution;
uniform vec3 uColor;
uniform float uAmplitude;
uniform float uDistance;
uniform vec2 uMouse;

#define PI 3.1415926538

// The original React Bits shader uses 40 lines. SolarDream keeps the same
// visual language with a lower line count because this is a full-viewport layer.
const int u_line_count = 28;
const float u_line_width = 7.0;
const float u_line_blur = 10.0;

float Perlin2D(vec2 P) {
    vec2 Pi = floor(P);
    vec4 Pf_Pfmin1 = P.xyxy - vec4(Pi, Pi + 1.0);
    vec4 Pt = vec4(Pi.xy, Pi.xy + 1.0);
    Pt = Pt - floor(Pt * (1.0 / 71.0)) * 71.0;
    Pt += vec2(26.0, 161.0).xyxy;
    Pt *= Pt;
    Pt = Pt.xzxz * Pt.yyww;
    vec4 hash_x = fract(Pt * (1.0 / 951.135664));
    vec4 hash_y = fract(Pt * (1.0 / 642.949883));
    vec4 grad_x = hash_x - 0.49999;
    vec4 grad_y = hash_y - 0.49999;
    vec4 grad_results = inversesqrt(grad_x * grad_x + grad_y * grad_y)
        * (grad_x * Pf_Pfmin1.xzxz + grad_y * Pf_Pfmin1.yyww);
    grad_results *= 1.4142135623730950;
    vec2 blend = Pf_Pfmin1.xy * Pf_Pfmin1.xy * Pf_Pfmin1.xy
               * (Pf_Pfmin1.xy * (Pf_Pfmin1.xy * 6.0 - 15.0) + 10.0);
    vec4 blend2 = vec4(blend, vec2(1.0 - blend));
    return dot(grad_results, blend2.zxzx * blend2.wwyy);
}

float pixel(float count, vec2 resolution) {
    return (1.0 / max(resolution.x, resolution.y)) * count;
}

float lineFn(vec2 st, float width, float perc, vec2 mouse, float time, float amplitude, float distance) {
    float split_offset = perc * 0.4;
    float split_point = 0.1 + split_offset;

    float amplitude_normal = smoothstep(split_point, 0.7, st.x);
    float finalAmplitude = amplitude_normal * 0.5 * amplitude
                           * (1.0 + (mouse.y - 0.5) * 0.2);

    float time_scaled = time / 10.0 + (mouse.x - 0.5);
    float blur = smoothstep(split_point, split_point + 0.05, st.x) * perc;

    float xnoise = mix(
        Perlin2D(vec2(time_scaled, st.x + perc) * 2.5),
        Perlin2D(vec2(time_scaled, st.x + time_scaled) * 3.5) / 1.5,
        st.x * 0.3
    );

    float y = 0.5 + (perc - 0.5) * distance + xnoise / 2.0 * finalAmplitude;

    float line_start = smoothstep(
        y + (width / 2.0) + (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        y,
        st.y
    );
    float line_end = smoothstep(
        y,
        y - (width / 2.0) - (u_line_blur * pixel(1.0, iResolution.xy) * blur),
        st.y
    );

    return clamp(
        (line_start - line_end) * (1.0 - smoothstep(0.0, 1.0, pow(perc, 0.3))),
        0.0,
        1.0
    );
}

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution.xy;
    float line_strength = 1.0;

    for (int i = 0; i < u_line_count; i++) {
        float p = float(i) / float(u_line_count);
        line_strength *= (1.0 - lineFn(
            uv,
            u_line_width * pixel(1.0, iResolution.xy) * (1.0 - p),
            p,
            uMouse,
            iTime,
            uAmplitude,
            uDistance
        ));
    }

    float colorVal = 1.0 - line_strength;
    gl_FragColor = vec4(uColor * colorVal, colorVal);
}
`;

export default function Threads({
  className,
  color = [0.35, 0.52, 0.7],
  amplitude = 0.55,
  distance = 0.2,
  enableMouseInteraction = false,
  maxDpr = 1.5,
  maxFps = 30,
  maxRenderDimension = 1280,
}: ThreadsProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const propsRef = useRef({ color, amplitude, distance, enableMouseInteraction });

  useEffect(() => {
    propsRef.current = { color, amplitude, distance, enableMouseInteraction };
  }, [amplitude, color, distance, enableMouseInteraction]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let frameId = 0;
    let running = false;
    let disposed = false;
    let isVisible = true;
    let lastRenderTime = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const frameInterval = maxFps > 0 ? 1000 / maxFps : 0;

    try {
      const renderer = new Renderer({ alpha: true, antialias: false });
      const gl = renderer.gl;
      gl.clearColor(0, 0, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.canvas.style.display = "block";
      gl.canvas.setAttribute("aria-hidden", "true");
      container.appendChild(gl.canvas);

      const geometry = new Triangle(gl);
      const program = new Program(gl, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          iTime: { value: 0 },
          iResolution: {
            value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / Math.max(1, gl.canvas.height)),
          },
          uColor: { value: new Color(...propsRef.current.color) },
          uAmplitude: { value: propsRef.current.amplitude },
          uDistance: { value: propsRef.current.distance },
          uMouse: { value: new Float32Array([0.5, 0.5]) },
        },
      });
      const mesh = new Mesh(gl, { geometry, program });

      const resize = () => {
        const { clientWidth, clientHeight } = container;
        if (clientWidth === 0 || clientHeight === 0) return;

        const baseDpr = Math.min(window.devicePixelRatio || 1, maxDpr);
        const longestSide = Math.max(clientWidth, clientHeight) * baseDpr;
        const dpr = longestSide > maxRenderDimension
          ? (baseDpr * maxRenderDimension) / longestSide
          : baseDpr;

        renderer.dpr = dpr;
        renderer.setSize(clientWidth, clientHeight);
        program.uniforms.iResolution.value.r = gl.canvas.width;
        program.uniforms.iResolution.value.g = gl.canvas.height;
        program.uniforms.iResolution.value.b = gl.canvas.width / Math.max(1, gl.canvas.height);
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      window.addEventListener("resize", resize);
      resize();

      const currentMouse = [0.5, 0.5];
      const targetMouse = [0.5, 0.5];
      const handleMouseMove = (event: MouseEvent) => {
        if (!propsRef.current.enableMouseInteraction) return;
        const rect = container.getBoundingClientRect();
        targetMouse[0] = (event.clientX - rect.left) / Math.max(1, rect.width);
        targetMouse[1] = 1 - (event.clientY - rect.top) / Math.max(1, rect.height);
      };
      const handleMouseLeave = () => {
        targetMouse[0] = 0.5;
        targetMouse[1] = 0.5;
      };
      container.addEventListener("mousemove", handleMouseMove);
      container.addEventListener("mouseleave", handleMouseLeave);

      const render = (time: number) => {
        const { color: nextColor, amplitude: nextAmplitude, distance: nextDistance, enableMouseInteraction: mouseEnabled } = propsRef.current;
        program.uniforms.uColor.value.set(...nextColor);
        program.uniforms.uAmplitude.value = nextAmplitude;
        program.uniforms.uDistance.value = nextDistance;

        if (mouseEnabled) {
          currentMouse[0] += 0.05 * (targetMouse[0] - currentMouse[0]);
          currentMouse[1] += 0.05 * (targetMouse[1] - currentMouse[1]);
          program.uniforms.uMouse.value[0] = currentMouse[0];
          program.uniforms.uMouse.value[1] = currentMouse[1];
        } else {
          program.uniforms.uMouse.value[0] = 0.5;
          program.uniforms.uMouse.value[1] = 0.5;
        }

        program.uniforms.iTime.value = time * 0.001;
        renderer.render({ scene: mesh });
      };

      const stopFrame = () => {
        if (frameId) window.cancelAnimationFrame(frameId);
        frameId = 0;
        running = false;
      };
      const scheduleFrame = () => {
        if (disposed || reducedMotion || running || !isVisible || document.hidden) return;
        running = true;
        frameId = window.requestAnimationFrame((time) => {
          running = false;
          if (disposed) return;
          if (time - lastRenderTime >= frameInterval) {
            lastRenderTime = time;
            render(time);
          }
          scheduleFrame();
        });
      };

      const handleVisibilityChange = () => {
        if (document.hidden) stopFrame();
        else scheduleFrame();
      };
      const intersectionObserver = new IntersectionObserver(([entry]) => {
        isVisible = entry?.isIntersecting ?? false;
        if (isVisible) scheduleFrame();
        else stopFrame();
      }, { threshold: 0 });
      intersectionObserver.observe(container);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      if (reducedMotion) render(0);
      else scheduleFrame();

      return () => {
        disposed = true;
        stopFrame();
        resizeObserver.disconnect();
        intersectionObserver.disconnect();
        window.removeEventListener("resize", resize);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
        container.removeEventListener("mousemove", handleMouseMove);
        container.removeEventListener("mouseleave", handleMouseLeave);
        if (container.contains(gl.canvas)) container.removeChild(gl.canvas);
        gl.getExtension("WEBGL_lose_context")?.loseContext();
      };
    } catch {
      // Keep the static SolarDream gradient visible on devices without WebGL.
      container.dataset.webglUnavailable = "true";
    }
  }, [maxDpr, maxFps, maxRenderDimension]);

  return <div ref={containerRef} aria-hidden="true" className={cn("relative h-full w-full", className)} />;
}
