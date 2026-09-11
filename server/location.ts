import { ApiError, json, limit } from './data';
import type { Env } from './env';
export async function searchCities(
  request: Request,
  env: Env,
  profile: { id: string; plan: string },
) {
  if (profile.plan === 'free')
    throw new ApiError(
      403,
      'City matching requires Basic or Plus.',
      'plan_required',
    );
  await limit(env, 'city-search:' + profile.id, 10);
  const query = (new URL(request.url).searchParams.get('q') ?? '').trim();
  if (query.length < 2 || query.length > 100)
    throw new ApiError(400, 'Enter a city name between 2 and 100 characters.');
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', '6');
  url.searchParams.set('layer', 'city');
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'ChatUp/1.0 (https://chatup.chat)' },
      cf: { cacheTtl: 86400, cacheEverything: true },
    });
  } catch {
    throw new ApiError(
      503,
      'City search is unavailable. Try your browser location instead.',
    );
  }
  if (!response.ok)
    throw new ApiError(503, 'City search is unavailable. Try again later.');
  const data = (await response.json()) as {
    features?: {
      geometry?: { coordinates?: number[] };
      properties?: { name?: string; state?: string; country?: string };
    }[];
  };
  return json(
    (data.features ?? []).flatMap((f) => {
      const [longitude, latitude] = f.geometry?.coordinates ?? [];
      if (
        !Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        !f.properties?.name
      )
        return [];
      return [
        {
          label: [f.properties.name, f.properties.state, f.properties.country]
            .filter(Boolean)
            .join(', '),
          latitude: Math.round(latitude * 10) / 10,
          longitude: Math.round(longitude * 10) / 10,
        },
      ];
    }),
  );
}
