"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";

// import your client-side coin helpers
import { getCoins, addCoins, subtractCoins } from "../utils/coins";

type FarcasterUserInfo = { username: string; pfpUrl: string; fid: string; };
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
    | "add-coins";
  amount?: number;
  message?: string;
};

type FrameTransactionMessage = { type: "farcaster:frame-transaction"; data?: unknown; };

function isOpenUrlMessage(msg: unknown): msg is { action: "open-url"; url: string } {
  return typeof msg === "object" && msg !== null && "action" in msg && "url" in msg;
}

export default function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const userInfoRef = useRef<FarcasterUserInfo>({ username: "Guest", pfpUrl: "", fid: "" });
  const { address, isConnected } = useAccount();
  const config = useConfig();

  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready();
        await sdk.actions.addFrame();

        const context = await sdk.context;
        const user = context?.user || {};

        userInfoRef.current = {
          username: user.username || "Guest",
          pfpUrl: user.pfpUrl || "",
          fid: user.fid?.toString() || "",
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

        // On iframe load: post context + coins
        iframeRef.current?.addEventListener("load", async () => {
          postToUnity();
          const fid = userInfoRef.current.fid;
          if (fid) {
            try {
              const coins = await getCoins(fid);
              iframeRef.current?.contentWindow?.postMessage(
                { type: "UNITY_METHOD_CALL", method: "SetCoins", args: [String(coins)] },
                "*"
              );
              console.log("💰 Sent initial coins to Unity:", coins);
            } catch (e) {
              console.error("Failed fetching initial coins:", e);
            }
          }
        });

        // Global message handler (Unity -> parent)
        window.addEventListener("message", async (event) => {
          const data = event.data;
          if (!data) return;

          // Frame action messages (existing + added coin actions)
          if (data?.type === "frame-action") {
            const actionData = data as FrameActionMessage;

            // existing cases
            switch (actionData.action) {
              case "get-user-context":
                console.log("📨 Unity requested Farcaster user context");
                postToUnity();
                break;

              case "request-payment":
                // existing payment logic (unchanged)
                if (!isConnected) { console.warn("❌ Wallet not connected."); return; }
                try {
                  const client = await getWalletClient(config);
                  if (!client) { console.error("❌ Wallet client not available"); return; }
                  const recipient = "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670";
                  const usdcContract = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
                  const txData = encodeFunctionData({
                    abi: [{ name: "transfer", type: "function", stateMutability: "nonpayable", inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }], outputs: [{ name: "", type: "bool" }] }],
                    functionName: "transfer",
                    args: [recipient, parseUnits("2", 6)],
                  });
                  const txHash = await client.sendTransaction({ to: usdcContract, data: txData, value: 0n });
                  console.log("✅ Transaction sent:", txHash);
                  iframeRef.current?.contentWindow?.postMessage({ type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] }, "*");
                } catch (err) { console.error("❌ Payment failed:", err); }
                break;

              case "share-game":
                sdk.actions.openUrl(`https://warpcast.com/~/compose?text= Loving FarGo by @trenchverse ... &embeds[]=https://fargo-sable.vercel.app`);
                break;

              case "share-score":
                sdk.actions.openUrl(`https://warpcast.com/~/compose?text=🏆 I scored ${actionData.message} points!&embeds[]=https://fargo-sable.vercel.app`);
                break;

              case "send-notification":
                if (userInfoRef.current.fid) {
                  await fetch("/api/send-notification", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ fid: userInfoRef.current.fid, title: "🎯 Farcaster Ping!", body: actionData.message }),
                  });
                } else console.warn("❌ Cannot send notification, FID missing");
                break;

              // ---------- coin actions ----------
              case "get-coins": {
                const fid = userInfoRef.current.fid;
                if (!fid) return;
                try {
                  const coins = await getCoins(fid);
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "UNITY_METHOD_CALL", method: "UpdateCoins", args: [String(coins)] },
                    "*"
                  );
                } catch (e) { console.error("get-coins error:", e); }
                break;
              }

              case "spend-coins": {
                const fid = userInfoRef.current.fid;
                if (!fid || typeof actionData.amount !== "number") return;
                try {
                  const ok = await subtractCoins(fid, actionData.amount);
                  if (!ok) {
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "UNITY_METHOD_CALL", method: "OnCoinSpendFailed", args: ["INSUFFICIENT"] },
                      "*"
                    );
                  } else {
                    const newBalance = await getCoins(fid);
                    iframeRef.current?.contentWindow?.postMessage(
                      { type: "UNITY_METHOD_CALL", method: "UpdateCoins", args: [String(newBalance)] },
                      "*"
                    );
                  }
                } catch (e) {
                  console.error("spend-coins error:", e);
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "UNITY_METHOD_CALL", method: "OnCoinActionError", args: ["SERVER_ERROR"] },
                    "*"
                  );
                }
                break;
              }

              case "add-coins": {
                const fid = userInfoRef.current.fid;
                if (!fid || typeof actionData.amount !== "number") return;
                try {
                  await addCoins(fid, actionData.amount);
                  const newBalance = await getCoins(fid);
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "UNITY_METHOD_CALL", method: "UpdateCoins", args: [String(newBalance)] },
                    "*"
                  );
                } catch (e) {
                  console.error("add-coins error:", e);
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "UNITY_METHOD_CALL", method: "OnCoinActionError", args: ["SERVER_ERROR"] },
                    "*"
                  );
                }
                break;
              }

            } // end switch
          } // end if frame-action

          // open-url handlers (existing)
          if (data?.action === "open-url") {
            const target = data.url;
            if (typeof target === "string" && target.startsWith("http")) sdk.actions.openUrl(target);
          }

          if (data?.type === "LOAD_GAME") {
            const gameName = data.game;
            if (typeof gameName === "string" && gameName.trim() !== "") {
              iframeRef.current?.setAttribute("src", `/games/${gameName}/index.html`);
            }
          }

          if (isOpenUrlMessage(data)) sdk.actions.openUrl((data as any).url);
        });

        window.addEventListener("message", (event: MessageEvent<FrameTransactionMessage>) => {
          if (typeof event.data === "object" && event.data !== null && "type" in event.data && event.data.type === "farcaster:frame-transaction") {
            console.log("✅ Frame Wallet transaction confirmed");
          }
        });

      } catch (err) {
        console.error("❌ Error initializing bridge:", err);
      }
    };

    init();
  }, [address, config, isConnected]);

  return (
    <div style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      <iframe ref={iframeRef} src="/BridgeWebgl/index.html" style={{ width: "100%", height: "100%", border: "none" }} allowFullScreen />
    </div>
  );
}
