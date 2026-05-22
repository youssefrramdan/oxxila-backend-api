// src/utils/shipping/zoneMapping.js
import CarrierZoneMapping from '../../models/CarrierZoneMapping.js';
import District from '../../models/District.js';

export const getCarrierZoneMapping = async (carrierId, { governorateId, districtId }) => {
  if (districtId) {
    const districtMapping = await CarrierZoneMapping.findOne({
      carrier: carrierId,
      zoneType: 'district',
      zoneId: districtId,
      isServiceable: true,
    }).lean();
    if (districtMapping) return districtMapping;
  }

  if (governorateId) {
    return CarrierZoneMapping.findOne({
      carrier: carrierId,
      zoneType: 'governorate',
      zoneId: governorateId,
      isServiceable: true,
    }).lean();
  }

  return null;
};

export const assertBostaDropOffServiceable = async (carrierId, order) => {
  const { governorateId, districtId, isOther } = order.shippingAddress;

  if (districtId && !isOther) {
    const district = await District.findById(districtId).select('isCovered name');
    if (!district?.isCovered) {
      return { ok: false, message: `District ${order.shippingAddress.districtName} is not covered` };
    }
    const mapping = await getCarrierZoneMapping(carrierId, { governorateId, districtId });
    if (!mapping?.externalDistrictId && !mapping?.externalCityId) {
      return {
        ok: false,
        message: `District ${district.name} has no Bosta mapping. Run zone sync in shipping admin.`,
      };
    }
    if (mapping.dropOffAvailable === false) {
      return { ok: false, message: `District ${district.name} is not available for Bosta drop-off` };
    }
    return { ok: true, mapping };
  }

  const govMapping = await getCarrierZoneMapping(carrierId, { governorateId });
  if (!govMapping?.externalCityId) {
    return {
      ok: false,
      message: 'Governorate has no Bosta city mapping. Run zone sync or select a covered district.',
    };
  }
  return { ok: true, mapping: govMapping };
};
