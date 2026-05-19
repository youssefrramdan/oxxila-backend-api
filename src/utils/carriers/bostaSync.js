// src/utils/carriers/bostaSync.js
import Country from '../../models/Country.js';
import Governorate from '../../models/Governorate.js';
import District from '../../models/District.js';
import CarrierCoverage from '../../models/CarrierCoverage.js';
import { fetchBostaCityDistricts } from './bosta.js';

const normalizeLabel = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

const matchGovernorate = (governorates, city) => {
  const needles = [
    city.cityName,
    city.cityOtherName,
    city.cityCode,
  ].map(normalizeLabel).filter(Boolean);

  return governorates.find((g) => {
    const name = normalizeLabel(g.name);
    return needles.some((n) => n === name || name.includes(n) || n.includes(name));
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
    return needles.some((n) => n === name || name.includes(n) || n.includes(name));
  });
};

export const syncBostaZones = async (credentials, { countryCode = 'EG' } = {}) => {
  const cities = await fetchBostaCityDistricts(credentials);
  const country = await Country.findOne({ code: countryCode.toUpperCase(), isActive: true });
  if (!country) {
    throw new Error(`No active country found with code: ${countryCode}`);
  }

  let governoratesMatched = 0;
  let districtsCreated = 0;
  let districtsUpdated = 0;
  let governoratesCreated = 0;

  const existingGovs = await Governorate.find({ country: country._id });

  for (const city of cities) {
    if (city.dropOffAvailability === false) continue;

    let governorate = matchGovernorate(existingGovs, city);
    if (!governorate) {
      governorate = await Governorate.create({
        country: country._id,
        name: city.cityName || city.cityOtherName || city.cityCode,
        shippingPrice: 0,
        isActive: true,
        bostaApiCovered: true,
        bostaCityId: city.cityId,
      });
      existingGovs.push(governorate);
      governoratesCreated += 1;
    } else {
      await Governorate.findByIdAndUpdate(governorate._id, {
        bostaApiCovered: true,
        bostaCityId: city.cityId,
      });
      governoratesMatched += 1;
    }

    const existingDistricts = await District.find({ governorate: governorate._id });
    const bostaDistricts = city.districts || [];

    for (const bd of bostaDistricts) {
      if (bd.dropOffAvailability === false) continue;

      const matched = matchDistrict(existingDistricts, bd);
      if (matched) {
        await District.findByIdAndUpdate(matched._id, {
          bostaApiCovered: true,
          bostaDistrictId: bd.districtId,
          bostaZoneId: bd.zoneId ?? null,
          bostaDropOffAvailable: bd.dropOffAvailability !== false,
          isCovered: true,
        });
        districtsUpdated += 1;
      } else {
        const created = await District.create({
          governorate: governorate._id,
          name: bd.districtName || bd.zoneName || 'District',
          shippingPrice: governorate.shippingPrice ?? 0,
          isCovered: true,
          bostaApiCovered: true,
          bostaDistrictId: bd.districtId,
          bostaZoneId: bd.zoneId ?? null,
          bostaDropOffAvailable: bd.dropOffAvailability !== false,
        });
        existingDistricts.push(created);
        districtsCreated += 1;
      }
    }
  }

  return {
    governoratesMatched,
    governoratesCreated,
    districtsCreated,
    districtsUpdated,
    citiesProcessed: cities.length,
  };
};

export const syncBostaCarrierCoverage = async (carrierId, credentials) => {
  await syncBostaZones(credentials);

  const country = await Country.findOne({ code: 'EG', isActive: true });
  if (!country) return { count: 0 };

  const governorates = await Governorate.find({
    country: country._id,
    bostaApiCovered: true,
    isActive: true,
  });

  const coveredGovIds = [];
  for (const gov of governorates) {
    const hasDropOff = await District.exists({
      governorate: gov._id,
      bostaApiCovered: true,
      bostaDropOffAvailable: { $ne: false },
    });
    if (hasDropOff) coveredGovIds.push(gov._id);
  }

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

  return { count: coveredGovIds.length };
};
