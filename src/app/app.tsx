"use client";

import { useEffect, useState } from "react";
import { sdk as farcasterSdk } from "@farcaster/frame-sdk"; // ✅ correct import
import { useMiniKit } from "@coinbase/onchainkit/minikit";

import FarcasterApp from "./FarcasterApp";
import BaseApp from "./BaseApp";

export default function App() {
  const { context } = useMiniKit();
  const isBaseApp = context?.client?.clientFid === 309857;

  const [isFarcaster, setIsFarcaster] = useState<boolean | null>(null);

  useEffect(() => {
    const detect = async () => {
      try {
        const result = await farcasterSdk.isInMiniApp();
        setIsFarcaster(result);
      } catch (err) {
        console.error("Mini app detection error:", err);
        setIsFarcaster(false);
      }
    };
    detect();
  }, []);

  if (isFarcaster === null && !isBaseApp) {
    return <div style={{ padding: 20 }}>Loading environment…</div>;
  }

  if (isBaseApp) {
    console.log("✅ Running inside Base App");
    return <BaseApp />;
  }

  if (isFarcaster) {
    console.log("✅ Running inside Farcaster Mini App");
    return <FarcasterApp />;
  }

  return <div style={{ padding: 20 }}>Not running inside a Mini App</div>;
}
