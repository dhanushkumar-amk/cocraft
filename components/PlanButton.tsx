"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getActivePromptUsage } from "@/actions/usage";
import { useUpgradeDialog } from "@/components/UpgradeDialog";

const EVENT = "cocraft:token-usage-changed";
export function refreshPromptUsage() { window.dispatchEvent(new Event(EVENT)); }

export function PlanButton(_props: { upgradeOnlyWhenOut?: boolean }) {
  void _props;
  const { orgId } = useAuth();
  const [usage, setUsage] = useState<Awaited<ReturnType<typeof getActivePromptUsage>>>(null);
  const openUpgrade = useUpgradeDialog();
  useEffect(() => {
    let cancelled = false;
    const load = () => { void getActivePromptUsage().then((value) => { if (!cancelled) setUsage(value); }).catch(() => {}); };
    load();
    const timer = setInterval(load, 15000);
    window.addEventListener(EVENT, load);
    window.addEventListener("focus", load);
    return () => { cancelled = true; clearInterval(timer); window.removeEventListener(EVENT, load); window.removeEventListener("focus", load); };
  }, [orgId]);
  if (!usage) return null;
  return <button onClick={() => openUpgrade({ title: "Buy tokens", description: "?1 per token. Purchase between 100 and 500 tokens." })} className="rounded-full border border-white/10 px-3 py-1.5 text-xs">
    {usage.remaining} tokens <span className="ml-2 text-primary">Buy more</span>
  </button>;
}
