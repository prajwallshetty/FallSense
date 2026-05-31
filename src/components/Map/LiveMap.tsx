import React from 'react';
import { View, Text, Linking, Platform } from 'react-native';
import Svg, { Circle, Path, Marker, Line } from 'react-native-svg';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { MapPin, Navigation, Map as MapIcon, History } from 'lucide-react-native';

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
  };

  return (
    <Card className="mb-4 overflow-hidden p-0 border-slate-100 dark:border-slate-800">
      
      {/* Visual Map Canvas Mockup */}
      <View className="h-64 bg-teal-50/40 dark:bg-slate-950/80 items-center justify-center relative overflow-hidden">
        
        {/* Background Map Contours (SVG) */}
        <Svg width="100%" height="100%" className="absolute opacity-20 dark:opacity-10">
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
          <Svg width="100%" height="100%" className="absolute">
            {/* Draw lines linking history */}
            <Line x1="100" y1="180" x2="160" y2="120" stroke="#EF4444" strokeWidth={1.5} strokeDasharray="4 4" />
            <Line x1="160" y1="120" x2="200" y2="128" stroke="#0D9488" strokeWidth={2} />
            
            {/* History Marker Dots */}
            <Circle cx="100" cy="180" r="5" fill="#94A3B8" />
            <Circle cx="160" cy="120" r="5" fill="#94A3B8" />
          </Svg>
        )}

        {/* Live Patient Pulse Anchor */}
        <View className="absolute items-center justify-center">
          {/* Animated pulse ring */}
          <View className="absolute w-12 h-12 rounded-full bg-teal-500/20 animate-ping border border-teal-500/50" />
          <View className="absolute w-6 h-6 rounded-full bg-teal-500/30" />
          
          <View className="w-4 h-4 rounded-full bg-teal-600 border-2 border-white items-center justify-center shadow-md">
            <View className="w-1.5 h-1.5 rounded-full bg-white" />
          </View>
        </View>

        {/* Float Map Icon Tag */}
        <View className="absolute top-3 left-3 bg-white/95 dark:bg-slate-900/95 px-3 py-1.5 rounded-full border border-slate-100 dark:border-slate-800 flex-row items-center shadow-sm">
          <MapIcon size={14} className="text-teal-600 mr-1.5" />
          <Text className="text-xxs font-extrabold uppercase tracking-wide text-slate-700 dark:text-slate-200">
            GPS Live Monitor
          </Text>
        </View>
        
        {/* Battery warning or signal indicator float right */}
        <View className="absolute top-3 right-3 bg-teal-500/10 dark:bg-teal-500/20 px-3 py-1.5 rounded-full border border-teal-500/20 flex-row items-center">
          <View className="w-1.5 h-1.5 bg-teal-500 rounded-full mr-1.5" />
          <Text className="text-xxs font-extrabold uppercase tracking-wide text-teal-600 dark:text-teal-400">
            Signal Locked
          </Text>
        </View>
      </View>

      {/* Address & Navigation Details */}
      <View className="p-4 bg-white dark:bg-slate-900">
        <View className="flex-row items-start mb-4">
          <MapPin size={22} className="text-red-500 mr-2.5 mt-0.5" />
          <View className="flex-1">
            <Text className="text-sm font-bold text-slate-800 dark:text-white mb-0.5">
              Current Registered Location
            </Text>
            <Text className="text-xs text-slate-500 dark:text-slate-400 leading-4">
              {address}
            </Text>
            <Text className="text-xxs text-slate-400 dark:text-slate-500 mt-1 font-semibold">
              Lat: {latitude.toFixed(6)}, Lng: {longitude.toFixed(6)}
            </Text>
          </View>
        </View>

        {/* Buttons */}
        <View className="flex-row gap-3">
          <Button
            title="Dispatch Navigation"
            onPress={openExternalNavigation}
            variant="primary"
            size="md"
            className="flex-1"
          />
        </View>
      </View>
    </Card>
  );
};
