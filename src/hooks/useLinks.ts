import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Json } from '@/integrations/supabase/types';
import { patchProfileSettings } from '@/lib/profileSettings';

export interface LinkItem {
  id: string;
  url: string;
  title: string;
  description?: string;
  siteName?: string;
  previewImage?: string;
}

export interface LinkSection {
  id: string;
  title: string;
  links: LinkItem[];
  photos: string[];
  collapsed: boolean;
  createdAt: string;
}

export interface LinkGroup {
  id: string;
  title: string;
  sections: LinkSection[];
  collapsed: boolean;
  createdAt: string;
}

type LegacyLinkGroup = {
  id: string;
  title: string;
  links?: LinkItem[];
  photos?: string[];
  collapsed?: boolean;
  createdAt?: string;
};

const STORAGE_KEY = 'linkhub-groups-v2';
const LEGACY_STORAGE_KEY = 'linkhub-groups-v1';

function createDefaultSection(overrides?: Partial<LinkSection>): LinkSection {
  return {
    id: crypto.randomUUID(),
    title: 'General',
    links: [],
    photos: [],
    collapsed: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function normalizeLink(link: Partial<LinkItem>): LinkItem | null {
  if (!link.id || !link.url) return null;
  return {
    id: link.id,
    url: link.url,
    title: link.title || link.siteName || link.url,
    description: link.description,
    siteName: link.siteName,
    previewImage: link.previewImage,
  };
}

function normalizeSection(section: Partial<LinkSection>): LinkSection {
  const links = Array.isArray(section.links)
    ? section.links.map(normalizeLink).filter((link): link is LinkItem => !!link)
    : [];

  return createDefaultSection({
    id: section.id || crypto.randomUUID(),
    title: section.title?.trim() || 'General',
    links,
    photos: Array.isArray(section.photos) ? section.photos.filter(Boolean) : [],
    collapsed: Boolean(section.collapsed),
    createdAt: section.createdAt || new Date().toISOString(),
  });
}

function normalizeGroup(group: Partial<LinkGroup> | LegacyLinkGroup): LinkGroup {
  const sections = Array.isArray((group as LinkGroup).sections)
    ? (group as LinkGroup).sections.map(normalizeSection)
    : [
        createDefaultSection({
          title: 'General',
          links: Array.isArray((group as LegacyLinkGroup).links)
            ? ((group as LegacyLinkGroup).links || []).map(normalizeLink).filter((link): link is LinkItem => !!link)
            : [],
          photos: Array.isArray((group as LegacyLinkGroup).photos) ? (group as LegacyLinkGroup).photos || [] : [],
        }),
      ];

  return {
    id: group.id || crypto.randomUUID(),
    title: group.title?.trim() || 'Untitled collection',
    sections,
    collapsed: Boolean(group.collapsed),
    createdAt: group.createdAt || new Date().toISOString(),
  };
}

function load(): LinkGroup[] {
  try {
    const currentRaw = localStorage.getItem(STORAGE_KEY);
    if (currentRaw) {
      const parsed = JSON.parse(currentRaw);
      return Array.isArray(parsed) ? parsed.map(normalizeGroup) : [];
    }

    const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!legacyRaw) return [];

    const parsed = JSON.parse(legacyRaw);
    return Array.isArray(parsed) ? parsed.map(normalizeGroup) : [];
  } catch {
    return [];
  }
}

function save(groups: LinkGroup[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(groups));
  } catch {
    return;
  }
}

function normalizeGroups(parsed: unknown): LinkGroup[] {
  return Array.isArray(parsed) ? parsed.map(normalizeGroup) : [];
}

export function useLinks() {
  const { user, isDemo, authReady } = useAuth();
  const [groups, setGroups] = useState<LinkGroup[]>(load);
  const [, setProfileSettings] = useState<Record<string, unknown>>({});
  const hydratedRef = useRef(false);
  const migratedLocalRef = useRef(false);
  const lastSavedRef = useRef('');

  useEffect(() => {
    const hydrate = async () => {
      if (!authReady) return;

      if (!user || isDemo) {
        const localGroups = load();
        setGroups(localGroups);
        hydratedRef.current = true;
        lastSavedRef.current = JSON.stringify(localGroups);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('settings')
          .eq('user_id', user.id)
          .single();

        if (error) throw error;

        const settings =
          data?.settings && typeof data.settings === 'object' && !Array.isArray(data.settings)
            ? (data.settings as Record<string, unknown>)
            : {};

        setProfileSettings(settings);

        const remoteGroups = normalizeGroups(settings.linkHubGroups);
        const localGroups = load();

        if (remoteGroups.length > 0) {
          setGroups(remoteGroups);
          hydratedRef.current = true;
          lastSavedRef.current = JSON.stringify(remoteGroups);
          return;
        }

        if (localGroups.length > 0 && !migratedLocalRef.current) {
          migratedLocalRef.current = true;
          setGroups(localGroups);
          hydratedRef.current = true;
          lastSavedRef.current = JSON.stringify(localGroups);

          const { settings: nextSettings, error: updateError } = await patchProfileSettings(user.id, {
            linkHubGroups: localGroups as unknown as Json,
          });
          if (!updateError && nextSettings) {
            setProfileSettings(nextSettings as Record<string, unknown>);
          }
          return;
        }

        setGroups([]);
        hydratedRef.current = true;
        lastSavedRef.current = '[]';
      } catch (error) {
        console.error('Failed to hydrate LinkHub:', error);
        const fallbackGroups = load();
        setGroups(fallbackGroups);
        hydratedRef.current = true;
        lastSavedRef.current = JSON.stringify(fallbackGroups);
      }
    };

    void hydrate();
  }, [authReady, isDemo, user]);

  useEffect(() => {
    if (!hydratedRef.current || !authReady) return;

    const serialized = JSON.stringify(groups);
    if (serialized === lastSavedRef.current) return;
    lastSavedRef.current = serialized;

    save(groups);

    if (!user || isDemo) return;

    const persist = async () => {
      const { settings: nextSettings, error } = await patchProfileSettings(user.id, {
        linkHubGroups: groups as unknown as Json,
      });

      if (error) {
        console.error('Failed to persist LinkHub:', error);
        return;
      }

      if (nextSettings) setProfileSettings(nextSettings as Record<string, unknown>);
      window.dispatchEvent(new CustomEvent('profile-updated'));
    };

    void persist();
  }, [authReady, groups, isDemo, user]);

  const addGroup = useCallback((title: string) => {
    const group: LinkGroup = {
      id: crypto.randomUUID(),
      title: title.trim(),
      sections: [createDefaultSection()],
      collapsed: false,
      createdAt: new Date().toISOString(),
    };
    setGroups(prev => [group, ...prev]);
    return group;
  }, []);

  const renameGroup = useCallback((id: string, title: string) => {
    setGroups(prev => prev.map(group => group.id === id ? { ...group, title } : group));
  }, []);

  const deleteGroup = useCallback((id: string) => {
    setGroups(prev => prev.filter(group => group.id !== id));
  }, []);

  // Undo a just-deleted collection by re-inserting it at its prior position.
  const restoreGroup = useCallback((group: LinkGroup, index: number) => {
    setGroups(prev => {
      if (prev.some(g => g.id === group.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(Math.max(index, 0), next.length), 0, group);
      return next;
    });
  }, []);

  const toggleCollapse = useCallback((id: string) => {
    setGroups(prev => prev.map(group => group.id === id ? { ...group, collapsed: !group.collapsed } : group));
  }, []);

  const reorderGroups = useCallback((activeGroupId: string, targetGroupId: string) => {
    if (activeGroupId === targetGroupId) return;
    setGroups(prev => {
      const fromIndex = prev.findIndex(group => group.id === activeGroupId);
      const toIndex = prev.findIndex(group => group.id === targetGroupId);
      if (fromIndex === -1 || toIndex === -1) return prev;

      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const addSection = useCallback((groupId: string, title: string) => {
    const nextSection = createDefaultSection({ title: title.trim() || 'New section' });
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? { ...group, sections: [...group.sections, nextSection], collapsed: false }
        : group
    ));
    return nextSection;
  }, []);

  const renameSection = useCallback((groupId: string, sectionId: string, title: string) => {
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            sections: group.sections.map(section =>
              section.id === sectionId ? { ...section, title: title.trim() || section.title } : section
            ),
          }
        : group
    ));
  }, []);

  const deleteSection = useCallback((groupId: string, sectionId: string) => {
    setGroups(prev => prev.map(group => {
      if (group.id !== groupId) return group;
      const remaining = group.sections.filter(section => section.id !== sectionId);
      return {
        ...group,
        sections: remaining.length > 0 ? remaining : [createDefaultSection()],
      };
    }));
  }, []);

  const toggleSectionCollapse = useCallback((groupId: string, sectionId: string) => {
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            sections: group.sections.map(section =>
              section.id === sectionId ? { ...section, collapsed: !section.collapsed } : section
            ),
          }
        : group
    ));
  }, []);

  const addLink = useCallback((groupId: string, sectionId: string, link: Omit<LinkItem, 'id'>) => {
    const nextLink: LinkItem = { ...link, id: crypto.randomUUID() };
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            sections: group.sections.map(section =>
              section.id === sectionId ? { ...section, links: [...section.links, nextLink], collapsed: false } : section
            ),
          }
        : group
    ));
    return nextLink;
  }, []);

  const renameLink = useCallback((groupId: string, sectionId: string, linkId: string, title: string) => {
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            sections: group.sections.map(section =>
              section.id === sectionId
                ? {
                    ...section,
                    links: section.links.map(link => link.id === linkId ? { ...link, title: title.trim() || link.title } : link),
                  }
                : section
            ),
          }
        : group
    ));
  }, []);

  const removeLink = useCallback((groupId: string, sectionId: string, linkId: string) => {
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            sections: group.sections.map(section =>
              section.id === sectionId ? { ...section, links: section.links.filter(link => link.id !== linkId) } : section
            ),
          }
        : group
    ));
  }, []);

  const moveLink = useCallback((
    fromGroupId: string,
    fromSectionId: string,
    toGroupId: string,
    toSectionId: string,
    linkId: string,
  ) => {
    setGroups(prev => {
      let movingLink: LinkItem | null = null;

      const removed = prev.map(group => {
        if (group.id !== fromGroupId) return group;
        return {
          ...group,
          sections: group.sections.map(section => {
            if (section.id !== fromSectionId) return section;
            const nextLinks = section.links.filter(link => {
              if (link.id === linkId) {
                movingLink = link;
                return false;
              }
              return true;
            });
            return { ...section, links: nextLinks };
          }),
        };
      });

      if (!movingLink) return prev;

      return removed.map(group => {
        if (group.id !== toGroupId) return group;
        return {
          ...group,
          collapsed: false,
          sections: group.sections.map(section =>
            section.id === toSectionId
              ? {
                  ...section,
                  collapsed: false,
                  links: section.links.some(link => link.id === movingLink!.id)
                    ? section.links
                    : [...section.links, movingLink!],
                }
              : section
          ),
        };
      });
    });
  }, []);

  const addPhoto = useCallback((groupId: string, sectionId: string, photo: string) => {
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            sections: group.sections.map(section =>
              section.id === sectionId ? { ...section, photos: [...section.photos, photo], collapsed: false } : section
            ),
          }
        : group
    ));
  }, []);

  const removePhoto = useCallback((groupId: string, sectionId: string, photo: string) => {
    setGroups(prev => prev.map(group =>
      group.id === groupId
        ? {
            ...group,
            sections: group.sections.map(section =>
              section.id === sectionId ? { ...section, photos: section.photos.filter(item => item !== photo) } : section
            ),
          }
        : group
    ));
  }, []);

  return {
    groups,
    addGroup,
    renameGroup,
    deleteGroup,
    restoreGroup,
    toggleCollapse,
    reorderGroups,
    addSection,
    renameSection,
    deleteSection,
    toggleSectionCollapse,
    addLink,
    renameLink,
    removeLink,
    moveLink,
    addPhoto,
    removePhoto,
  };
}
