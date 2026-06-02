import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { firebaseService } from '../../../services/firebase';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Phone, MessageSquare, Plus, Trash2, ChevronLeft, Heart, User } from 'lucide-react-native';
import { EmergencyContact } from '../../../types';
import { LinearGradient } from 'expo-linear-gradient';

export default function ContactsScreen() {
  const router = useRouter();
  const { user } = useAuthStore();

  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const fetchContacts = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      const fetched = await firebaseService.getEmergencyContacts(user.userId);
      // Sort by priority order
      setContacts(fetched.sort((a, b) => a.priorityOrder - b.priorityOrder));
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContacts();
  }, [user]);

  const handleAddContact = async () => {
    if (!name || !phone || !relationship) {
      Alert.alert('Required Fields', 'Please complete the contact form details.');
      return;
    }
    setIsSaving(true);
    try {
      if (user) {
        await firebaseService.saveEmergencyContact(user.userId, {
          userId: user.userId,
          name,
          phone,
          relationship,
          priorityOrder: contacts.length + 1
        });
        Alert.alert('Success', 'Responder saved successfully.');
        setName('');
        setPhone('');
        setRelationship('');
        fetchContacts();
      }
    } catch (err) {
      Alert.alert('Error', (err as Error).message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (contactId: string) => {
    Alert.alert(
      'Remove Contact',
      'Are you sure you want to delete this emergency responder?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Remove', 
          style: 'destructive',
          onPress: async () => {
            if (user) {
              await firebaseService.deleteEmergencyContact(user.userId, contactId);
              fetchContacts();
            }
          } 
        }
      ]
    );
  };

  // Trigger Phone Call via Native dialer
  const makePhoneCall = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    Linking.openURL(`tel:${cleanPhone}`).catch(() => {
      Alert.alert('Dialer Error', 'Could not open native telephone client.');
    });
  };

  // Trigger SMS via Native SMS composer
  const sendSMSMessage = (phoneNumber: string) => {
    const cleanPhone = phoneNumber.replace(/[^\d+]/g, '');
    Linking.openURL(`sms:${cleanPhone}`).catch(() => {
      Alert.alert('SMS Error', 'Could not open native text messaging composer.');
    });
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Back link */}
      <Pressable 
        onPress={() => router.replace('/(app)/(tabs)/settings')} 
        style={s.backBtn}
      >
        <ChevronLeft size={16} color="#94A3B8" />
        <Text style={s.backText}>Settings</Text>
      </Pressable>

      <View style={s.mb6}>
        <Text style={s.headerTitle}>Emergency Responders</Text>
        <Text style={s.headerSubtitle}>Configure priority alert broadcast targets</Text>
      </View>

      {/* Add Responder Form */}
      <Card style={s.formCard}>
        <View style={s.formHeader}>
          <Plus size={16} color="#2DD4BF" style={s.mr2} />
          <Text style={s.formTitle}>Add New Responder</Text>
        </View>

        <Input
          label="Responder Full Name"
          placeholder="Sarah Thompson"
          value={name}
          onChangeText={setName}
        />

        <Input
          label="Phone Number"
          placeholder="+1 (555) 987-6543"
          keyboardType="phone-pad"
          value={phone}
          onChangeText={setPhone}
        />

        <Input
          label="Relationship"
          placeholder="e.g. Daughter, Spouse, Neighbour"
          value={relationship}
          onChangeText={setRelationship}
        />

        <Button
          title="Save Responder"
          onPress={handleAddContact}
          isLoading={isSaving}
          variant="primary"
          size="md"
          style={s.saveBtn}
        />
      </Card>

      {/* Responders List */}
      <View style={s.mb6}>
        <Text style={s.sectionLabel}>Priority Alert Order</Text>
        
        {isLoading ? (
          <ActivityIndicator size="small" color="#0D9488" style={s.loader} />
        ) : contacts.length > 0 ? (
          contacts.map((contact, index) => (
            <Card key={contact.contactId} style={s.contactCard}>
              <View style={s.contactHeader}>
                <View style={s.row}>
                  <View style={s.priorityBadge}>
                    <Text style={s.priorityText}>{index + 1}</Text>
                  </View>
                  <View style={s.avatarBadge}>
                    <User size={16} color="#94A3B8" />
                  </View>
                  <View>
                    <Text style={s.contactName}>{contact.name}</Text>
                    <Text style={s.contactRelation}>{contact.relationship.toUpperCase()}</Text>
                    <Text style={s.contactPhone}>{contact.phone}</Text>
                  </View>
                </View>
                
                <Pressable onPress={() => handleDelete(contact.contactId)} style={s.deleteBtn}>
                  <Trash2 size={16} color="#F87171" />
                </Pressable>
              </View>

              {/* Direct call / sms shortcuts */}
              <View style={s.actionRow}>
                <Pressable 
                  onPress={() => makePhoneCall(contact.phone)}
                  style={[s.actionBtn, s.actionBtnCall]}
                >
                  <Phone size={13} color="#34D399" style={s.mr1p5} />
                  <Text style={[s.actionText, s.actionTextCall]}>Quick Call</Text>
                </Pressable>
                
                <Pressable 
                  onPress={() => sendSMSMessage(contact.phone)}
                  style={[s.actionBtn, s.actionBtnSms]}
                >
                  <MessageSquare size={13} color="#2DD4BF" style={s.mr1p5} />
                  <Text style={[s.actionText, s.actionTextSms]}>Quick SMS</Text>
                </Pressable>
              </View>
            </Card>
          ))
        ) : (
          <Card style={s.emptyCard}>
            <Heart size={32} color="#475569" style={s.mb3} />
            <Text style={s.emptyTitle}>No responders configured</Text>
            <Text style={s.emptySubtitle}>
              Register a contact helper above to configure automated alerts when fall events are detected.
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
  mr1p5: { marginRight: 6 },
  mr2: { marginRight: 8 },
  mb3: { marginBottom: 12 },
  mb6: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '900', color: '#FFFFFF', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  formCard: {
    backgroundColor: 'rgba(30,41,59,0.25)',
    borderColor: '#1E293B',
    marginBottom: 24,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: { fontSize: 13, fontWeight: '800', color: '#FFFFFF', textTransform: 'uppercase', letterSpacing: 0.5 },
  saveBtn: { width: '100%', marginTop: 8 },
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
  contactCard: {
    marginBottom: 12,
    backgroundColor: 'rgba(30,41,59,0.3)',
    borderColor: '#1E293B',
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: '#0D9488',
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  priorityBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: 'rgba(13,148,136,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  priorityText: { fontSize: 9, fontWeight: '900', color: '#2DD4BF' },
  avatarBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  contactName: { fontSize: 15, fontWeight: '800', color: '#FFFFFF' },
  contactRelation: { fontSize: 9, color: '#94A3B8', fontWeight: '800', marginTop: 2, letterSpacing: 0.5 },
  contactPhone: { fontSize: 12, color: '#64748B', marginTop: 2 },
  deleteBtn: { padding: 6, backgroundColor: 'rgba(239,68,68,0.06)', borderRadius: 8 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,41,59,0.4)',
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  actionBtnCall: {
    backgroundColor: 'rgba(52,211,153,0.05)',
    borderColor: 'rgba(52,211,153,0.15)',
  },
  actionBtnSms: {
    backgroundColor: 'rgba(45,212,191,0.05)',
    borderColor: 'rgba(45,212,191,0.15)',
  },
  actionText: { fontSize: 12, fontWeight: '800' },
  actionTextCall: { color: '#34D399' },
  actionTextSms: { color: '#2DD4BF' },
  emptyCard: { alignItems: 'center', paddingVertical: 32, backgroundColor: 'rgba(30,41,59,0.15)' },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#E2E8F0', marginBottom: 4 },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
});
