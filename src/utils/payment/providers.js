// src/utils/payment/providers.js
import { createStripeCheckoutSession } from './stripe.js';
import { createPaymobCheckout } from './paymob.js';
import { saveProviderSessionId } from './session.js';

const startStripe = async ({ paymentSession, totalPrice, user }) => {
  const { providerSessionId, url } = await createStripeCheckoutSession({
    paymentSessionId: paymentSession._id.toString(),
    totalPrice,
    userEmail: user.email,
  });
  await saveProviderSessionId(paymentSession, providerSessionId);
  return { url };
};

const startPaymob = async ({ paymentSession, totalPrice, user }) => {
  const { providerSessionId, iframeUrl } = await createPaymobCheckout({
    paymentSessionId: paymentSession._id.toString(),
    totalPrice,
    user: { name: user.name, email: user.email, phone: user.phone },
  });
  await saveProviderSessionId(paymentSession, providerSessionId);
  return { iframeUrl };
};

export const paymentProviders = {
  stripe: startStripe,
  paymob: startPaymob,
};
