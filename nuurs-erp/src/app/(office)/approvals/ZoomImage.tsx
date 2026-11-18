"use client";
import { useState } from "react";

/** Photo beside the fields; click to zoom in and scroll around. */
export function ZoomImage({ src, alt }: { src: string; alt: string }) {
  const [zoom, setZoom] = useState(false);
  return (
    <div className="photo-scroll">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={zoom ? "zoom" : ""} onClick={() => setZoom((z) => !z)} />
    </div>
  );
}
