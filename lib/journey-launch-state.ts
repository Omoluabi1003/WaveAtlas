import type { JourneyRoute } from '@/lib/atlas-journey-contract';
import type { AtlasTravelProfile } from '@/lib/atlas-travel-mode';

export type JourneyLaunchMode = {
  profile: AtlasTravelProfile;
  enabled: boolean;
  recommended: boolean;
  reason: string;
};

export function journeyLaunchDistanceKm(route: JourneyRoute) {
  const radians = Math.PI / 180;
  const dLat = (route.to.lat - route.from.lat) * radians;
  const dLng = (route.to.lng - route.from.lng) * radians;
  const fromLat = route.from.lat * radians;
  const toLat = route.to.lat * radians;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}

export function journeyLaunchModes(route: JourneyRoute): JourneyLaunchMode[] {
  const distanceKm = journeyLaunchDistanceKm(route);
  const sameCountry = Boolean(route.from.countryCode && route.from.countryCode === route.to.countryCode);

  const walkEnabled = sameCountry && distanceKm <= 30;
  const bicycleEnabled = sameCountry && distanceKm <= 180;
  const driveEnabled = (sameCountry && distanceKm <= 900) || distanceKm <= 320;

  let recommended: AtlasTravelProfile = 'flight';
  if (walkEnabled && distanceKm <= 8) recommended = 'walk';
  else if (bicycleEnabled && distanceKm <= 80) recommended = 'bicycle';
  else if (driveEnabled) recommended = 'drive';

  return [
    {
      profile: 'flight',
      enabled: true,
      recommended: recommended === 'flight',
      reason: distanceKm > 900 || !sameCountry ? 'Best fit for this airport pair.' : 'Always available for airport-to-airport travel.',
    },
    {
      profile: 'drive',
      enabled: driveEnabled,
      recommended: recommended === 'drive',
      reason: driveEnabled ? 'Ground routing is sensible for this distance.' : 'Hidden for a route that is too long for a useful drive preview.',
    },
    {
      profile: 'bicycle',
      enabled: bicycleEnabled,
      recommended: recommended === 'bicycle',
      reason: bicycleEnabled ? 'Available for a short same-country airport pair.' : 'Hidden unless the airports are close enough for a useful bicycle route.',
    },
    {
      profile: 'walk',
      enabled: walkEnabled,
      recommended: recommended === 'walk',
      reason: walkEnabled ? 'Available for a very short same-country airport pair.' : 'Hidden unless the airports are very close.',
    },
  ];
}

export function recommendedJourneyLaunchProfile(route: JourneyRoute): AtlasTravelProfile {
  return journeyLaunchModes(route).find((mode) => mode.recommended)?.profile || 'flight';
}
