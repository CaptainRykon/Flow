"use client";

import { useEffect, useRef } from "react";
import { useMiniKit, useComposeCast, useOpenUrl } from "@coinbase/onchainkit/minikit";
import { useAccount, useConfig } from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { parseUnits } from "ethers";
import { encodeFunctionData } from "viem";

import { ALLOWED_FIDS } from "../utils/AllowedFids";
import { getCoins, addCoins, subtractCoins } from "@/utils/coins";

// user info types
type UserInfo = { username: string; pfpUrl: string; fid: string };
type MiniKitUser = { username?: string; pfpUrl?: string; fid?: string | number };

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

export default function BaseApp() {
    const iframeRef = useRef<HTMLIFrameElement | null>(null);
    const userInfoRef = useRef<UserInfo>({ username: "Guest", pfpUrl: "", fid: "" });

    // MiniKit (Base)
    const { context, isFrameReady, setFrameReady } = useMiniKit();
    const { composeCast } = useComposeCast();
    const openUrl = useOpenUrl();

    // wallet
    const { address, isConnected } = useAccount();
    const config = useConfig();

    // global helper for Unity coins
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.sendCoinsToUnity = (amount: number) => {
            try {
                if (window.unityInstance?.SendMessage) {
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

    // mark frame ready
    useEffect(() => {
        if (!isFrameReady) {
            try {
                setFrameReady();
            } catch (err) {
                console.warn("setFrameReady() failed:", err);
            }
        }
    }, [isFrameReady, setFrameReady]);

    // update userInfoRef whenever context changes
    useEffect(() => {
        // context.user may be undefined; cast to our MiniKitUser type with defaults
        const rawUser: MiniKitUser | undefined = context?.user as MiniKitUser | undefined;
        userInfoRef.current = {
            username: rawUser?.username ?? "Guest",
            pfpUrl: rawUser?.pfpUrl ?? "",
            fid: rawUser?.fid ? String(rawUser.fid) : "",
        };
    }, [context]);

    useEffect(() => {
        let mounted = true;

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
            console.log("✅ (Base) Posted info to Unity →", { username, fid, isAllowed });
        };

        const init = async () => {
            try {
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
                            console.log("💰 (Base) Sent initial coins to Unity:", coins);
                        } catch (e) {
                            console.error("Failed fetching initial coins (Base):", e);
                        }
                    }
                });

                // message handler
                const onMessage = async (event: MessageEvent) => {
                    const raw = event.data as unknown;
                    if (!raw || typeof raw !== "object") return;

                    const obj = raw as Record<string, unknown>;

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
                                    console.log("✅ (Base) Transaction sent:", txHash);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "SetPaymentSuccess", args: ["1"] },
                                        "*"
                                    );
                                } catch (err) {
                                    console.error("❌ Payment failed (Base):", err);
                                }
                                break;
                            }

                            case "share-game": {
                                try {
                                    await composeCast?.({
                                        text: `Loving Flow by @trenchverse — check it:`,
                                        embeds: [window.location.href],
                                    });
                                } catch {
                                    openUrl?.(window.location.href);
                                }
                                break;
                            }

                            case "share-score": {
                                try {
                                    await composeCast?.({
                                        text: `🏆 I scored ${actionData.message} points! Can you beat me?`,
                                        embeds: [window.location.href],
                                    });
                                } catch {
                                    openUrl?.(window.location.href);
                                }
                                break;
                            }

                            case "send-notification": {
                                if (!userInfoRef.current.fid) {
                                    console.warn("❌ Cannot send notification, FID missing");
                                    return;
                                }
                                try {
                                    await fetch("/api/send-notification", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            fid: userInfoRef.current.fid,
                                            title: "🎯 Base Ping!",
                                            body: actionData.message,
                                        }),
                                    });
                                } catch (err) {
                                    console.warn("Notifications may not be supported in Base yet:", err);
                                }
                                break;
                            }

                            // coin actions
                            case "get-coins": {
                                const fid = userInfoRef.current.fid;
                                if (!fid) return;
                                try {
                                    const coins = await getCoins(fid);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "UpdateCoins", args: [String(coins)] },
                                        "*"
                                    );
                                } catch (err) {
                                    console.error("get-coins error (Base):", err);
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
                                } catch (err) {
                                    console.error("spend-coins error (Base):", err);
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
                                } catch (err) {
                                    console.error("add-coins error (Base):", err);
                                    iframeRef.current?.contentWindow?.postMessage(
                                        { type: "UNITY_METHOD_CALL", method: "OnCoinActionError", args: ["SERVER_ERROR"] },
                                        "*"
                                    );
                                }
                                break;
                            }
                        }
                    }

                    if (isOpenUrlMessage(raw)) {
                        try {
                            openUrl?.((raw as { url: string }).url);
                        } catch {
                            window.open((raw as { url: string }).url, "_blank");
                        }
                    }

                    if ((raw as Record<string, unknown>).type === "LOAD_GAME") {
                        const gameName = (raw as Record<string, unknown>).game;
                        if (typeof gameName === "string" && gameName.trim() !== "") {
                            iframeRef.current?.setAttribute("src", `/games/${gameName}/index.html`);
                        }
                    }
                };

                window.addEventListener("message", onMessage);

                const onTx = (event: MessageEvent<FrameTransactionMessage>) => {
                    const d = event.data as unknown;
                    if (
                        typeof d === "object" &&
                        d !== null &&
                        "type" in (d as Record<string, unknown>) &&
                        (d as Record<string, unknown>).type === "farcaster:frame-transaction"
                    ) {
                        console.log("✅ Frame Wallet transaction confirmed (Base)");
                    }
                };
                window.addEventListener("message", onTx);

                return () => {
                    mounted = false;
                    window.removeEventListener("message", onMessage);
                    window.removeEventListener("message", onTx);
                };
            } catch (err) {
                console.error("❌ Error initializing Base bridge:", err);
            }
        };

        init();
    }, [composeCast, openUrl, isFrameReady, address, config, isConnected]);

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
