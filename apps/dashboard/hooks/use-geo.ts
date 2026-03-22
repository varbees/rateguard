import { useState, useEffect } from 'react';
import { authAPI } from '@/lib/api';

export interface GeoData {
  CountryCode: string;
  Currency: string;
  Provider: string;
}

const GEO_CACHE_KEY = 'rateguard_geo_data';
const GEO_CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

export function useGeo() {
  const [geoData, setGeoData] = useState<GeoData>({
    CountryCode: '',
    Currency: 'USD', // Default fallback
    Provider: 'stripe',
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchGeoData = async () => {
      try {
        // Check cache first
        const cached = localStorage.getItem(GEO_CACHE_KEY);
        if (cached) {
          const { data, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < GEO_CACHE_EXPIRY) {
            setGeoData(data);
            setIsLoading(false);
            return;
          }
        }

        // Fetch from API
        const data = await authAPI.detectGeo();

        // Cache result
        localStorage.setItem(GEO_CACHE_KEY, JSON.stringify({
          data,
          timestamp: Date.now(),
        }));

        setGeoData(data);
      } catch (error) {
        console.error('Failed to fetch geo data:', error);
        // Keep default USD
      } finally {
        setIsLoading(false);
      }
    };

    fetchGeoData();
  }, []);

  return { ...geoData, isLoading };
}
