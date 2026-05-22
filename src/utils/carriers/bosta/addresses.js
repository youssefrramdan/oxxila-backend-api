// src/utils/carriers/bosta/addresses.js
import mongoose from 'mongoose';
import ApiError from '../../apiError.js';
import { getCarrierZoneMapping } from '../../shipping/zoneMapping.js';
import { resolveBostaDistrictMatch } from './districts.js';

const isMongoObjectId = (id) =>
  mongoose.Types.ObjectId.isValid(String(id ?? '')) &&
  String(id).length === 24;

export const applyBostaAddressDefaults = (addr = {}) => {
  const out = { ...addr };
  const zoneLabel = String(out.districtName || out.city || '').trim();
  if (!out.secondLine && zoneLabel) out.secondLine = zoneLabel;
  if (!out.floor) out.floor = '1';
  if (!out.apartment) out.apartment = '1';
  if (!out.buildingNumber) out.buildingNumber = '1';
  return out;
};

export const buildBostaAddress = ({
  city,
  cityId,
  zoneId,
  districtId,
  districtName,
  firstLine,
  secondLine,
} = {}) => {
  const addr = {
    city: String(city || '').trim(),
    firstLine: String(firstLine || '').trim(),
  };
  const cid = String(cityId || '').trim();
  const zid = String(zoneId || '').trim();
  const distId = String(districtId || '').trim();
  const label = String(districtName || '').trim();

  if (cid) addr.cityId = cid;
  if (zid) addr.zoneId = zid;
  if (distId) addr.districtId = distId;
  else if (label && cid) addr.districtName = label;

  if (secondLine) addr.secondLine = String(secondLine).trim();
  return addr;
};

/** Build drop-off from CarrierZoneMapping — no fuzzy API match (avoids wrong district). */
export const buildDropOffFromMapping = (shippingAddress, mapping) => {
  const {
    governorateName,
    districtName,
    addressLine,
    isOther,
  } = shippingAddress;

  if (mapping?.externalDistrictId && mapping?.externalCityId) {
    return applyBostaAddressDefaults(
      buildBostaAddress({
        city: governorateName,
        cityId: mapping.externalCityId,
        zoneId: mapping.externalZoneId || undefined,
        districtId: mapping.externalDistrictId,
        firstLine: addressLine,
        secondLine: `${districtName}, ${governorateName}`,
      })
    );
  }

  if (mapping?.externalCityId && isOther) {
    return applyBostaAddressDefaults(
      buildBostaAddress({
        city: governorateName,
        cityId: mapping.externalCityId,
        zoneId: mapping.externalZoneId || undefined,
        districtName: districtName !== 'Other' ? districtName : undefined,
        firstLine: addressLine,
        secondLine: `${districtName}, ${governorateName}`,
      })
    );
  }

  return null;
};

export const enrichBostaAddress = async (addr, credentials, hints = {}) => {
  if (!addr || hints.skipEnrich) return addr;

  const cityId = String(hints.cityId || addr.cityId || '').trim();
  const districtId = String(hints.districtId || addr.districtId || '').trim();

  if (districtId && cityId) {
    return applyBostaAddressDefaults(
      buildBostaAddress({
        city: addr.city,
        cityId,
        zoneId: hints.zoneId || addr.zoneId,
        districtId,
        firstLine: addr.firstLine,
        secondLine: addr.secondLine,
      })
    );
  }

  let matched = null;
  if (credentials) {
    matched = await resolveBostaDistrictMatch(credentials, {
      cityName: hints.cityName || addr.city,
      districtName: hints.districtName || addr.districtName,
      districtId: hints.districtId || addr.districtId,
    });
  }

  const districtLabel =
    matched?.districtName || hints.districtName || addr.districtName;

  return applyBostaAddressDefaults(
    buildBostaAddress({
      city: matched?.cityName || addr.city,
      cityId: matched?.cityId || cityId || undefined,
      zoneId: matched?.zoneId || addr.zoneId || undefined,
      districtId: matched?.districtId || districtId || undefined,
      districtName: matched?.districtId || districtId ? undefined : districtLabel,
      firstLine: addr.firstLine,
      secondLine: addr.secondLine,
    })
  );
};

/** Customer pickup on a return — map Oxxila district → Bosta IDs (never use Mongo districtId as Bosta id). */
export const resolveReturnPickupBostaAddress = async (
  pickupAddress,
  carrierId,
  credentials
) => {
  const pa = pickupAddress ?? {};
  const isOther =
    !pa.districtId ||
    pa.districtName === 'Other' ||
    String(pa.districtId).toLowerCase() === 'other';

  if (pa.bostaDistrictId && pa.cityId) {
    const ready = applyBostaAddressDefaults(
      buildBostaAddress({
        city: pa.governorateName || pa.city,
        cityId: pa.cityId,
        zoneId: pa.zoneId,
        districtId: pa.bostaDistrictId,
        firstLine: pa.firstLine,
        secondLine: pa.secondLine,
      })
    );
    assertDropOffAddressReady(ready);
    return ready;
  }

  if (carrierId) {
    const mapping = await getCarrierZoneMapping(carrierId, {
      governorateId: pa.governorateId,
      districtId: isOther || !isMongoObjectId(pa.districtId) ? null : pa.districtId,
    });

    const fromMapping = buildDropOffFromMapping(
      {
        governorateName: pa.governorateName || pa.city,
        districtName: pa.districtName || pa.city,
        addressLine: pa.firstLine,
        isOther,
      },
      mapping
    );

    if (fromMapping) {
      if (pa.secondLine?.trim() && !fromMapping.secondLine) {
        fromMapping.secondLine = pa.secondLine.trim();
      }
      assertDropOffAddressReady(fromMapping);
      return fromMapping;
    }
  }

  const enriched = await enrichBostaAddress(
    buildBostaAddress({
      city: pa.governorateName || pa.city,
      firstLine: pa.firstLine,
      secondLine: pa.secondLine,
      districtName: pa.districtName,
    }),
    credentials,
    {
      cityName: pa.governorateName || pa.city,
      districtName: pa.districtName,
    }
  );

  assertDropOffAddressReady(enriched);
  return enriched;
};

export const assertDropOffAddressReady = (addr) => {
  if (String(addr?.firstLine || '').trim().length < 6) {
    throw new ApiError('Customer address must be at least 6 characters for Bosta', 400);
  }
  if (!addr?.districtId && !(addr?.districtName && addr?.cityId)) {
    throw new ApiError(
      'Bosta drop-off address is incomplete. Sync Bosta zones and use a covered district.',
      400
    );
  }
};
