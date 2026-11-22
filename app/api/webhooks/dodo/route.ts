import { dodo } from "@/lib/dodo";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  if (!process.env.DODO_PAYMENTS_WEBHOOK_KEY) return new Response(null, { status: 503 });
  let event;
  try {
    event = dodo().webhooks.unwrap(await request.text(), { headers: Object.fromEntries(request.headers) });
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }
  if (event.type !== "payment.succeeded") return new Response(null, { status: 204 });
  const payment = await dodo().payments.retrieve(event.data.payment_id);
  const orderId = payment.metadata.token_order_id;
  if (typeof orderId !== "string") return new Response(null, { status: 204 });
  const order = await prisma.tokenOrder.findUnique({ where: { id: orderId } });
  if (!order || order.paymentId) return new Response(null, { status: 204 });
  // Dodo applies and validates merchant-created promotion codes at checkout.
  const hasPromotion = Boolean(payment.discount_id || payment.discounts?.length);
  const expectedAmount = order.quantity * 100;
  const amountMatches = hasPromotion
    ? payment.total_amount >= 0 && payment.total_amount <= expectedAmount
    : payment.total_amount === expectedAmount;
  if (payment.status !== "succeeded" || payment.currency !== "INR" ||
      !amountMatches ||
      !payment.product_cart?.some((item) => item.product_id === order.productId && item.quantity === order.quantity)) {
    return new Response("Payment does not match order", { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.tokenOrder.updateMany({
      where: { id: order.id, paymentId: null },
      data: { paymentId: payment.payment_id },
    });
    if (!claimed.count) return;
    await tx.tokenWallet.upsert({
      where: { ownerId: order.ownerId },
      create: { ownerId: order.ownerId, balance: order.quantity, purchased: order.quantity },
      update: { balance: { increment: order.quantity }, purchased: { increment: order.quantity } },
    });
  });
  return new Response(null, { status: 204 });
}
