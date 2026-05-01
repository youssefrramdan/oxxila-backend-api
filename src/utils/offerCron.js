// src/utils/offerCron.js
import cron from 'node-cron';
import Offer from '../models/Offer.js';
import Product from '../models/Product.js';

export const startOfferCron = () => {
  cron.schedule('0 * * * *', async () => {
    const expired = await Offer.find({
      isActive: true,
      endDate: { $lt: new Date() },
    });

    for (const offer of expired) {
      await Product.findByIdAndUpdate(offer.product, {
        $set: { priceAfterDiscount: null, offerEndsAt: null },
      });
      offer.isActive = false;
      await offer.save();
    }

    if (expired.length) {
      console.log(`[Cron] Cleaned ${expired.length} expired offers`);
    }
  });
};
