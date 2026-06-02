import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { firebaseService } from '../../../services/firebase';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { User, ChevronRight, Link, ChevronLeft } from 'lucide-react-native';
import { CaregiverRelation } from '../../../types';
import { LinearGradient } from 'expo-linear-gradient';

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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Back button */}
      <Pressable 
        onPress={() => router.replace('/(app)/(tabs)/settings')} 
        style={s.backBtn}
      >
        <ChevronLeft size={16} color="#94A3B8" />
        <Text style={s.backText}>Settings</Text>
      </Pressable>

      <View style={s.mb6}>
        <Text style={s.headerTitle}>Caregiver Hub</Text>
        <Text style={s.headerSubtitle}>Manage and track monitored elderly profiles</Text>
      </View>

      {/* Link New Profile */}
      <Card style={s.formCard}>
        <View style={s.linkHeader}>
          <Link size={16} color="#2DD4BF" style={s.mr2} />
          <Text style={s.linkTitle}>Link Elderly Profile</Text>
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
          style={s.connectBtn}
        />
      </Card>

      {/* Monitored Profiles List */}
      <View style={s.mb6}>
        <Text style={s.sectionLabel}>Monitored Profiles</Text>
        
        {isLoading ? (
          <ActivityIndicator size="small" color="#0D9488" style={s.loader} />
        ) : caregiverRelations.length > 0 ? (
          caregiverRelations.map((rel) => {
            const isCurrentlySelected = activeElderlyProfile?.userId === rel.elderlyId;
            const cardContent = (
              <>
                <View style={s.row}>
                  <View style={[s.profileIconBg, isCurrentlySelected ? s.profileIconBgActive : null]}>
                    <User size={18} color={isCurrentlySelected ? '#2DD4BF' : '#94A3B8'} />
                  </View>
                  <View>
                    <Text style={s.profileName}>{rel.elderlyName}</Text>
                    <Text style={[s.profileStatus, isCurrentlySelected ? s.profileStatusActive : null]}>
                      {isCurrentlySelected ? 'ACTIVE TRACKING' : 'CLICK TO MONITOR'}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={16} color={isCurrentlySelected ? '#2DD4BF' : '#64748B'} />
              </>
            );

            if (isCurrentlySelected) {
              return (
                <Pressable key={rel.relationId} onPress={() => handleSelectElderly(rel)}>
                  <LinearGradient
                    colors={['rgba(13,148,136,0.15)', 'rgba(15,23,42,0.45)']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[s.profileCard, s.profileCardActive]}
                  >
                    {cardContent}
                  </LinearGradient>
                </Pressable>
              );
            }

            return (
              <Pressable
                key={rel.relationId}
                onPress={() => handleSelectElderly(rel)}
                style={[s.profileCard, s.profileCardDefault]}
              >
                {cardContent}
              </Pressable>
            );
          })
        ) : (
          <Card style={s.emptyCard}>
            <Text style={s.emptyTitle}>No profiles linked yet</Text>
            <Text style={s.emptySubtitle}>
              Enter the patient's registered email address above to link their smartwatch data with your console.
            </Text>
          </Card>
        )}
      </View>

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
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(30,41,59,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#1E293B',
    gap: 4,
  },
  backText: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  mr1: { marginRight: 4 },
  mr2: { marginRight: 8 },
  mb6: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  formCard: {
    backgroundColor: 'rgba(30,41,59,0.25)',
    borderColor: '#1E293B',
    marginBottom: 24,
  },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  linkTitle: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
  connectBtn: { width: '100%', marginTop: 8 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
    marginLeft: 4,
  },
  loader: { marginVertical: 24 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 20,
    marginBottom: 12,
    borderWidth: 1,
  },
  profileCardDefault: { 
    borderColor: '#1E293B',
    backgroundColor: 'rgba(30,41,59,0.3)',
  },
  profileCardActive: { 
    borderColor: '#0D9488',
  },
  profileIconBg: {
    padding: 10,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  profileIconBgActive: {
    backgroundColor: 'rgba(13,148,136,0.15)',
    borderColor: 'rgba(45,212,191,0.25)',
  },
  profileName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  profileStatus: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '800',
    textTransform: 'uppercase',
    marginTop: 3,
    letterSpacing: 0.5,
  },
  profileStatusActive: {
    color: '#2DD4BF',
  },
  emptyCard: { alignItems: 'center', paddingVertical: 32, backgroundColor: 'rgba(30,41,59,0.15)' },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#CBD5E1', marginBottom: 4 },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 18,
  },
});
