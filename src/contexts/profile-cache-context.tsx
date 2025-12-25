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
  linkedinUrl?: string;
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
      // Try exact match first
      const exact = profilesByUrl.get(url);
      if (exact) return exact;

      // Try to extract identifiers from the URL and search
      // LinkedIn URL: extract the profile slug
      const linkedinMatch = url.match(/linkedin\.com\/in\/([^/?]+)/);
      if (linkedinMatch) {
        const slug = linkedinMatch[1];
        // Search through all cached profiles for matching LinkedIn URL
        for (const profile of profilesByUrl.values()) {
          if (profile.linkedinUrl?.includes(slug)) {
            return profile;
          }
        }
      }

      // Twitter/X URL: extract screen name
      const twitterMatch = url.match(/(?:x\.com|twitter\.com)\/([^/?]+)/);
      if (twitterMatch) {
        const screenName = twitterMatch[1].toLowerCase();
        return profilesByScreenName.get(screenName);
      }

      // Signa app URL: extract user_id
      const signaMatch = url.match(/app\.signa\.software\/search\?user_id=(\d+)/);
      if (signaMatch) {
        const userId = Number(signaMatch[1]);
        return profilesByUserId.get(userId);
      }

      return undefined;
    },
    [profilesByUrl, profilesByScreenName, profilesByUserId]
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
        // Cache by profileUrl
        if (profile.profileUrl) {
          next.set(profile.profileUrl, profile);
        }
        // Also cache by linkedinUrl for lookup when agent uses linkedin links
        if (profile.linkedinUrl) {
          next.set(profile.linkedinUrl, profile);
        }
        // Also cache by twitter URL if we have screenName
        if (profile.screenName) {
          next.set(`https://x.com/${profile.screenName}`, profile);
          next.set(`https://twitter.com/${profile.screenName}`, profile);
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
