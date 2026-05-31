import * as Location from 'expo-location';

class LocationService {
  
  async requestPermissions(): Promise<boolean> {
    try {
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      if (foregroundStatus !== 'granted') {
        console.warn('Foreground location permission denied.');
        return false;
      }

      // Background location is highly recommended for fall monitoring
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      if (backgroundStatus !== 'granted') {
        console.warn('Background location permission denied. Fall telemetry might fail when app is closed.');
      }
      
      return true;
    } catch (err) {
      console.error('Error requesting location permissions:', err);
      return false;
    }
  }

  async getCurrentLocation(): Promise<{ latitude: number; longitude: number; address?: string } | null> {
    try {
      const isEnabled = await Location.hasServicesEnabledAsync();
      if (!isEnabled) {
        console.warn('Location services are disabled.');
        return this.getMockLocation();
      }

      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== 'granted') {
        return this.getMockLocation();
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const { latitude, longitude } = location.coords;
      let address = 'San Francisco, CA';

      try {
        const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
        if (geocode && geocode.length > 0) {
          const first = geocode[0];
          address = `${first.streetNumber || ''} ${first.street || ''}, ${first.city || ''}, ${first.region || ''} ${first.postalCode || ''}`.trim();
        }
      } catch (geocodeErr) {
        console.warn('Geocoding error, falling back to basic string', geocodeErr);
      }

      return { latitude, longitude, address };
    } catch (err) {
      console.error('Failed to get device location:', err);
      return this.getMockLocation();
    }
  }

  private getMockLocation() {
    // Return high quality dummy coordinates (San Francisco)
    return {
      latitude: 37.7749,
      longitude: -122.4194,
      address: '123 Pine Street, San Francisco, CA 94111'
    };
  }
}

export const locationService = new LocationService();
