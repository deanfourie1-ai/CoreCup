// Which players have approved sprite art. Everyone else plays as a stand-in token in their team colour.
// When a new character's art is approved and imported (tools/sprites/import_delivery.py), add one line here.

const SPRITES = `${import.meta.env.BASE_URL}sprites/`;

export interface CharacterArt {
  /** Sprite sheet JSON (src/sprites/schema.ts). */
  atlas: string;
  /** Plays the keeper ready stance (keeper_ready) while standing in its own goal area. */
  keeperStance?: boolean;
}

/** Keyed by the player's creature core, which is unique per character. */
export const CHARACTER_ART: Record<string, CharacterArt> = {
  // Emberforge #10 playmaker: approved six-direction run (PR 11); idle is the earlier SE draft.
  Kitsune: { atlas: `${SPRITES}kitsune10_run/cc_kitsune10.json` },
  // Hollis Stonewright, Emberforge keeper: approved idle + run in six directions and the keeper ready stance.
  Golem: { atlas: `${SPRITES}hollis/cc_hollis.json`, keeperStance: true },
  // Lan Shuyi, Emberforge defender: approved idle + run facing SE, E, W, SW plus NE idle
  // (SW run = her SE run mirrored). NE run and NW are not drawn yet; the game mirrors SW and SE for them.
  Qilin: { atlas: `${SPRITES}lan/cc_lan.json` },
};
