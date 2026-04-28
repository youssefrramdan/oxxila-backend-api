import cron from 'node-cron';
import Offer from '../models/Offer.js';
import Product from '../models/Product.js';

// كل ساعة — شيل الـ offers المنتهية
export const startOfferCron = () => {
  cron.schedule('0 * * * *', async () => {
    const expiredOffers = await Offer.find({
      endDate: { $lt: new Date() },
      isActive: true,
    });

    for (const offer of expiredOffers) {
      await Product.findByIdAndUpdate(offer.product, {
        $set: { priceAfterDiscount: null, offerEndsAt: null },
      });
      offer.isActive = false;
      await offer.save();
    }

    console.log(`[Cron] Cleaned ${expiredOffers.length} expired offers`);
  });
};
