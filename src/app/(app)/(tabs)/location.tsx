import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Share, Pressable, Alert, StyleSheet } from 'react-native';
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
      <View style={s.loadingContainer}>
        <ActivityIndicator size="large" color="#0D9488" />
        <Text style={s.loadingText}>Acquiring GPS Signal...</Text>
      </View>
    );
  }

  // Mock historical fall location coordinates
  const mockHistory = [
    { latitude: 37.7750, longitude: -122.4199, timestamp: '3 days ago' },
    { latitude: 37.7745, longitude: -122.4190, timestamp: '10 days ago' }
  ];

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Title Header */}
      <View style={s.titleRow}>
        <View>
          <Text style={s.headerLabel}>
            GPS tracking
          </Text>
          <Text style={s.headerTitle}>
            Live Location
          </Text>
        </View>

        <Pressable 
          onPress={fetchLiveLocation}
          style={s.refreshBtn}
        >
          <RefreshCw size={18} color="#94A3B8" />
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
      <Card style={s.shareCard}>
        <View style={s.shareCardLeft}>
          <Text style={s.shareTitle}>Share Tracking Access</Text>
          <Text style={s.shareSubtitle}>
            Broadcast encrypted GPS coords directly via SMS/Email to emergency contacts.
          </Text>
        </View>
        <Button
          title="Share Link"
          onPress={handleShareTracking}
          variant="outline"
          size="sm"
          style={s.shareBtn}
        />
      </Card>

      {/* Fall Risk Hotspots */}
      <Card style={s.mb6}>
        <View style={s.sectionHeaderRow}>
          <AlertCircle size={18} color="#F59E0B" style={s.mr2} />
          <Text style={s.sectionTitle}>Geo-Protection Safezones</Text>
        </View>
        
        <Text style={s.safezoneDesc}>
          SafeFall AI tracks historical falls and home parameters to detect fall-prone hotspots.
        </Text>

        <View style={s.safezoneList}>
          <View style={s.safezoneItem}>
            <View>
              <Text style={s.safezoneName}>Living Room Area</Text>
              <Text style={s.safezoneDetail}>1 fall anomaly recorded</Text>
            </View>
            <View style={s.badgeMedium}>
              <Text style={s.badgeMediumText}>Medium Risk</Text>
            </View>
          </View>

          <View style={s.safezoneItemLast}>
            <View>
              <Text style={s.safezoneName}>Bathroom / Shower</Text>
              <Text style={s.safezoneDetail}>0 anomalies. Floor pad installed</Text>
            </View>
            <View style={s.badgeSafe}>
              <Text style={s.badgeSafeText}>Safezone</Text>
            </View>
          </View>
        </View>
      </Card>

    </ScrollView>
  );
}

const s = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#0F172A',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0F172A',
  },
  loadingText: { fontSize: 14, color: '#94A3B8', marginTop: 8, fontWeight: '500' },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  headerLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#64748B',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  refreshBtn: {
    padding: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
  },
  shareCard: {
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  shareCardLeft: { flex: 1, paddingRight: 12 },
  shareTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF', marginBottom: 2 },
  shareSubtitle: { fontSize: 12, color: '#94A3B8', lineHeight: 16 },
  shareBtn: { borderColor: '#475569' },
  mb6: { marginBottom: 24 },
  mr2: { marginRight: 8 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  safezoneDesc: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 18,
    marginBottom: 16,
  },
  safezoneList: {},
  safezoneItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(30,41,59,0.8)',
    paddingBottom: 8,
    marginBottom: 8,
  },
  safezoneItemLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  safezoneName: { fontSize: 12, fontWeight: '700', color: '#E2E8F0' },
  safezoneDetail: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  badgeMedium: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(245,158,11,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(245,158,11,0.3)',
    borderRadius: 4,
  },
  badgeMediumText: { fontSize: 10, fontWeight: '700', color: '#D97706', textTransform: 'uppercase' },
  badgeSafe: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: 'rgba(16,185,129,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(16,185,129,0.3)',
    borderRadius: 4,
  },
  badgeSafeText: { fontSize: 10, fontWeight: '700', color: '#10B981', textTransform: 'uppercase' },
});
