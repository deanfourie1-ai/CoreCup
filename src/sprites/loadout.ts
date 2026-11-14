// Visible upgrades: six slots, each empty or Mk I to Mk III. The core slot's
// tiers are named Spark, Surge and Ascended.

export const SLOTS = ['head', 'shoulders', 'arms', 'legs', 'boots', 'core'] as const;
export type Slot = (typeof SLOTS)[number];
export type Tier = 0 | 1 | 2 | 3;
export type Loadout = Record<Slot, Tier>;

export const TIER_LABELS: Record<Slot, string[]> = {
  head: ['None', 'Mk I', 'Mk II', 'Mk III'],
  shoulders: ['None', 'Mk I', 'Mk II', 'Mk III'],
  arms: ['None', 'Mk I', 'Mk II', 'Mk III'],
  legs: ['None', 'Mk I', 'Mk II', 'Mk III'],
  boots: ['None', 'Mk I', 'Mk II', 'Mk III'],
  core: ['None', 'Spark', 'Surge', 'Ascended'],
};

export const EMPTY_LOADOUT: Loadout = { head: 0, shoulders: 0, arms: 0, legs: 0, boots: 0, core: 0 };

export const PRESETS: Record<string, { label: string; loadout: Loadout }> = {
  base: { label: 'Base kit', loadout: { ...EMPTY_LOADOUT, core: 1 } },
  spike: {
    label: 'Spike: Mk II shoulders + Mk III boots',
    loadout: { head: 1, shoulders: 2, arms: 1, legs: 1, boots: 3, core: 1 },
  },
  allMk2: { label: 'All Mk II + Surge', loadout: { head: 2, shoulders: 2, arms: 2, legs: 2, boots: 2, core: 2 } },
  allMk3: { label: 'All Mk III + Ascended', loadout: { head: 3, shoulders: 3, arms: 3, legs: 3, boots: 3, core: 3 } },
};

/** Every distinct Mk I-III mix across the six slots, the count the layers must cover. */
export const tierCombinations = (tiersPerSlot = 3): number => tiersPerSlot ** SLOTS.length;

/** A stable key for caching composites. */
export const loadoutKey = (l: Loadout): string => SLOTS.map((s) => l[s]).join('');

export function randomLoadout(rand: () => number): Loadout {
  const out = { ...EMPTY_LOADOUT };
  for (const s of SLOTS) out[s] = Math.floor(rand() * 4) as Tier;
  return out;
}
