import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Share, Pressable, Alert } from 'react-native';
import { useAuthStore } from '../../../store/authStore';
import { locationService } from '../../../services/locationService';
import { LiveMap } from '../../../components/Map/LiveMap';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { Share2, Compass, AlertCircle, RefreshCw } from 'lucide-react-native';

export default function LocationScreen() {
  const { user, activeElderlyProfile } = useAuthStore();
  const targetUser = activeElderlyProfile || user;

  const [location, setLocation] = useState<{ latitude: number; longitude: number; address?: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchLiveLocation = async () => {
    setIsLoading(true);
    try {
      const current = await locationService.getCurrentLocation();
      setLocation(current);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveLocation();
  }, []);

  const handleShareTracking = async () => {
    if (!location) return;
    try {
      const trackingUrl = `https://maps.google.com/?q=${location.latitude},${location.longitude}`;
      await Share.share({
        message: `Live Location Update for ${targetUser?.fullName || 'Elderly Patient'}: ${location.address}. Coordinates: ${location.latitude}, ${location.longitude}. Map: ${trackingUrl}`,
        title: 'SafeFall AI Live Location Sharing'
      });
    } catch (err) {
      Alert.alert('Share Failed', (err as Error).message);
    }
  };

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-950">
        <ActivityIndicator size="large" color="#0D9488" />
        <Text className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-medium">Acquiring GPS Signal...</Text>
      </View>
    );
  }

  // Mock historical fall location coordinates
  const mockHistory = [
    { latitude: 37.7750, longitude: -122.4199, timestamp: '3 days ago' },
    { latitude: 37.7745, longitude: -122.4190, timestamp: '10 days ago' }
  ];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* Title Header */}
      <View className="flex-row items-center justify-between mb-6">
        <View>
          <Text className="text-xxs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            GPS tracking
          </Text>
          <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">
            Live Location
          </Text>
        </View>

        <Pressable 
          onPress={fetchLiveLocation}
          className="p-2 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
        >
          <RefreshCw size={18} className="text-slate-600 dark:text-slate-400" />
        </Pressable>
      </View>

      {/* Interactive Map Layout wrapper */}
      {location && (
        <LiveMap 
          latitude={location.latitude} 
          longitude={location.longitude} 
          address={location.address}
          history={mockHistory}
        />
      )}

      {/* Broadcast CTA panel */}
      <Card className="mb-4 flex-row items-center justify-between">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-bold text-slate-800 dark:text-white mb-0.5">Share Tracking Access</Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400 leading-4">
            Broadcast encrypted GPS coords directly via SMS/Email to emergency contacts.
          </Text>
        </View>
        <Button
          title="Share Link"
          onPress={handleShareTracking}
          variant="outline"
          size="sm"
          className="border-slate-300"
        />
      </Card>

      {/* Fall Risk Hotspots */}
      <Card className="mb-6">
        <View className="flex-row items-center mb-3">
          <AlertCircle size={18} className="text-amber-500 mr-2" />
          <Text className="text-sm font-bold text-slate-800 dark:text-white">Geo-Protection Safezones</Text>
        </View>
        
        <Text className="text-xs text-slate-500 dark:text-slate-400 leading-4.5 mb-4">
          SafeFall AI tracks historical falls and home parameters to detect fall-prone hotspots.
        </Text>

        <View className="space-y-3">
          <View className="flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-2 mb-2">
            <View>
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">Living Room Area</Text>
              <Text className="text-xxs text-slate-400 dark:text-slate-500 font-semibold">1 fall anomaly recorded</Text>
            </View>
            <View className="px-2 py-0.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded">
              <Text className="text-xxs font-bold text-amber-600 uppercase">Medium Risk</Text>
            </View>
          </View>

          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-xs font-bold text-slate-700 dark:text-slate-200">Bathroom / Shower</Text>
              <Text className="text-xxs text-slate-400 dark:text-slate-500 font-semibold">0 anomalies. Floor pad installed</Text>
            </View>
            <View className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 rounded">
              <Text className="text-xxs font-bold text-emerald-600 uppercase">Safezone</Text>
            </View>
          </View>
        </View>
      </Card>

    </ScrollView>
  );
}
