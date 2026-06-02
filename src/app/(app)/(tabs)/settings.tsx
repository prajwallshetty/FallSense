import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, Share, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '../../../store/authStore';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { 
  User, 
  Users, 
  Settings2, 
  LogOut, 
  ChevronRight, 
  Bell, 
  ShieldCheck, 
  Languages, 
  FileText, 
  Download, 
  UserCog 
} from 'lucide-react-native';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of SafeFall AI?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Sign Out', 
          style: 'destructive',
          onPress: async () => {
            await logout();
            router.replace('/(auth)/login');
          } 
        }
      ]
    );
  };

  const handleDataExport = () => {
    Alert.alert('Data Privacy Export', 'We are preparing your health telemetry archives. This will download a package containing all steps and fall coordinates logs in JSON format.', [
      { text: 'Cancel' },
      { text: 'Download', onPress: () => Alert.alert('Download Started', 'Archived file is saving to your local documents directory.') }
    ]);
  };

  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} style={s.scrollView}>
      
      {/* Header */}
      <View style={s.headerContainer}>
        <Text style={s.headerLabel}>
          Preferences
        </Text>
        <Text style={s.headerTitle}>
          Settings Console
        </Text>
      </View>

      {/* Profile Overview Card */}
      <Card style={s.mb4}>
        <View style={s.profileRow}>
          <View style={s.row}>
            <View style={s.profileIconBg}>
              <User size={24} color="#0D9488" />
            </View>
            <View>
              <Text style={s.profileName}>{user?.fullName}</Text>
              <Text style={s.profileEmail}>{user?.email}</Text>
              <Text style={s.profileRole}>{user?.role}</Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Core Configurations list */}
      <View style={s.mb6}>
        <Text style={s.sectionLabel}>Application Features</Text>
        
        <Card style={s.menuCard}>
          {/* Emergency contacts settings */}
          <Pressable 
            onPress={() => router.push('/contacts')}
            style={s.menuItemBorder}
          >
            <View style={s.row}>
              <Users size={18} color="#94A3B8" style={s.mr3} />
              <Text style={s.menuItemText}>Emergency Responders</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </Pressable>

          {/* Caregiver Portal (Visible to all or conditional) */}
          <Pressable 
            onPress={() => router.push('/caregiver')}
            style={s.menuItemBorder}
          >
            <View style={s.row}>
              <UserCog size={18} color="#94A3B8" style={s.mr3} />
              <Text style={s.menuItemText}>Caregiver Dashboard</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </Pressable>

          {/* Admin Dashboard */}
          <Pressable 
            onPress={() => router.push('/admin')}
            style={s.menuItemLast}
          >
            <View style={s.row}>
              <ShieldCheck size={18} color="#94A3B8" style={s.mr3} />
              <Text style={s.menuItemText}>Admin Analytics Hub</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </Pressable>
        </Card>
      </View>

      {/* System Preferences */}
      <View style={s.mb6}>
        <Text style={s.sectionLabel}>System Preferences</Text>
        
        <Card style={s.menuCard}>
          
          <Pressable style={s.menuItemBorder}>
            <View style={s.row}>
              <Bell size={18} color="#94A3B8" style={s.mr3} />
              <Text style={s.menuItemText}>Alert Preferences</Text>
            </View>
            <Text style={s.menuItemValue}>SMS & Push</Text>
          </Pressable>

          <Pressable style={s.menuItemBorder}>
            <View style={s.row}>
              <Languages size={18} color="#94A3B8" style={s.mr3} />
              <Text style={s.menuItemText}>Language Selection</Text>
            </View>
            <Text style={s.menuItemValue}>English (US)</Text>
          </Pressable>

          <Pressable 
            onPress={handleDataExport}
            style={s.menuItemLast}
          >
            <View style={s.row}>
              <Download size={18} color="#94A3B8" style={s.mr3} />
              <Text style={s.menuItemText}>Data Privacy Archives</Text>
            </View>
            <ChevronRight size={16} color="#94A3B8" />
          </Pressable>
        </Card>
      </View>

      {/* Privacy and Policies links */}
      <View style={s.mb8}>
        <Text style={s.sectionLabel}>Privacy & Support</Text>
        <Card style={s.menuCard}>
          <Pressable 
            onPress={() => Alert.alert('Privacy Policy', 'Full medical HIPAA data safety terms and conditions.')}
            style={s.menuItemLast}
          >
            <View style={s.row}>
              <FileText size={18} color="#94A3B8" style={s.mr3} />
              <Text style={s.menuItemTextLight}>Privacy Policy terms</Text>
            </View>
          </Pressable>
        </Card>
      </View>

      {/* Logout button */}
      <Button
        title="Sign Out Account"
        onPress={handleLogout}
        variant="danger"
        size="lg"
        style={s.logoutBtn}
      />

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
  headerContainer: { marginBottom: 24 },
  headerLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    color: '#64748B',
  },
  headerTitle: { fontSize: 24, fontWeight: '800', color: '#FFFFFF' },
  mb4: { marginBottom: 16 },
  mb6: { marginBottom: 24 },
  mb8: { marginBottom: 32 },
  mr3: { marginRight: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileIconBg: {
    padding: 12,
    backgroundColor: 'rgba(13,148,136,0.1)',
    borderRadius: 16,
    marginRight: 14,
  },
  profileName: { fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  profileEmail: { fontSize: 12, color: '#64748B' },
  profileRole: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0D9488',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginTop: 2,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 4,
  },
  menuCard: {
    padding: 0,
    borderColor: '#1E293B',
    overflow: 'hidden',
  },
  menuItemBorder: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
  },
  menuItemLast: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  menuItemText: { fontSize: 14, fontWeight: '700', color: '#FFFFFF' },
  menuItemTextLight: { fontSize: 14, fontWeight: '700', color: '#CBD5E1' },
  menuItemValue: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    marginRight: 4,
  },
  logoutBtn: { width: '100%', marginBottom: 40 },
});
