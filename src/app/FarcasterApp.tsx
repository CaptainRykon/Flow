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
import { getSpinData, setSpinData, updateDailyChances } from "@/utils/spins";

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
    | "set-spin-data";
    amount?: number;
    message?: string;
    data?: { dailyChancesLeft: number; lastResetTime: string };
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

                    if (obj.type === "frame-action") {
                        const actionData = obj as FrameActionMessage;

                        switch (actionData.action) {
                            case "get-user-context":
                                postToUnity();
                                break;

                            case "request-payment":
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
                                        args: [recipient, parseUnits("2", 6)],
                                    });

                                    const txHash = await client.sendTransaction({
                                        to: usdcContract,
                                        data: txData,
                                        value: 0n,
                                    });

                                    console.log("✅ Transaction sent:", txHash);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                                        "*"
                                    );
                                } catch (err) {
                                    console.error("❌ Payment failed:", err);
                                }
                                break;

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

                            // 🎡 Spin system
                            // 🎡 Spin System
                            case "save-spin-data": {
                                const fid = userInfoRef.current.fid;
                                if (!fid || !actionData.data) return;

                                try {
                                    const safeChances = Math.max(0, actionData.data.dailyChancesLeft);

                                    // ✅ Only update Firebase when Unity explicitly sends "save-spin-data"
                                    // (Unity sends this when player uses their last spin)
                                    await setSpinData(fid, safeChances, actionData.data.lastResetTime);

                                    console.log("🎯 Saved spin data after final spin:", {
                                        fid,
                                        dailyChancesLeft: safeChances,
                                        lastResetTime: actionData.data.lastResetTime,
                                    });
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

                                    // ✅ If no record exists (new user), initialize 1 spin once
                                    if (!spinData) {
                                        const newData = {
                                            dailyChancesLeft: 1,
                                            lastResetTime: new Date().toISOString(),
                                        };
                                        await setSpinData(fid, newData.dailyChancesLeft, newData.lastResetTime);
                                        console.log("🆕 New FID initialized with 1 free spin:", newData);
                                        spinData = newData;
                                    }

                                    const safeChances = Math.max(0, spinData.dailyChancesLeft);
                                    const safeResetTime = spinData.lastResetTime ?? new Date().toISOString();

                                    iframeRef.current?.contentWindow?.postMessage(
                                        {
                                            type: "UNITY_METHOD_CALL",
                                            method: "SetSpinData",
                                            args: [String(safeChances), String(safeResetTime)],
                                        },
                                        "*"
                                    );

                                    console.log("📩 Sent spin data to Unity:", { safeChances, safeResetTime });

                                } catch (e) {
                                    console.error("❌ get-spin-data error:", e);
                                }
                                break;
                            }




                            case "update-daily-chances": {
                                const fid = userInfoRef.current.fid;
                                if (!fid || typeof actionData.amount !== "number") return;
                                try {
                                    await updateDailyChances(fid, actionData.amount);
                                    console.log("✅ Daily chances updated in Firebase:", actionData.amount);
                                } catch (e) {
                                    console.error("❌ update-daily-chances error:", e);
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
