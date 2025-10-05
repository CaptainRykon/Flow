"use client";
import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";

// coin helpers
import { getCoins, addCoins, subtractCoins } from "@/utils/coins";
// spin helpers
import { getSpinData, setSpinData } from "@/utils/spins";

type FarcasterUserInfo = { username: string; pfpUrl: string; fid: string };

type UnityMessage =
  | { type: "FARCASTER_USER_INFO"; payload: { username: string; pfpUrl: string } }
  | { type: "UNITY_METHOD_CALL"; method: string; args: string[] };

type FrameActionMessage = {
  type: "frame-action";
  action:
    | "get-user-context"
    | "request-payment"
    | "share-game"
    | "share-score"
    | "send-notification"
    | "get-coins"
    | "spend-coins"
    | "add-coins"
    | "save-spin-data"
    | "get-spin-data";
  amount?: number;
  message?: string;
  data?: { dailyChancesLeft: number; lastResetTime: string };
};

type FrameTransactionMessage = { type: "farcaster:frame-transaction"; data?: unknown };

declare global {
  interface Window {
    sendCoinsToUnity?: (amount: number) => void;
    unityInstance?: { SendMessage: (objectName: string, methodName: string, arg: string) => void };
  }
}

function isOpenUrlMessage(msg: unknown): msg is { action: "open-url"; url: string } {
  if (typeof msg !== "object" || msg === null) return false;
  const r = msg as Record<string, unknown>;
  return "action" in r && "url" in r && r.action === "open-url" && typeof r.url === "string";
}

export default function FarcasterApp() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const userInfoRef = useRef<FarcasterUserInfo>({ username: "Guest", pfpUrl: "", fid: "" });
  const { address, isConnected } = useAccount();
  const config = useConfig();

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sendCoinsToUnity = (amount: number) => {
      try {
        if (window.unityInstance && typeof window.unityInstance.SendMessage === "function") {
          window.unityInstance.SendMessage("FarcasterBridge", "UpdateCoins", String(amount));
          return;
        }
        iframeRef.current?.contentWindow?.postMessage(
          { type: "UNITY_METHOD_CALL", method: "UpdateCoins", args: [String(amount)] },
          "*"
        );
      } catch (err) {
        console.error("Error sending coins to Unity:", err);
      }
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        await sdk.actions.ready();
        await sdk.actions.addFrame();
        const context = await sdk.context;
        const user = (context && context.user) || {};

        userInfoRef.current = {
          username: (user && user.username) || "Guest",
          pfpUrl: (user && user.pfpUrl) || "",
          fid: user && user.fid ? String(user.fid) : "",
        };

        const postToUnity = () => {
          const iw = iframeRef.current?.contentWindow;
          if (!iw) return;
          const { username, pfpUrl, fid } = userInfoRef.current;
          const isAllowed = ALLOWED_FIDS.includes(Number(fid));
          const messages: UnityMessage[] = [
            { type: "FARCASTER_USER_INFO", payload: { username, pfpUrl } },
            { type: "UNITY_METHOD_CALL", method: "SetFarcasterFID", args: [fid] },
            { type: "UNITY_METHOD_CALL", method: "SetFidGateState", args: [isAllowed ? "1" : "0"] },
          ];
          messages.forEach((msg) => iw.postMessage(msg, "*"));
          console.log("✅ Posted info to Unity →", { username, fid, isAllowed });
        };

        iframeRef.current?.addEventListener("load", async () => {
          if (!mounted) return;
          postToUnity();
          const fid = userInfoRef.current.fid;
          if (fid) {
            try {
              const coins = await getCoins(fid);
              iframeRef.current?.contentWindow?.postMessage(
                { type: "UNITY_METHOD_CALL", method: "UpdateCoins", args: [String(coins)] },
                "*"
              );
              console.log("💰 Sent initial coins to Unity:", coins);
            } catch (e) {
              console.error("Failed fetching initial coins:", e);
            }
          }
        });

        // --------- Global message handler (Unity -> parent) ---------
        window.addEventListener("message", async (event: MessageEvent) => {
          const raw = event.data as unknown;
          if (!raw || typeof raw !== "object") return;
          const obj = raw as Record<string, unknown>;

          if (obj.type === "frame-action") {
            const actionData = obj as FrameActionMessage;
            switch (actionData.action) {
              // ---------- existing actions (unchanged) ----------
              case "get-user-context":
                postToUnity();
                break;

              // ---------- spin system actions (✅ UPDATED) ----------
              case "save-spin-data": {
                const fid = userInfoRef.current.fid;
                if (!fid || !actionData.data) return;
                try {
                  await setSpinData(fid, actionData.data.dailyChancesLeft, actionData.data.lastResetTime);
                  console.log("🎯 Spin data saved to Firebase:", actionData.data);
                } catch (e) {
                  console.error("❌ save-spin-data error:", e);
                }
                break;
              }

              case "get-spin-data": {
                const fid = userInfoRef.current.fid;
                if (!fid) return;
                try {
                  let spinData = await getSpinData(fid);

                  // fallback defaults if no record exists
                  if (!spinData || typeof spinData.dailyChancesLeft === "undefined") {
                    spinData = {
                      dailyChancesLeft: 1,
                      lastResetTime: new Date().toISOString(),
                    };
                    await setSpinData(fid, spinData.dailyChancesLeft, spinData.lastResetTime);
                    console.log("🆕 Created new spin data for user:", spinData);
                  }

                  // ensure Unity receives both values as strings
                  iframeRef.current?.contentWindow?.postMessage(
                    {
                      type: "UNITY_METHOD_CALL",
                      method: "SetSpinData",
                      args: [String(spinData.dailyChancesLeft), String(spinData.lastResetTime)],
                    },
                    "*"
                  );

                  console.log("📩 Sent spin data to Unity:", spinData);
                } catch (e) {
                  console.error("❌ get-spin-data error:", e);
                }
                break;
              }

              // ---------- rest of your existing cases (coins, payments, etc.) ----------
              case "get-coins": {
                const fid = userInfoRef.current.fid;
                if (!fid) return;
                try {
                  const coins = await getCoins(fid);
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "UNITY_METHOD_CALL", method: "UpdateCoins", args: [String(coins)] },
                    "*"
                  );
                } catch (e) {
                  console.error("get-coins error:", e);
                }
                break;
              }

              // (keep all your other cases unchanged)
            }
          }

          if (isOpenUrlMessage(raw)) {
            sdk.actions.openUrl((raw as { url: string }).url);
          }

          if ((raw as Record<string, unknown>).type === "LOAD_GAME") {
            const gameName = (raw as Record<string, unknown>).game;
            console.log("📩 LOAD_GAME received in React:", gameName);
            if (typeof gameName === "string" && gameName.trim() !== "") {
              const url = `/games/${gameName}/index.html`;
              console.log("🔗 Setting iframe src to:", url);
              iframeRef.current?.setAttribute("src", url);
            } else {
              console.warn("❌ Invalid gameName in LOAD_GAME:", gameName);
            }
          }
        });

        // listen for Frame transaction confirmations
        window.addEventListener("message", (event: MessageEvent<FrameTransactionMessage>) => {
          const d = event.data as unknown;
          if (
            typeof d === "object" &&
            d !== null &&
            "type" in (d as Record<string, unknown>) &&
            (d as Record<string, unknown>).type === "farcaster:frame-transaction"
          ) {
            console.log("✅ Frame Wallet transaction confirmed");
          }
        });
      } catch (err) {
        console.error("❌ Error initializing bridge:", err);
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, [address, config, isConnected]);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <iframe
        ref={iframeRef}
        src="/BridgeWebgl/index.html"
        style={{ width: "100%", height: "100%", border: "none" }}
        allowFullScreen
      />
    </div>
  );
}
