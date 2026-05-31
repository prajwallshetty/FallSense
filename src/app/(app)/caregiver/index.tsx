import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { firebaseService } from '../../../services/firebase';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { User, Plus, ChevronRight, Activity, Link, ChevronLeft } from 'lucide-react-native';
import { CaregiverRelation } from '../../../types';

export default function CaregiverScreen() {
  const router = useRouter();
  const { user, caregiverRelations, setCaregiverRelations, setActiveElderlyProfile, activeElderlyProfile } = useAuthStore();

  const [email, setEmail] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRelations = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const relations = await firebaseService.getCaregiverRelations(user.userId);
      setCaregiverRelations(relations);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRelations();
  }, [user]);

  const handleLinkElderly = async () => {
    if (!email) {
      Alert.alert('Required field', 'Please input the email address of the patient.');
      return;
    }
    setIsLinking(true);
    try {
      if (user) {
        const newRel = await firebaseService.linkCaregiver(user.userId, email);
        Alert.alert('Profile Linked', `You are now monitoring ${newRel.elderlyName}.`);
        setEmail('');
        fetchRelations();
      }
    } catch (err) {
      Alert.alert('Link Failed', (err as Error).message);
    } finally {
      setIsLinking(false);
    }
  };

  const handleSelectElderly = async (relation: CaregiverRelation) => {
    try {
      const profile = await firebaseService.getProfile(relation.elderlyId);
      if (profile) {
        setActiveElderlyProfile(profile);
        Alert.alert('Patient Switched', `Dashboard is now tracking ${profile.fullName}.`, [
          { text: 'View Dashboard', onPress: () => router.replace('/(app)/(tabs)') }
        ]);
      }
    } catch (err) {
      Alert.alert('Error Switch', 'Failed to retrieve patient profile.');
    }
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* Back button */}
      <Pressable 
        onPress={() => router.replace('/(app)/(tabs)/settings')} 
        className="flex-row items-center mb-4 self-start"
      >
        <ChevronLeft size={20} className="text-slate-400 mr-1" />
        <Text className="text-sm font-semibold text-slate-400">Settings</Text>
      </Pressable>

      <View className="mb-6">
        <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">Caregiver Hub</Text>
        <Text className="text-sm text-slate-400 dark:text-slate-500 mt-1">Manage and track monitored elderly profiles</Text>
      </View>

      {/* Link New Profile */}
      <Card className="mb-6">
        <View className="flex-row items-center mb-4">
          <Link size={18} className="text-teal-600 dark:text-teal-400 mr-2" />
          <Text className="text-sm font-bold text-slate-800 dark:text-white">Link Elderly Profile</Text>
        </View>

        <Input
          label="Patient Registered Email"
          placeholder="elderly@safefall.ai"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Button
          title="Connect Patient"
          onPress={handleLinkElderly}
          isLoading={isLinking}
          variant="primary"
          size="md"
          className="w-full mt-2"
        />
      </Card>

      {/* Monitored Profiles List */}
      <View className="mb-6">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Monitored Profiles</Text>
        
        {isLoading ? (
          <ActivityIndicator size="small" color="#0D9488" className="my-6" />
        ) : caregiverRelations.length > 0 ? (
          caregiverRelations.map((rel) => {
            const isCurrentlySelected = activeElderlyProfile?.userId === rel.elderlyId;
            return (
              <Pressable
                key={rel.relationId}
                onPress={() => handleSelectElderly(rel)}
                className={`flex-row items-center justify-between p-4 bg-white dark:bg-slate-900 border rounded-2xl mb-3 shadow-sm ${
                  isCurrentlySelected ? 'border-teal-500 bg-teal-50/10' : 'border-slate-100 dark:border-slate-800'
                }`}
              >
                <View className="flex-row items-center">
                  <View className="p-2.5 bg-slate-100 dark:bg-slate-850 rounded-xl mr-3">
                    <User size={20} className="text-slate-600 dark:text-slate-400" />
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-800 dark:text-white">{rel.elderlyName}</Text>
                    <Text className="text-xxs text-slate-400 font-bold uppercase mt-0.5">
                      {isCurrentlySelected ? 'ACTIVE TRACKING' : 'CLICK TO MONITOR'}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} className="text-slate-400" />
              </Pressable>
            );
          })
        ) : (
          <Card className="items-center py-8">
            <Text className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">No profiles linked yet</Text>
            <Text className="text-xs text-slate-400 dark:text-slate-500 text-center px-4 leading-4.5">
              Enter the patient's registered email address above to link their smartwatch data with your console.
            </Text>
          </Card>
        )}
      </View>

    </ScrollView>
  );
}
