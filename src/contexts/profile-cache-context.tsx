"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";

interface ProfileData {
  userId: number;
  screenName: string;
  name: string;
  profileImageUrl?: string;
  headline?: string;
  profileUrl?: string;
}

interface ProfileCacheContextType {
  getProfile: (screenName: string) => ProfileData | undefined;
  getProfileByUrl: (url: string) => ProfileData | undefined;
  getProfileByUserId: (userId: number) => ProfileData | undefined;
  addProfiles: (profiles: ProfileData[]) => void;
  getProfileImageUrl: (screenName: string) => string | undefined;
}

const ProfileCacheContext = createContext<ProfileCacheContextType | null>(null);

export function ProfileCacheProvider({ children }: { children: ReactNode }) {
  const [profilesByScreenName, setProfilesByScreenName] = useState<
    Map<string, ProfileData>
  >(new Map());
  const [profilesByUrl, setProfilesByUrl] = useState<Map<string, ProfileData>>(
    new Map()
  );
  const [profilesByUserId, setProfilesByUserId] = useState<
    Map<number, ProfileData>
  >(new Map());

  const getProfile = useCallback(
    (screenName: string): ProfileData | undefined => {
      return profilesByScreenName.get(screenName.toLowerCase());
    },
    [profilesByScreenName]
  );

  const getProfileByUserId = useCallback(
    (userId: number): ProfileData | undefined => {
      return profilesByUserId.get(userId);
    },
    [profilesByUserId]
  );

  const getProfileByUrl = useCallback(
    (url: string): ProfileData | undefined => {
      return profilesByUrl.get(url);
    },
    [profilesByUrl]
  );

  const addProfiles = useCallback((profiles: ProfileData[]) => {
    if (!Array.isArray(profiles) || profiles.length === 0) return;

    setProfilesByScreenName((prev) => {
      const next = new Map(prev);
      for (const profile of profiles) {
        if (profile.screenName) {
          next.set(profile.screenName.toLowerCase(), profile);
        }
      }
      return next;
    });

    setProfilesByUrl((prev) => {
      const next = new Map(prev);
      for (const profile of profiles) {
        if (profile.profileUrl) {
          next.set(profile.profileUrl, profile);
        }
      }
      return next;
    });

    setProfilesByUserId((prev) => {
      const next = new Map(prev);
      for (const profile of profiles) {
        const userId = Number(profile.userId);
        if (Number.isFinite(userId) && userId > 0) {
          next.set(userId, {
            ...profile,
            userId,
          });
        }
      }
      return next;
    });
  }, []);

  const getProfileImageUrl = useCallback(
    (screenName: string): string | undefined => {
      const profile = profilesByScreenName.get(screenName.toLowerCase());
      return profile?.profileImageUrl;
    },
    [profilesByScreenName]
  );

  return (
    <ProfileCacheContext.Provider
      value={{
        getProfile,
        getProfileByUrl,
        getProfileByUserId,
        addProfiles,
        getProfileImageUrl,
      }}
    >
      {children}
    </ProfileCacheContext.Provider>
  );
}

export function useProfileCache() {
  const context = useContext(ProfileCacheContext);
  if (!context) {
    throw new Error(
      "useProfileCache must be used within a ProfileCacheProvider"
    );
  }
  return context;
}
