// src/models/CarrierPickup.js
import mongoose from 'mongoose';

const contactPersonSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, trim: true, default: '' },
    phone: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const pickupAddressSchema = new mongoose.Schema(
  {
    firstLine: { type: String, required: true, trim: true },
    secondLine: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    cityId: { type: String, trim: true, default: null },
    zoneId: { type: String, trim: true, default: null },
    districtId: { type: String, trim: true, default: null },
    districtName: { type: String, trim: true, default: null },
  },
  { _id: false }
);

const carrierPickupSchema = new mongoose.Schema(
  {
    carrier: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Carrier',
      required: [true, 'Carrier is required'],
    },
    locationName: {
      type: String,
      required: [true, 'Location name is required'],
      trim: true,
    },
    contactPerson: { type: contactPersonSchema, required: true },
    address: { type: pickupAddressSchema, required: true },
    bostaLocationId: { type: String, default: null },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true }
);

carrierPickupSchema.index({ carrier: 1 });
carrierPickupSchema.index({ carrier: 1, bostaLocationId: 1 }, { sparse: true });

carrierPickupSchema.pre('save', async function () {
  if (!this.isDefault) return;
  await mongoose.model('CarrierPickup').updateMany(
    { carrier: this.carrier, _id: { $ne: this._id } },
    { $set: { isDefault: false } }
  );
});

const CarrierPickup = mongoose.model('CarrierPickup', carrierPickupSchema);
export default CarrierPickup;
