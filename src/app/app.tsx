"use client";

import { useEffect, useState } from "react";
import { sdk as farcasterSdk } from "@farcaster/frame-sdk";

import FarcasterApp from "./FarcasterApp";
import BaseApp from "./BaseApp";

// a separate component that is allowed to use useMiniKit
import { useMiniKit } from "@coinbase/onchainkit/minikit";

function BaseAppDetector() {
  const { context } = useMiniKit();
  const isBaseApp = context?.client?.clientFid === 309857;

  if (isBaseApp) {
    console.log("✅ Running inside Base App");
    return <BaseApp />;
  }

  return (
    <div style={{ padding: 20 }}>
      Not running inside Base App (normal browser)
    </div>
  );
}

export default function App() {
  const [isFarcaster, setIsFarcaster] = useState<boolean | null>(null);

  // detect Farcaster Mini App first
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

  // still detecting Farcaster
  if (isFarcaster === null) {
    return <div style={{ padding: 20 }}>Loading environment…</div>;
  }

  // ✅ Farcaster Mini App
  if (isFarcaster) {
    console.log("✅ Running inside Farcaster Mini App");
    return <FarcasterApp />;
  }

  // ✅ Not Farcaster → safe to check Base App (this uses useMiniKit internally)
  return <BaseAppDetector />;
}
