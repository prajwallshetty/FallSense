import React from 'react';
import { View, Text, Linking, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Line } from 'react-native-svg';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { MapPin, Map as MapIcon } from 'lucide-react-native';

interface LiveMapProps {
  latitude: number;
  longitude: number;
  address?: string;
  history?: Array<{ latitude: number; longitude: number; timestamp: string }>;
}

export const LiveMap: React.FC<LiveMapProps> = ({
  latitude,
  longitude,
  address = '123 Pine St, San Francisco, CA',
  history = [],
}) => {
  
  // Open Native Navigation (Google Maps or Apple Maps)
  const openExternalNavigation = () => {
    const url = Platform.select({
      ios: `maps://app?saddr=&daddr=${latitude},${longitude}`,
      android: `google.navigation:q=${latitude},${longitude}`,
      default: `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`,
    });

    if (url) {
      Linking.canOpenURL(url)
        .then((supported) => {
          if (supported) {
            Linking.openURL(url);
          } else {
            // Open web maps
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`);
          }
        })
        .catch((err) => console.error('Error opening maps', err));
    }
  };

  return (
    <Card style={styles.cardContainer}>
      
      {/* Visual Map Canvas Mockup */}
      <View style={styles.mapCanvas}>
        
        {/* Background Map Contours (SVG) */}
        <Svg width="100%" height="100%" style={styles.svgOverlay}>
          <Path
            d="M-50,80 Q50,60 150,110 T350,70 T550,120 M120,-20 L150,280 M280,-20 L240,280 M-20,180 L480,150"
            stroke="#0D9488"
            strokeWidth={1.5}
            fill="none"
          />
          <Path
            d="M50,20 Q120,40 220,10 T380,50 T480,20"
            stroke="#0D9488"
            strokeWidth={1.2}
            fill="none"
          />
        </Svg>

        {/* Historical fall trace lines */}
        {history.length > 0 && (
          <Svg width="100%" height="100%" style={styles.svgOverlay}>
            {/* Draw lines linking history */}
            <Line x1="100" y1="180" x2="160" y2="120" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4 4" />
            <Line x1="160" y1="120" x2="200" y2="128" stroke="#0D9488" strokeWidth={2} />
            
            {/* History Marker Dots */}
            <Circle cx="100" cy="180" r="5" fill="#94A3B8" />
            <Circle cx="160" cy="120" r="5" fill="#94A3B8" />
          </Svg>
        )}

        {/* Live Patient Pulse Anchor */}
        <View style={styles.centerAnchor}>
          {/* Animated pulse ring */}
          <View style={styles.pulseOuter} />
          <View style={styles.pulseInner} />
          
          <View style={styles.pulseDot}>
            <View style={styles.pulseDotInner} />
          </View>
        </View>

        {/* Float Map Icon Tag */}
        <View style={styles.floatTagLeft}>
          <MapIcon size={14} color="#0D9488" style={{ marginRight: 6 }} />
          <Text style={styles.floatTagText}>
            GPS Live Monitor
          </Text>
        </View>
        
        {/* Battery warning or signal indicator float right */}
        <View style={styles.floatTagRight}>
          <View style={styles.signalDot} />
          <Text style={styles.signalText}>
            Signal Locked
          </Text>
        </View>
      </View>

      {/* Address & Navigation Details */}
      <View style={styles.detailsContainer}>
        <View style={styles.addressRow}>
          <MapPin size={22} color="#EF4444" style={{ marginRight: 10, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.addressTitle}>
              Current Registered Location
            </Text>
            <Text style={styles.addressValue}>
              {address}
            </Text>
            <Text style={styles.coordsValue}>
              Lat: {latitude.toFixed(6)}, Lng: {longitude.toFixed(6)}
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.buttonRow}>
          <Button
            title="Dispatch Navigation"
            onPress={openExternalNavigation}
            variant="primary"
            size="md"
            style={{ flex: 1 }}
          />
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    marginBottom: 16,
    padding: 0,
    overflow: 'hidden',
    borderColor: '#1E293B',
    borderWidth: 1,
  },
  mapCanvas: {
    height: 256,
    backgroundColor: 'rgba(2,6,23,0.8)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  svgOverlay: {
    position: 'absolute',
    opacity: 0.15,
  },
  centerAnchor: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseOuter: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(20,184,166,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(20,184,166,0.5)',
  },
  pulseInner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(20,184,166,0.3)',
  },
  pulseDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#0D9488',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseDotInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
  },
  floatTagLeft: {
    position: 'absolute',
    top: 12,
    left: 12,
    backgroundColor: 'rgba(15,23,42,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1E293B',
    flexDirection: 'row',
    alignItems: 'center',
  },
  floatTagText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#E2E8F0',
  },
  floatTagRight: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(20,184,166,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(20,184,166,0.3)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  signalDot: {
    width: 6,
    height: 6,
    backgroundColor: '#14B8A6',
    borderRadius: 3,
    marginRight: 6,
  },
  signalText: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: '#2DD4BF',
  },
  detailsContainer: {
    padding: 16,
    backgroundColor: '#0F172A',
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  addressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  addressValue: {
    fontSize: 12,
    color: '#94A3B8',
    lineHeight: 16,
  },
  coordsValue: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
