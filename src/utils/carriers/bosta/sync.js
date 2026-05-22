// src/utils/carriers/bosta/sync.js
import Country from '../../../models/Country.js';
import Governorate from '../../../models/Governorate.js';
import District from '../../../models/District.js';
import CarrierCoverage from '../../../models/CarrierCoverage.js';
import CarrierZoneMapping from '../../../models/CarrierZoneMapping.js';
import { fetchBostaCityDistricts } from './districts.js';

const normalizeLabel = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const matchGovernorate = (governorates, city) => {
  const needles = [city.cityName, city.cityOtherName, city.cityCode]
    .map(normalizeLabel)
    .filter(Boolean);

  return governorates.find((g) => {
    const name = normalizeLabel(g.name);
    return needles.some(
      (n) => n.length > 2 && (n === name || name.includes(n) || n.includes(name))
    );
  });
};

const matchDistrict = (districts, bostaDistrict) => {
  const needles = [
    bostaDistrict.districtName,
    bostaDistrict.districtOtherName,
    bostaDistrict.zoneName,
    bostaDistrict.zoneOtherName,
  ]
    .map(normalizeLabel)
    .filter(Boolean);

  return districts.find((d) => {
    const name = normalizeLabel(d.name);
    return needles.some(
      (n) => n.length > 2 && (n === name || name.includes(n) || n.includes(name))
    );
  });
};

const mappingUpsertOp = (carrierId, zoneType, zoneId, data) => ({
  updateOne: {
    filter: { carrier: carrierId, zoneType, zoneId },
    update: { $set: { carrier: carrierId, zoneType, zoneId, ...data } },
    upsert: true,
  },
});

export const syncBostaZones = async (credentials, carrierId, { countryCode = 'EG' } = {}) => {
  const cities = await fetchBostaCityDistricts(credentials);
  const country = await Country.findOne({
    code: countryCode.toUpperCase(),
    isActive: true,
  });
  if (!country) {
    throw new Error(`No active country found with code: ${countryCode}`);
  }

  let governoratesMatched = 0;
  let districtsCreated = 0;
  let districtsUpdated = 0;
  let governoratesCreated = 0;

  const existingGovs = await Governorate.find({ country: country._id });
  const govIds = existingGovs.map((g) => g._id);
  const allDistricts = await District.find({ governorate: { $in: govIds } });
  const districtsByGov = new Map();
  for (const d of allDistricts) {
    const key = String(d.governorate);
    if (!districtsByGov.has(key)) districtsByGov.set(key, []);
    districtsByGov.get(key).push(d);
  }

  const districtBulkOps = [];
  const mappingBulkOps = [];

  for (const city of cities) {
    if (city.dropOffAvailability === false) continue;

    let governorate = matchGovernorate(existingGovs, city);
    if (!governorate) {
      governorate = await Governorate.create({
        country: country._id,
        name: city.cityName || city.cityOtherName || city.cityCode,
        shippingPrice: 0,
        isActive: true,
      });
      existingGovs.push(governorate);
      govIds.push(governorate._id);
      districtsByGov.set(String(governorate._id), []);
      governoratesCreated += 1;
    } else {
      governoratesMatched += 1;
    }

    if (carrierId) {
      mappingBulkOps.push(
        mappingUpsertOp(carrierId, 'governorate', governorate._id, {
          isServiceable: true,
          externalCityId: city.cityId,
          dropOffAvailable: true,
        })
      );
    }

    const existingDistricts = districtsByGov.get(String(governorate._id)) ?? [];
    const bostaDistricts = city.districts || [];

    for (const bd of bostaDistricts) {
      if (bd.dropOffAvailability === false) continue;

      const matched = matchDistrict(existingDistricts, bd);
      if (matched) {
        districtBulkOps.push({
          updateOne: {
            filter: { _id: matched._id },
            update: { $set: { isCovered: true } },
          },
        });
        districtsUpdated += 1;
        if (carrierId) {
          mappingBulkOps.push(
            mappingUpsertOp(carrierId, 'district', matched._id, {
              isServiceable: true,
              externalCityId: city.cityId,
              externalDistrictId: bd.districtId,
              externalZoneId: bd.zoneId ?? null,
              dropOffAvailable: bd.dropOffAvailability !== false,
            })
          );
        }
      } else {
        const [created] = await District.create([
          {
            governorate: governorate._id,
            name: bd.districtName || bd.zoneName || 'District',
            shippingPrice: governorate.shippingPrice ?? 0,
            isCovered: true,
          },
        ]);
        existingDistricts.push(created);
        districtsByGov.set(String(governorate._id), existingDistricts);
        districtsCreated += 1;
        if (carrierId) {
          mappingBulkOps.push(
            mappingUpsertOp(carrierId, 'district', created._id, {
              isServiceable: true,
              externalCityId: city.cityId,
              externalDistrictId: bd.districtId,
              externalZoneId: bd.zoneId ?? null,
              dropOffAvailable: bd.dropOffAvailability !== false,
            })
          );
        }
      }
    }
  }

  if (districtBulkOps.length) await District.bulkWrite(districtBulkOps, { ordered: false });
  if (mappingBulkOps.length) {
    await CarrierZoneMapping.bulkWrite(mappingBulkOps, { ordered: false });
  }

  return {
    governoratesMatched,
    governoratesCreated,
    districtsCreated,
    districtsUpdated,
    mappingsUpserted: mappingBulkOps.length,
    citiesProcessed: cities.length,
  };
};

export const syncBostaCarrierCoverage = async (carrierId, credentials) => {
  const zoneStats = await syncBostaZones(credentials, carrierId);

  const districtZoneIds = await CarrierZoneMapping.find({
    carrier: carrierId,
    zoneType: 'district',
    isServiceable: true,
    dropOffAvailable: { $ne: false },
  }).distinct('zoneId');

  const coveredGovIds = await District.find({
    _id: { $in: districtZoneIds },
    isCovered: true,
  }).distinct('governorate');

  await CarrierCoverage.deleteMany({ carrier: carrierId });
  if (coveredGovIds.length > 0) {
    await CarrierCoverage.insertMany(
      coveredGovIds.map((governorate) => ({
        carrier: carrierId,
        governorate,
        isActive: true,
      }))
    );
  }

  return { ...zoneStats, coverageGovernorates: coveredGovIds.length };
};
