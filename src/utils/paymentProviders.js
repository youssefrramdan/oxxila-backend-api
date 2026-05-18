// src/utils/paymentProviders.js
import { createStripeCheckoutSession } from './stripeClient.js';
import { createPaymobPaymentSession } from './paymobClient.js';

const startStripeSession = async ({ paymentSession, checkout, user }) => {
  const stripeSession = await createStripeCheckoutSession({
    paymentSessionId: paymentSession._id.toString(),
    totalPrice: checkout.totalPrice,
    userEmail: user.email,
  });

  paymentSession.providerSessionId = stripeSession.sessionId;
  await paymentSession.save();

  return { sessionId: stripeSession.sessionId, url: stripeSession.url };
};

const startPaymobSession = async ({ paymentSession, checkout, user }) => {
  const paymobSession = await createPaymobPaymentSession({
    paymentSessionId: paymentSession._id.toString(),
    totalPrice: checkout.totalPrice,
    user: { name: user.name, email: user.email, phone: user.phone },
  });

  paymentSession.providerSessionId = paymobSession.sessionId;
  await paymentSession.save();

  return {
    orderId: paymobSession.sessionId,
    paymentToken: paymobSession.paymentToken,
    iframeUrl: paymobSession.iframeUrl,
  };
};

export const paymentProviderHandlers = {
  stripe: startStripeSession,
  paymob: startPaymobSession,
};
