import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, ActivityIndicator, Linking } from 'react-native';
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* Back link */}
      <Pressable 
        onPress={() => router.replace('/(app)/(tabs)/settings')} 
        className="flex-row items-center mb-4 self-start"
      >
        <ChevronLeft size={20} className="text-slate-400 mr-1" />
        <Text className="text-sm font-semibold text-slate-400">Settings</Text>
      </Pressable>

      <View className="mb-6">
        <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">Emergency Contacts</Text>
        <Text className="text-sm text-slate-400 dark:text-slate-500 mt-1">Configure priorities and quick-response hotkeys</Text>
      </View>

      {/* Add Responder Form */}
      <Card className="mb-6">
        <View className="flex-row items-center mb-4">
          <Plus size={18} className="text-teal-600 dark:text-teal-400 mr-2" />
          <Text className="text-sm font-bold text-slate-800 dark:text-white">Add New Responder</Text>
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
          className="w-full mt-2"
        />
      </Card>

      {/* Responders List */}
      <View className="mb-6">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 ml-1">Priority Order List</Text>
        
        {isLoading ? (
          <ActivityIndicator size="small" color="#0D9488" className="my-6" />
        ) : contacts.length > 0 ? (
          contacts.map((contact, index) => (
            <Card key={contact.contactId} className="mb-3 border-slate-100 dark:border-slate-800/80 p-4">
              <View className="flex-row items-start justify-between mb-3">
                <View className="flex-row items-center">
                  <View className="w-6 h-6 rounded-full bg-teal-500/10 border border-teal-500/20 items-center justify-center mr-2.5">
                    <Text className="text-xxs font-extrabold text-teal-600 dark:text-teal-400">{index + 1}</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-bold text-slate-800 dark:text-white">{contact.name}</Text>
                    <Text className="text-xxs text-slate-400 dark:text-slate-500 font-semibold">{contact.relationship}</Text>
                    <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{contact.phone}</Text>
                  </View>
                </View>
                
                <Pressable onPress={() => handleDelete(contact.contactId)} className="p-2">
                  <Trash2 size={16} className="text-red-400 active:text-red-500" />
                </Pressable>
              </View>

              {/* Direct call / sms shortcuts */}
              <View className="flex-row gap-2.5 border-t border-slate-50 dark:border-slate-850 pt-3">
                <Pressable 
                  onPress={() => makePhoneCall(contact.phone)}
                  className="flex-1 py-2 bg-slate-100 active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700 rounded-xl flex-row items-center justify-center"
                >
                  <Phone size={14} className="text-slate-600 dark:text-slate-300 mr-1.5" />
                  <Text className="text-xs font-bold text-slate-600 dark:text-slate-350">Quick Call</Text>
                </Pressable>
                
                <Pressable 
                  onPress={() => sendSMSMessage(contact.phone)}
                  className="flex-1 py-2 bg-slate-100 active:bg-slate-200 dark:bg-slate-800 dark:active:bg-slate-700 rounded-xl flex-row items-center justify-center"
                >
                  <MessageSquare size={14} className="text-slate-600 dark:text-slate-300 mr-1.5" />
                  <Text className="text-xs font-bold text-slate-600 dark:text-slate-350">Quick SMS</Text>
                </Pressable>
              </View>
            </Card>
          ))
        ) : (
          <Card className="items-center py-8">
            <Heart size={38} className="text-slate-300 dark:text-slate-600 mb-3" />
            <Text className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-1">No emergency contacts listed</Text>
            <Text className="text-xs text-slate-400 dark:text-slate-500 text-center px-6 leading-4.5">
              Fill in the responder details above to configure who should be alerted when fall incidents occur.
            </Text>
          </Card>
        )}
      </View>

    </ScrollView>
  );
}
