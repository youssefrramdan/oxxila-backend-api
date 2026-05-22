// src/utils/carriers/bosta/districts.js
import { bostaRequest } from './client.js';

const normalizeLabel = (value) =>
  String(value || '')
    .trim()
    .toLowerCase();

let cityDistrictsCache = { list: null, fetchedAt: 0 };
const CACHE_MS = 5 * 60 * 1000;

const parseCityDistrictList = (res) => {
  const raw = res.data?.list ?? res.data?.cities ?? res.data ?? res.cities ?? res;
  return Array.isArray(raw) ? raw : [];
};

export const matchBostaDistrict = (cities, { cityName, districtName }) => {
  const cityNeedle = normalizeLabel(cityName);
  const distNeedle = normalizeLabel(districtName);
  if (!cityNeedle || !distNeedle || distNeedle === 'other') return null;

  const city = cities.find(
    (c) =>
      normalizeLabel(c.cityName) === cityNeedle ||
      normalizeLabel(c.cityOtherName) === cityNeedle ||
      normalizeLabel(c.cityCode) === cityNeedle
  );
  if (!city?.districts?.length) return null;

  const district = city.districts.find(
    (d) =>
      normalizeLabel(d.districtName) === distNeedle ||
      normalizeLabel(d.districtOtherName) === distNeedle ||
      normalizeLabel(d.zoneName) === distNeedle ||
      normalizeLabel(d.zoneOtherName) === distNeedle
  );
  if (!district?.districtId) return null;

  return {
    cityId: city.cityId,
    cityName: city.cityName,
    zoneId: district.zoneId,
    zoneName: district.zoneName,
    districtId: district.districtId,
    districtName: district.districtName,
  };
};

export const matchBostaDistrictById = (cities, districtId) => {
  const id = String(districtId || '').trim();
  if (!id) return null;

  for (const city of cities) {
    const district = city.districts?.find((d) => d.districtId === id);
    if (!district) continue;
    return {
      cityId: city.cityId,
      cityName: city.cityName,
      zoneId: district.zoneId,
      zoneName: district.zoneName,
      districtId: district.districtId,
      districtName: district.districtName,
    };
  }
  return null;
};

export const fetchBostaCityDistricts = async (credentials) => {
  if (cityDistrictsCache.list && Date.now() - cityDistrictsCache.fetchedAt < CACHE_MS) {
    return cityDistrictsCache.list;
  }

  for (const path of ['/api/v2/cities/getAllDistricts', '/api/v2/cities']) {
    try {
      const res = await bostaRequest('GET', path, null, credentials);
      const list = parseCityDistrictList(res);
      if (list.length > 0 && list[0]?.districts) {
        cityDistrictsCache = { list, fetchedAt: Date.now() };
        return list;
      }
    } catch (err) {
      if (err.statusCode === 401 || err.statusCode === 403) throw err;
    }
  }
  return [];
};

export const resolveBostaDistrictMatch = async (credentials, { cityName, districtName, districtId }) => {
  const cities = await fetchBostaCityDistricts(credentials);
  if (districtId) {
    const byId = matchBostaDistrictById(cities, districtId);
    if (byId) return byId;
  }
  if (cityName && districtName) {
    return matchBostaDistrict(cities, { cityName, districtName });
  }
  return null;
};

export const fetchBostaDistricts = (credentials) => fetchBostaCityDistricts(credentials);
