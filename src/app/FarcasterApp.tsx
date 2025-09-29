"use client";

import { useEffect, useRef } from "react";
import sdk from "@farcaster/frame-sdk";
import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";

// coin helpers
import { getCoins, addCoins, subtractCoins, claimDaily } from "@/utils/coins";

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
    | "claim-daily-coins";
    amount?: number;
    message?: string;
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
    return "action" in r && "url" in r && r.action === "open-url" && typeof r.url === "string";
}

export default function FarcasterApp() {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const userInfoRef = useRef<FarcasterUserInfo>({ username: "Guest", pfpUrl: "", fid: "" });
    const { address, isConnected } = useAccount();
    const config = useConfig();

    /** helper to push coins back into Unity */
    const postCoinsToUnity = async (amount: number) => {
        const iw = iframeRef.current?.contentWindow;
        if (!iw) return;

        // retry until Unity loaded
        let retries = 0;
        const send = () =>
            iw.postMessage(
                { type: "UNITY_METHOD_CALL", method: "SetCoins", args: [String(amount)] },
                "*"
            );

        const interval = setInterval(() => {
            if (!iframeRef.current?.contentWindow || retries > 50) {
                clearInterval(interval);
                return;
            }
            send();
            retries++;
        }, 100);
    };

    const updateUnityCoins = async (fid: string) => {
        try {
            const coins = await getCoins(fid);
            await postCoinsToUnity(coins);
            console.log("💰 Sent coins to Unity:", coins);
        } catch (err) {
            console.error("❌ Failed sending coins to Unity:", err);
        }
    };

    // make helper globally available
    useEffect(() => {
        window.sendCoinsToUnity = postCoinsToUnity;
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

                /** send initial user info + fid gate to Unity */
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
                    if (userInfoRef.current.fid) {
                        await updateUnityCoins(userInfoRef.current.fid);
                    }
                });

                window.addEventListener("message", async (event: MessageEvent) => {
                    const raw = event.data as unknown;
                    if (!raw || typeof raw !== "object") return;
                    const obj = raw as Record<string, unknown>;
                    const iw = iframeRef.current?.contentWindow;

                    if (obj.type === "frame-action") {
                        const actionData = obj as FrameActionMessage;
                        const fid = userInfoRef.current.fid;
                        if (!fid) return;

                        switch (actionData.action) {
                            case "get-user-context":
                                postToUnity();
                                await updateUnityCoins(fid);
                                break;

                            case "get-coins":
                                await updateUnityCoins(fid);
                                break;

                            case "add-coins":
                                if (typeof actionData.amount === "number") {
                                    await addCoins(fid, actionData.amount);
                                    await updateUnityCoins(fid);
                                }
                                break;

                            case "spend-coins":
                                if (typeof actionData.amount === "number") {
                                    const ok = await subtractCoins(fid, actionData.amount);
                                    if (!ok) {
                                        iw?.postMessage(
                                            { type: "UNITY_METHOD_CALL", method: "OnCoinSpendFailed", args: ["INSUFFICIENT"] },
                                            "*"
                                        );
                                    }
                                    await updateUnityCoins(fid);
                                }
                                break;

                            case "claim-daily-coins":
                                try {
                                    const { success, coins } = await claimDaily(fid);
                                    await postCoinsToUnity(coins);
                                    iw?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "ShowClaimResult", args: [success ? "1" : "0"] },
                                        "*"
                                    );
                                    console.log("🎁 Daily claim result sent to Unity:", success, coins);
                                } catch (err) {
                                    console.error("❌ Daily claim failed:", err);
                                    iw?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "ShowClaimResult", args: ["0"] },
                                        "*"
                                    );
                                }
                                break;

                            case "request-payment": {
                                if (!isConnected) return console.warn("❌ Wallet not connected.");
                                try {
                                    const client = await getWalletClient(config);
                                    if (!client) return console.error("❌ Wallet client not available");
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
                                    const txHash = await client.sendTransaction({ to: usdcContract, data: txData, value: 0n });
                                    console.log("✅ Transaction sent:", txHash);
                                    iw?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                                        "*"
                                    );
                                } catch (err) {
                                    console.error("❌ Payment failed:", err);
                                }
                                break;
                            }

                            case "share-game":
                                sdk.actions.openUrl(
                                    `https://warpcast.com/~/compose?text= Loving Flow by @trenchverse ... &embeds[]=https://flow.trenchverse.com`
                                );
                                break;

                            case "share-score":
                                sdk.actions.openUrl(
                                    `https://warpcast.com/~/compose?text=🏆 I scored ${actionData.message} points!&embeds[]=https://flow.trenchverse.com`
                                );
                                break;

                            case "send-notification":
                                if (fid && actionData.message) {
                                    await fetch("/api/send-notification", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ fid, title: "🎯 Farcaster Ping!", body: actionData.message }),
                                    });
                                }
                                break;
                        }
                    }

                    if (isOpenUrlMessage(raw)) {
                        sdk.actions.openUrl(raw.url);
                    }

                    if ((raw as Record<string, unknown>).type === "LOAD_GAME") {
                        const gameName = (raw as Record<string, unknown>).game;
                        if (typeof gameName === "string" && gameName.trim() !== "") {
                            iframeRef.current?.setAttribute("src", `/games/${gameName}/index.html`);
                        }
                    }
                });

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
