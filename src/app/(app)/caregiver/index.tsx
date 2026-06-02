import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, StyleSheet } from 'react-native';
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Back button */}
      <Pressable 
        onPress={() => router.replace('/(app)/(tabs)/settings')} 
        style={s.backBtn}
      >
        <ChevronLeft size={20} color="#94A3B8" style={s.mr1} />
        <Text style={s.backText}>Settings</Text>
      </Pressable>

      <View style={s.mb6}>
        <Text style={s.headerTitle}>Caregiver Hub</Text>
        <Text style={s.headerSubtitle}>Manage and track monitored elderly profiles</Text>
      </View>

      {/* Link New Profile */}
      <Card style={s.mb6}>
        <View style={s.linkHeader}>
          <Link size={18} color="#0D9488" style={s.mr2} />
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
            return (
              <Pressable
                key={rel.relationId}
                onPress={() => handleSelectElderly(rel)}
                style={[
                  s.profileCard,
                  isCurrentlySelected ? s.profileCardActive : s.profileCardDefault,
                ]}
              >
                <View style={s.row}>
                  <View style={s.profileIconBg}>
                    <User size={20} color="#94A3B8" />
                  </View>
                  <View>
                    <Text style={s.profileName}>{rel.elderlyName}</Text>
                    <Text style={s.profileStatus}>
                      {isCurrentlySelected ? 'ACTIVE TRACKING' : 'CLICK TO MONITOR'}
                    </Text>
                  </View>
                </View>
                <ChevronRight size={18} color="#94A3B8" />
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
    marginBottom: 16,
    alignSelf: 'flex-start',
  },
  backText: { fontSize: 14, fontWeight: '600', color: '#94A3B8' },
  mr1: { marginRight: 4 },
  mr2: { marginRight: 8 },
  mb6: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  linkTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  connectBtn: { width: '100%', marginTop: 8 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginLeft: 4,
  },
  loader: { marginVertical: 24 },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderRadius: 16,
    marginBottom: 12,
  },
  profileCardDefault: { borderColor: '#334155' },
  profileCardActive: { borderColor: '#0D9488', backgroundColor: 'rgba(13,148,136,0.05)' },
  profileIconBg: {
    padding: 10,
    backgroundColor: 'rgba(30,41,59,0.8)',
    borderRadius: 12,
    marginRight: 12,
  },
  profileName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  profileStatus: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  emptyCard: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#CBD5E1', marginBottom: 4 },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 18,
  },
});
