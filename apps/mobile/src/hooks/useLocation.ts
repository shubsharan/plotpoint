import { useState, useEffect, useCallback } from "react";
import * as Location from "expo-location";

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface LocationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: Location.PermissionStatus;
}

/**
 * Hook to request and manage location permissions
 */
export function useLocationPermissions() {
  const [permission, setPermission] = useState<LocationPermissionStatus>({
    granted: false,
    canAskAgain: true,
    status: Location.PermissionStatus.UNDETERMINED,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
      setPermission({
        granted: status === Location.PermissionStatus.GRANTED,
        canAskAgain,
        status,
      });
    } catch (error) {
      console.error("Error checking location permissions:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermission = async () => {
    setIsLoading(true);
    try {
      const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
      const granted = status === Location.PermissionStatus.GRANTED;

      setPermission({
        granted,
        canAskAgain,
        status,
      });

      return granted;
    } catch (error) {
      console.error("Error requesting location permission:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    ...permission,
    isLoading,
    requestPermission,
    checkPermissions,
  };
}

/**
 * Hook to get the user's current location
 */
export function useCurrentLocation() {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const getCurrentLocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Check permission first
      const { status } = await Location.getForegroundPermissionsAsync();

      if (status !== Location.PermissionStatus.GRANTED) {
        setError("Location permission not granted");
        setIsLoading(false);
        return null;
      }

      // Get current position
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      const coords: LocationCoords = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      };

      setLocation(coords);
      return coords;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to get location";
      setError(errorMessage);
      console.error("Error getting current location:", err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    location,
    error,
    isLoading,
    getCurrentLocation,
  };
}

/**
 * Hook to calculate distance between two points
 * Uses Haversine formula to calculate distance in kilometers
 */
export function useDistanceCalculator() {
  const calculateDistance = useCallback(
    (point1: LocationCoords, point2: LocationCoords): number => {
      const R = 6371; // Earth's radius in kilometers
      const dLat = toRad(point2.latitude - point1.latitude);
      const dLon = toRad(point2.longitude - point1.longitude);

      const lat1 = toRad(point1.latitude);
      const lat2 = toRad(point2.latitude);

      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      return distance;
    },
    [],
  );

  const formatDistance = useCallback((distanceKm: number): string => {
    if (distanceKm < 1) {
      return `${Math.round(distanceKm * 1000)}m`;
    } else if (distanceKm < 10) {
      return `${distanceKm.toFixed(1)}km`;
    } else {
      return `${Math.round(distanceKm)}km`;
    }
  }, []);

  return {
    calculateDistance,
    formatDistance,
  };
}

// Helper function to convert degrees to radians
function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}
