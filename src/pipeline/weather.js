const CACHE_MS = 15 * 60 * 1000;
const cache = new Map();

function roundCoord(value) {
  return Math.round(value * 100) / 100;
}

function conditionFromCode(code) {
  if (code === 0) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
  if (code >= 95) return 'storm';

  return 'unknown';
}

function clearWeatherCache() {
  cache.clear();
}

async function fetchWeather(lat, lng, options = {}) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  const { fetchImpl = fetch, now = Date.now, logger } = options;
  const key = `${roundCoord(lat)},${roundCoord(lng)}`;
  const hit = cache.get(key);

  if (hit && hit.expiresAt > now()) return hit.weather;

  const url = new URL('https://api.open-meteo.com/v1/forecast');

  url.searchParams.set('latitude', String(roundCoord(lat)));
  url.searchParams.set('longitude', String(roundCoord(lng)));
  url.searchParams.set('current', 'weather_code,temperature_2m,precipitation');

  try {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(4000) });

    if (!response.ok) return hit ? hit.weather : null;

    const body = await response.json();
    const current = body.current;

    if (!current || typeof current.weather_code !== 'number') return hit ? hit.weather : null;

    const weather = {
      condition: conditionFromCode(current.weather_code),
      weather_code: current.weather_code,
      temperature_c: current.temperature_2m,
      precipitation_mm: current.precipitation,
    };

    cache.set(key, { expiresAt: now() + CACHE_MS, weather });

    return weather;
  } catch (error) {
    if (logger) logger.warn({ err: error }, 'weather lookup failed');

    return hit ? hit.weather : null;
  }
}

module.exports = {
  CACHE_MS,
  clearWeatherCache,
  conditionFromCode,
  fetchWeather,
};
