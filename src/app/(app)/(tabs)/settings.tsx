import React from 'react';
import { View, Text, ScrollView, Pressable, Alert, Share } from 'react-native';
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
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} className="bg-slate-50 dark:bg-slate-950 px-5 pt-14 pb-10">
      
      {/* Header */}
      <View className="mb-6">
        <Text className="text-xxs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Preferences
        </Text>
        <Text className="text-2xl font-extrabold text-slate-800 dark:text-white">
          Settings Console
        </Text>
      </View>

      {/* Profile Overview Card */}
      <Card className="mb-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center">
            <View className="p-3 bg-teal-500/10 rounded-2xl mr-3.5">
              <User size={24} className="text-teal-600 dark:text-teal-400" />
            </View>
            <View>
              <Text className="text-base font-bold text-slate-800 dark:text-white">{user?.fullName}</Text>
              <Text className="text-xs text-slate-400 dark:text-slate-500">{user?.email}</Text>
              <Text className="text-xxs font-extrabold text-teal-600 dark:text-teal-400 uppercase tracking-widest mt-0.5">{user?.role}</Text>
            </View>
          </View>
        </View>
      </Card>

      {/* Core Configurations list */}
      <View className="mb-6">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Application Features</Text>
        
        <Card className="p-0 border-slate-100 dark:border-slate-800/80 overflow-hidden">
          {/* Emergency contacts settings */}
          <Pressable 
            onPress={() => router.push('/contacts')}
            className="flex-row items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 active:bg-slate-50 dark:active:bg-slate-800/50"
          >
            <View className="flex-row items-center">
              <Users size={18} className="text-slate-600 dark:text-slate-400 mr-3" />
              <Text className="text-sm font-bold text-slate-800 dark:text-white">Emergency Responders</Text>
            </View>
            <ChevronRight size={16} className="text-slate-400" />
          </Pressable>

          {/* Caregiver Portal (Visible to all or conditional) */}
          <Pressable 
            onPress={() => router.push('/caregiver')}
            className="flex-row items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800 active:bg-slate-50 dark:active:bg-slate-800/50"
          >
            <View className="flex-row items-center">
              <UserCog size={18} className="text-slate-600 dark:text-slate-400 mr-3" />
              <Text className="text-sm font-bold text-slate-800 dark:text-white">Caregiver Dashboard</Text>
            </View>
            <ChevronRight size={16} className="text-slate-400" />
          </Pressable>

          {/* Admin Dashboard */}
          <Pressable 
            onPress={() => router.push('/admin')}
            className="flex-row items-center justify-between p-4 active:bg-slate-50 dark:active:bg-slate-800/50"
          >
            <View className="flex-row items-center">
              <ShieldCheck size={18} className="text-slate-600 dark:text-slate-400 mr-3" />
              <Text className="text-sm font-bold text-slate-800 dark:text-white">Admin Analytics Hub</Text>
            </View>
            <ChevronRight size={16} className="text-slate-400" />
          </Pressable>
        </Card>
      </View>

      {/* System Preferences */}
      <View className="mb-6">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">System Preferences</Text>
        
        <Card className="p-0 border-slate-100 dark:border-slate-800/80 overflow-hidden">
          
          <Pressable className="flex-row items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center">
              <Bell size={18} className="text-slate-600 dark:text-slate-400 mr-3" />
              <Text className="text-sm font-bold text-slate-800 dark:text-white">Alert Preferences</Text>
            </View>
            <Text className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase mr-1">SMS & Push</Text>
          </Pressable>

          <Pressable className="flex-row items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
            <View className="flex-row items-center">
              <Languages size={18} className="text-slate-600 dark:text-slate-400 mr-3" />
              <Text className="text-sm font-bold text-slate-800 dark:text-white">Language Selection</Text>
            </View>
            <Text className="text-xs text-slate-400 dark:text-slate-500 font-bold uppercase mr-1">English (US)</Text>
          </Pressable>

          <Pressable 
            onPress={handleDataExport}
            className="flex-row items-center justify-between p-4"
          >
            <View className="flex-row items-center">
              <Download size={18} className="text-slate-600 dark:text-slate-400 mr-3" />
              <Text className="text-sm font-bold text-slate-800 dark:text-white">Data Privacy Archives</Text>
            </View>
            <ChevronRight size={16} className="text-slate-400" />
          </Pressable>
        </Card>
      </View>

      {/* Privacy and Policies links */}
      <View className="mb-8">
        <Text className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 ml-1">Privacy & Support</Text>
        <Card className="p-0 border-slate-100 dark:border-slate-800/80 overflow-hidden">
          <Pressable 
            onPress={() => Alert.alert('Privacy Policy', 'Full medical HIPAA data safety terms and conditions.')}
            className="flex-row items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800"
          >
            <View className="flex-row items-center">
              <FileText size={18} className="text-slate-600 dark:text-slate-400 mr-3" />
              <Text className="text-sm font-bold text-slate-700 dark:text-slate-300">Privacy Policy terms</Text>
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
        className="w-full mb-10"
      />

    </ScrollView>
  );
}
