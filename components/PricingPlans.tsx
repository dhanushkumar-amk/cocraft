"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export function PricingPlans({ title, description }: { title?: string; description?: string; onCheckoutStart?: () => void }) {
  const { isSignedIn, orgId, orgRole } = useAuth();
  const [quantity, setQuantity] = useState(100);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const valid = Number.isInteger(quantity) && quantity >= 100 && quantity <= 500;
  async function checkout() {
    if (!valid || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not open checkout.");
      window.location.assign(data.url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not open checkout.");
      setPending(false);
    }
  }
  return <div className="mx-auto w-full max-w-lg space-y-6 rounded-xl border border-white/10 bg-card p-6">
    <div>
      <h2 className="text-2xl font-semibold">{title ?? "Buy tokens"}</h2>
      <p className="mt-2 text-muted-foreground">{description ?? "₹1 per token. One token pays for one agent request, including its diagram edits."}</p>
    </div>
    <p className="text-sm text-muted-foreground">New users get 20 free tokens in their personal account.</p>
    <label className="block space-y-2">
      <span>Choose 100 to 500 tokens</span>
      <input type="number" min={100} max={500} step={1} value={Number.isNaN(quantity) ? "" : quantity} disabled={pending} onChange={(event) => setQuantity(event.target.valueAsNumber)} className="w-full rounded-md border bg-background px-3 py-2" />
    </label>
    <input aria-label="Token quantity" type="range" min={100} max={500} step={1} value={valid ? quantity : 100} disabled={pending} onChange={(event) => setQuantity(Number(event.target.value))} className="w-full accent-orange-500" />
    <p className="text-2xl font-semibold">{valid ? `₹${quantity}` : "Choose 100 to 500 tokens"}</p>
    <p className="text-sm text-muted-foreground">Have a promotion code? Enter it on the secure checkout page. Discounts reduce your payment, while you receive all selected tokens.</p>
    <p className="text-sm text-muted-foreground">{orgId ? "Tokens are shared by your selected team." : "Tokens are added to your personal account."} Purchased tokens do not reset monthly.</p>
    {!isSignedIn ? <Button asChild className="w-full"><Link href="/sign-in">Sign in to buy tokens</Link></Button> :
      <Button className="w-full" disabled={!valid || pending || (!!orgId && orgRole !== "org:admin")} onClick={checkout}>{pending ? "Opening checkout?" : "Buy tokens"}</Button>}
    {orgId && orgRole !== "org:admin" && <p className="text-sm text-muted-foreground">A team admin must purchase team tokens.</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
