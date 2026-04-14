"use client";

import dynamic from "next/dynamic";

const SlideBoostApp = dynamic(() => import("./SlideBoostApp"), { ssr: false });

export default function Page() {
  return <SlideBoostApp />;
}
