export type BrowserLocation = {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
};

export type AttendanceSecurityPayload = {
  latitude?: number;
  longitude?: number;
  accuracyMeters?: number;
};

export function getCurrentLocation(): Promise<BrowserLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is unavailable.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
        });
      },
      reject,
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 6000,
      },
    );
  });
}

export function getDistanceMeters(
  from: Pick<BrowserLocation, 'latitude' | 'longitude'>,
  to: Pick<BrowserLocation, 'latitude' | 'longitude'>,
) {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const sourceLatitude = toRadians(from.latitude);
  const destinationLatitude = toRadians(to.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(sourceLatitude) *
      Math.cos(destinationLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;

  return Math.round(
    2 *
      earthRadiusMeters *
      Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine)),
  );
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}
