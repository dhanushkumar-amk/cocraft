import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { dodo } from "@/lib/dodo";

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId) return new Response(null, { status: 401 });
  if (session.orgId && session.orgRole !== "org:admin") return new Response(null, { status: 403 });
  const body = await request.json().catch(() => null);
  const quantity = body?.quantity;
  if (!Number.isInteger(quantity) || quantity < 100 || quantity > 500) {
    return Response.json({ error: "Choose a whole number from 100 to 500." }, { status: 400 });
  }
  const productId = process.env.DODO_TOKEN_PRODUCT_ID;
  if (!productId || !process.env.DODO_PAYMENTS_API_KEY || !process.env.DODO_PAYMENTS_WEBHOOK_KEY) {
    return Response.json({ error: "Token checkout is awaiting payment configuration." }, { status: 503 });
  }
  const user = await currentUser();
  const email = user?.primaryEmailAddress?.emailAddress;
  if (!email) return new Response(null, { status: 400 });
  try {
    const product = await dodo().products.retrieve(productId);
    const price = product.price;
    const issues: string[] = [];
    if (!price || price.type !== "one_time_price") {
      issues.push("pricing type must be One Time");
    } else {
      if (price.currency !== "INR") issues.push("currency must be INR");
      if (price.price !== 100) issues.push("unit price must be INR 1.00");
      if (!price.tax_inclusive) issues.push("Tax Inclusive must be enabled");
      if (price.pay_what_you_want) issues.push("Pay What You Want must be disabled");
      if (price.purchasing_power_parity) issues.push("Purchasing Power Parity must be disabled");
      if ((price.discount_bps ?? 0) > 0 || (price.discount ?? 0) > 0) issues.push("product discount must be 0%");
    }
    if (issues.length) {
      return Response.json({ error: `Dodo product settings need updating: ${issues.join("; ")}. Promotion codes can still be used at checkout.` }, { status: 503 });
    }
    const order = await prisma.tokenOrder.create({
      data: { ownerId: session.orgId ?? session.userId, quantity, productId },
    });
    const checkout = await dodo().checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity }],
      billing_currency: "INR",
      feature_flags: { allow_currency_selection: false, allow_discount_code: true },
      metadata: { token_order_id: order.id },
      customer: { email, name: user?.fullName ?? undefined },
      return_url: new URL("/dashboard?payment=processing", process.env.DODO_RETURN_ORIGIN || request.url).href,
    });
    if (!checkout.checkout_url) throw new Error("Missing checkout URL");
    return Response.json({ url: checkout.checkout_url });
  } catch (error) {
    const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
    if (status === 404) {
      return Response.json({ error: "Dodo token product was not found. Copy its Product ID from the same Test or Live Mode as your API key and update DODO_TOKEN_PRODUCT_ID." }, { status: 503 });
    }
    if (status === 401 || status === 403) {
      return Response.json({ error: "Dodo API key needs Products Read and Checkout Sessions Write permissions for the selected payment mode." }, { status: 503 });
    }
    return Response.json({ error: "Checkout is unavailable. Please try again." }, { status: 503 });
  }
}
