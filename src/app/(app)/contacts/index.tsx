import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, Linking, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { firebaseService } from '../../../services/firebase';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Phone, MessageSquare, Plus, Trash2, ChevronLeft, Heart } from 'lucide-react-native';
import { EmergencyContact } from '../../../types';

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
        <ChevronLeft size={20} color="#94A3B8" style={s.mr1} />
        <Text style={s.backText}>Settings</Text>
      </Pressable>

      <View style={s.mb6}>
        <Text style={s.headerTitle}>Emergency Contacts</Text>
        <Text style={s.headerSubtitle}>Configure priorities and quick-response hotkeys</Text>
      </View>

      {/* Add Responder Form */}
      <Card style={s.mb6}>
        <View style={s.formHeader}>
          <Plus size={18} color="#0D9488" style={s.mr2} />
          <Text style={s.formTitle}>Add New Responder</Text>
        </View>

        <Input
          label="Responder Full Name"
          placeholder="e.g. Sarah Thompson"
          value={name}
          onChangeText={setName}
        />

        <Input
          label="Phone Number"
          placeholder="e.g. +1 (555) 987-6543"
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
        <Text style={s.sectionLabel}>Priority Order List</Text>
        
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
                  <View>
                    <Text style={s.contactName}>{contact.name}</Text>
                    <Text style={s.contactRelation}>{contact.relationship}</Text>
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
                  style={s.actionBtn}
                >
                  <Phone size={14} color="#CBD5E1" style={s.mr1p5} />
                  <Text style={s.actionText}>Quick Call</Text>
                </Pressable>
                
                <Pressable 
                  onPress={() => sendSMSMessage(contact.phone)}
                  style={s.actionBtn}
                >
                  <MessageSquare size={14} color="#CBD5E1" style={s.mr1p5} />
                  <Text style={s.actionText}>Quick SMS</Text>
                </Pressable>
              </View>
            </Card>
          ))
        ) : (
          <Card style={s.emptyCard}>
            <Heart size={38} color="#475569" style={s.mb3} />
            <Text style={s.emptyTitle}>No emergency contacts listed</Text>
            <Text style={s.emptySubtitle}>
              Fill in the responder details above to configure who should be alerted when fall incidents occur.
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
  mr1p5: { marginRight: 6 },
  mr2: { marginRight: 8 },
  mb3: { marginBottom: 12 },
  mb6: { marginBottom: 24 },
  row: { flexDirection: 'row', alignItems: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  headerSubtitle: { fontSize: 14, color: '#64748B', marginTop: 4 },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  formTitle: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  saveBtn: { width: '100%', marginTop: 8 },
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
  contactCard: {
    marginBottom: 12,
    borderColor: '#1E293B',
    padding: 16,
  },
  contactHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  priorityBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(13,148,136,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(13,148,136,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  priorityText: { fontSize: 10, fontWeight: '800', color: '#0D9488' },
  contactName: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  contactRelation: { fontSize: 10, color: '#64748B', fontWeight: '600' },
  contactPhone: { fontSize: 12, color: '#94A3B8', marginTop: 2 },
  deleteBtn: { padding: 8 },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(30,41,59,0.5)',
    paddingTop: 12,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 8,
    backgroundColor: '#1E293B',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionText: { fontSize: 12, fontWeight: '700', color: '#CBD5E1' },
  emptyCard: { alignItems: 'center', paddingVertical: 32 },
  emptyTitle: { fontSize: 14, fontWeight: '700', color: '#CBD5E1', marginBottom: 4 },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
});
