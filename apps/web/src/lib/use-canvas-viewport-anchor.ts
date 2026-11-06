"use client";

import { useLayoutEffect, type RefObject } from "react";

/** Keep the canvas in place while its controls grow or shrink above it. */
export function useCanvasViewportAnchor(
  canvasRef: RefObject<HTMLElement | null>,
  controlsRef: RefObject<HTMLElement | null>
) {
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    const controls = controlsRef.current;
    if (!canvas || !controls || typeof ResizeObserver === "undefined") return;

    let controlsHeight = controls.getBoundingClientRect().height;
    let canvasTop = canvas.getBoundingClientRect().top;
    const rememberScroll = () => {
      // A resize can also trigger native scroll anchoring or scroll-limit clamping.
      // Preserve the old target until the resize callback accounts for that move.
      if (controls.getBoundingClientRect().height === controlsHeight) {
        canvasTop = canvas.getBoundingClientRect().top;
      }
    };
    const observer = new ResizeObserver(() => {
      const nextHeight = controls.getBoundingClientRect().height;
      if (nextHeight !== controlsHeight) {
        const displacement = canvas.getBoundingClientRect().top - canvasTop;
        if (displacement) window.scrollBy({ top: displacement, behavior: "instant" });
        controlsHeight = nextHeight;
      }
      canvasTop = canvas.getBoundingClientRect().top;
    });

    window.addEventListener("scroll", rememberScroll, { passive: true });
    observer.observe(controls, { box: "border-box" });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", rememberScroll);
    };
  }, [canvasRef, controlsRef]);
}
