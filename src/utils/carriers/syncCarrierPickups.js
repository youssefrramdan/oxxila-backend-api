// src/utils/carriers/syncCarrierPickups.js
import CarrierPickup from '../../models/CarrierPickup.js';
import { listBostaPickupLocations, mapBostaPickupLocationToLocal } from './bosta.js';

export const syncCarrierPickupsFromBosta = async (carrierId, credentials) => {
  const list = await listBostaPickupLocations(credentials);
  if (!list.length) return [];

  const synced = [];
  for (const loc of list) {
    const mapped = mapBostaPickupLocationToLocal(loc);
    if (!mapped.bostaLocationId) continue;

    let doc = await CarrierPickup.findOne({
      carrier: carrierId,
      bostaLocationId: mapped.bostaLocationId,
    });

    if (doc) {
      doc.locationName = mapped.locationName;
      doc.contactPerson = mapped.contactPerson;
      doc.address = mapped.address;
      doc.isDefault = mapped.isDefault;
      await doc.save();
    } else {
      doc = await CarrierPickup.create({
        carrier: carrierId,
        ...mapped,
      });
    }
    synced.push(doc);
  }

  return synced;
};

export const findDefaultCarrierPickup = async (carrierId, credentials) => {
  let pickup =
    (await CarrierPickup.findOne({ carrier: carrierId, isDefault: true })) ||
    (await CarrierPickup.findOne({ carrier: carrierId }).sort({ createdAt: 1 }));

  if (pickup || !credentials) return pickup;

  try {
    await syncCarrierPickupsFromBosta(carrierId, credentials);
  } catch {
    return null;
  }

  return (
    (await CarrierPickup.findOne({ carrier: carrierId, isDefault: true })) ||
    (await CarrierPickup.findOne({ carrier: carrierId }).sort({ createdAt: 1 }))
  );
};
