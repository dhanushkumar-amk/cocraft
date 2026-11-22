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
    if (!price || price.type !== "one_time_price" || price.currency !== "INR" ||
        price.price !== 100 || !price.tax_inclusive || price.pay_what_you_want ||
        price.purchasing_power_parity || (price.discount_bps ?? 0) > 0 || (price.discount ?? 0) > 0) {
      return Response.json({ error: "Configure the token product as a fixed, tax-inclusive INR 1 purchase without product-level discounts." }, { status: 503 });
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
  } catch {
    return Response.json({ error: "Checkout is unavailable. Please try again." }, { status: 503 });
  }
}
