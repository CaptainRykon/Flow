//"use client";

//import { useEffect, useState } from "react";
//import { sdk as farcasterSdk } from "@farcaster/frame-sdk";

//import FarcasterApp from "./FarcasterApp";
//import BaseApp from "./BaseApp";

//// a separate component that is allowed to use useMiniKit
//import { useMiniKit } from "@coinbase/onchainkit/minikit";

//function BaseAppDetector() {
//  const { context } = useMiniKit();
//  const isBaseApp = context?.client?.clientFid === 309857;

//  if (isBaseApp) {
//    console.log("✅ Running inside Base App");
//    return <BaseApp />;
//  }

//  return (
//    <div style={{ padding: 20 }}>
//      Not running inside Base App (normal browser)
//    </div>
//  );
//}

//export default function App() {
//  const [isFarcaster, setIsFarcaster] = useState<boolean | null>(null);

//  // detect Farcaster Mini App first
//  useEffect(() => {
//    const detect = async () => {
//      try {
//        const result = await farcasterSdk.isInMiniApp();
//        setIsFarcaster(result);
//      } catch (err) {
//        console.error("Mini app detection error:", err);
//        setIsFarcaster(false);
//      }
//    };
//    detect();
//  }, []);

//  // still detecting Farcaster
//  if (isFarcaster === null) {
//    return <div style={{ padding: 20 }}>Loading environment…</div>;
//  }

//  // ✅ Farcaster Mini App
//  if (isFarcaster) {
//    console.log("✅ Running inside Farcaster Mini App");
//    return <FarcasterApp />;
//  }

//  // ✅ Not Farcaster → safe to check Base App (this uses useMiniKit internally)
//  return <BaseAppDetector />;
//}
"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";

// --- utils ---
import { getCoins, addCoins, subtractCoins } from "@/utils/coins";
import { getSpinData, setSpinData } from "@/utils/spins";
import { saveDailyRewardClaim, getDailyRewardData } from "@/utils/rewards";
import { getPassData, savePassData } from "@/utils/passes";
import { switchChain } from "wagmi/actions";


type FarcasterUserInfo = {
    username: string;
    pfpUrl: string;
    fid: string;
};

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
    | "get-spin-data"
    | "update-daily-chances"
    | "set-spin-data"
    | "get-daily-reward-data"
    | "save-daily-reward-claim"
    | "get-shop-pass-data"
    | "save-shop-pass-data"
    | "request-pass-payment";
    amount?: number;
    message?: string;

    // 💳 Used for payments
    passType?: string;
    expiry?: string;

    // ⭐ Add this
    chain?: "base" | "arbitrum" | "celo";


    // 🔹 Flexible data payload for spin, reward, and pass info
    data?: {
        dailyChancesLeft?: number;
        lastResetTime?: string;
        passType?: string;
        expiry?: string;
    };


};

type FrameTransactionMessage = { type: "farcaster:frame-transaction"; data?: unknown };

declare global {
    interface Window {
        sendCoinsToUnity?: (amount: number) => void;
        unityInstance?: {
            SendMessage: (objectName: string, methodName: string, arg: string) => void;
        };
    }
}

function isOpenUrlMessage(msg: unknown): msg is { action: "open-url"; url: string } {
    if (typeof msg !== "object" || msg === null) return false;
    const r = msg as Record<string, unknown>;
    return r.action === "open-url" && typeof r.url === "string";
}

export default function FarcasterApp() {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const userInfoRef = useRef<FarcasterUserInfo>({ username: "Guest", pfpUrl: "", fid: "" });

    const { address, isConnected } = useAccount();
    const config = useConfig();

    // 🪙 Allow external scripts to send coins directly to Unity
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
                const user = context?.user || {};
                userInfoRef.current = {
                    username: user.username || "Guest",
                    pfpUrl: user.pfpUrl || "",
                    fid: user.fid ? String(user.fid) : "",
                };

                // 🧩 Helper to send user info + coin data to Unity
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
                    console.log("✅ Posted user info to Unity →", { username, fid, isAllowed });
                };

                // Wait for iframe to load
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










                // 📨 Global message handler (Unity → React)
                window.addEventListener("message", async (event: MessageEvent) => {
                    const raw = event.data as unknown;
                    if (!raw || typeof raw !== "object") return;
                    const obj = raw as Record<string, unknown>;


                    // inside your global message handler in React
                    if (obj && typeof obj.type === "string" && obj.type === "NAVIGATE_TO_MAIN") {
                        const msg = obj as { type: string; url?: string };
                        const url = msg.url ?? "/BridgeWebgl/index.html";
                        console.log("➡️ Parent received NAVIGATE_TO_MAIN — navigating iframe to:", url);
                        if (iframeRef.current) {
                            // set src to main app
                            iframeRef.current.setAttribute("src", url);
                        }
                        return;
                    }




                    if (obj.type === "frame-action") {
                        const actionData = obj as FrameActionMessage;

                        switch (actionData.action) {
                            case "get-user-context":
                                postToUnity();
                                break;

                            case "request-payment": {
                                if (!isConnected) {
                                    console.warn("❌ Wallet not connected.");
                                    return;
                                }

                                try {
                                    const client = await getWalletClient(config);
                                    if (!client) {
                                        console.error("❌ Wallet client not available");
                                        return;
                                    }

                                    const chain = (actionData.chain ?? "base") as "base" | "arbitrum" | "celo";

                                    const USDC = {
                                        base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
                                        arbitrum: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
                                        celo: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C",
                                    } as const;

                                    const CHAIN_ID = {
                                        base: 8453,
                                        arbitrum: 42161,
                                        celo: 42220,
                                    } as const;

                                    const chainId = CHAIN_ID[chain];
                                    const usdcAddress = USDC[chain];

                                    console.log("⭐ Paying on:", chain, chainId, usdcAddress);

                                    // ⭐ NEW CORRECT WAY (works everywhere)
                                    if (client.chain.id !== chainId) {
                                        console.log("⛓ Switching chain using wagmi switchChain →", chainId);
                                        await switchChain(config, { chainId });
                                    }

                                    const recipient = "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670";
                                    const amount = actionData.amount ?? 0;

                                    const txData = encodeFunctionData({
                                        abi: [{
                                            name: "transfer",
                                            type: "function",
                                            inputs: [
                                                { name: "to", type: "address" },
                                                { name: "amount", type: "uint256" },
                                            ],
                                            outputs: [{ name: "", type: "bool" }],
                                            stateMutability: "nonpayable",
                                        }],
                                        functionName: "transfer",
                                        args: [recipient, parseUnits(String(amount), 6)],
                                    });

                                    const txHash = await client.sendTransaction({
                                        to: usdcAddress,
                                        data: txData,
                                        value: 0n,
                                    });

                                    console.log("✅ Payment sent:", txHash);

                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                                        "*"
                                    );

                                } catch (err) {
                                    console.error("❌ Payment failed:", err);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["0"] },
                                        "*"
                                    );
                                }

                                break;
                            }





                            case "share-game":
                                sdk.actions.openUrl(
                                    "https://warpcast.com/~/compose?text=Loving Flow by @trenchverse ... &embeds[]=https://flow.trenchverse.com"
                                );
                                break;

                            case "share-score":
                                sdk.actions.openUrl(
                                    `https://warpcast.com/~/compose?text=🏆 I scored ${actionData.message} points!&embeds[]=https://flow.trenchverse.com`
                                );
                                break;

                            case "send-notification":
                                if (userInfoRef.current.fid) {
                                    await fetch("/api/send-notification", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            fid: userInfoRef.current.fid,
                                            title: "🎯 Farcaster Ping!",
                                            body: actionData.message,
                                        }),
                                    });
                                } else {
                                    console.warn("❌ Cannot send notification, FID missing");
                                }
                                break;

                            // 🪙 Coin management
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



                            // inside switch(actionData.action)
                            case "get-daily-reward-data": {
                                const fid = userInfoRef.current.fid;
                                if (!fid) return;

                                try {
                                    const data = await getDailyRewardData(fid);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        {
                                            type: "UNITY_METHOD_CALL",
                                            method: "SetDailyRewardData",
                                            args: [`${data.lastClaimTime}|${data.claimedToday}`],
                                        },
                                        "*"
                                    );
                                } catch (e) {
                                    console.error("❌ get-daily-reward-data error:", e);
                                }
                                break;
                            }

                            case "save-daily-reward-claim": {
                                const fid = userInfoRef.current.fid;
                                if (!fid) return;

                                try {
                                    await saveDailyRewardClaim(fid);
                                } catch (e) {
                                    console.error("❌ save-daily-reward-claim error:", e);
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

                            case "save-spin-data": {
                                const fid = userInfoRef.current.fid;
                                if (!fid || !actionData.data) return;

                                const { dailyChancesLeft, lastResetTime } = actionData.data;

                                // ❌ Never auto-save when player has spins left
                                if ((dailyChancesLeft ?? 0) > 0) {
                                    console.log("🚫 Skipped save-spin-data — player still has spins left.");
                                    return;
                                }

                                // ❌ Must have valid time
                                if (!lastResetTime) {
                                    console.warn("⚠️ Missing lastResetTime, skipping save.");
                                    return;
                                }

                                try {
                                    await setSpinData(fid, Math.max(0, dailyChancesLeft ?? 0), lastResetTime);
                                    console.log("💾 Saved spin data safely:", { fid, dailyChancesLeft, lastResetTime });
                                } catch (e) {
                                    console.error("❌ save-spin-data error:", e);
                                }
                                break;
                            }





                            // 🏆 SHOP PASS SYSTEM
                            case "get-shop-pass-data": {
                                const fid = userInfoRef.current.fid;
                                if (!fid) return;
                                try {
                                    const pass = await getPassData(fid);
                                    const formatted = `${pass.passType}|${pass.expiry}`;
                                    iframeRef.current?.contentWindow?.postMessage({
                                        type: "UNITY_METHOD_CALL",
                                        method: "SetPassData",
                                        args: [formatted],
                                    }, "*");
                                    console.log("📦 Sent pass data to Unity:", formatted);
                                } catch (e) {
                                    console.error("❌ get-shop-pass-data error:", e);
                                }
                                break;
                            }

                            case "save-shop-pass-data": {
                                const fid = userInfoRef.current.fid;
                                if (!fid || !actionData.data) return;
                                try {
                                    const { passType, expiry } = actionData.data;
                                    const safePassType = passType ?? "Free";
                                    const safeExpiry = expiry ?? new Date().toISOString();

                                    await savePassData(fid, safePassType, safeExpiry);
                                    console.log("💾 Saved shop pass data →", { fid, passType, expiry });
                                } catch (e) {
                                    console.error("❌ save-shop-pass-data error:", e);
                                }
                                break;
                            }

                            // 💳 Handle pass payments
                            case "request-pass-payment": {
                                if (!isConnected) {
                                    console.warn("❌ Wallet not connected.");
                                    return;
                                }
                                try {
                                    const client = await getWalletClient(config);
                                    if (!client) {
                                        console.error("❌ Wallet client not available");
                                        return;
                                    }

                                    const recipient = "0xE51f63637c549244d0A8E11ac7E6C86a1E9E0670";
                                    const usdcContract = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

                                    const amountNum: number = actionData.amount ?? 0;
                                    const amountStr: string = amountNum.toString();
                                    const passType: string = actionData.passType ?? "UNKNOWN_PASS";

                                    const txData = encodeFunctionData({
                                        abi: [
                                            {
                                                name: "transfer",
                                                type: "function",
                                                stateMutability: "nonpayable",
                                                inputs: [
                                                    { name: "to", type: "address" },
                                                    { name: "amount", type: "uint256" },
                                                ],
                                                outputs: [{ name: "", type: "bool" }],
                                            },
                                        ],
                                        functionName: "transfer",
                                        args: [recipient, parseUnits(amountStr, 6)],
                                    });

                                    const txHash = await client.sendTransaction({
                                        to: usdcContract,
                                        data: txData,
                                        value: 0n,
                                    });

                                    console.log(`✅ ${passType} payment complete → TX:`, txHash);

                                    iframeRef.current?.contentWindow?.postMessage({
                                        type: "UNITY_METHOD_CALL",
                                        method: "OnPaymentSuccess",
                                        args: [passType],
                                    }, "*");

                                } catch (err) {
                                    console.error("❌ request-pass-payment error:", err);
                                }
                                break;
                            }





                            case "get-spin-data": {
                                const fid = userInfoRef.current.fid;
                                if (!fid) return;

                                try {
                                    const spinData = await getSpinData(fid);

                                    const safeChances = Math.max(0, Number(spinData.dailyChancesLeft));
                                    const safeResetTime = spinData.lastResetTime ?? new Date().toISOString();

                                    const formattedData = `${safeChances}|${safeResetTime}`;
                                    iframeRef.current?.contentWindow?.postMessage(
                                        {
                                            type: "UNITY_METHOD_CALL",
                                            method: "SetSpinData",
                                            args: [formattedData],
                                        },
                                        "*"
                                    );

                                    console.log("📩 Synced spin data from Firebase → Unity:", {
                                        dailyChancesLeft: safeChances,
                                        lastResetTime: safeResetTime,
                                    });
                                } catch (e) {
                                    console.error("❌ get-spin-data error:", e);
                                }
                                break;
                            }



                        }
                    }

                    // Handle open-url
                    if (isOpenUrlMessage(raw)) sdk.actions.openUrl(raw.url);

                    // Handle dynamic LOAD_GAME switching
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

                // ✅ Handle Farcaster transaction confirmations
                window.addEventListener("message", (event: MessageEvent<FrameTransactionMessage>) => {
                    const d = event.data;
                    if (typeof d === "object" && d !== null && "type" in d && d.type === "farcaster:frame-transaction") {
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
