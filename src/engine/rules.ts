// Every tunable number from the design doc lives here, so playtests and the
// rules simulator can change one value without touching the engine.

export const RULES = {
  // Mutable on purpose: tests and the rules simulator tweak values per run.
  hitOn: 4,
  matchLength: 60,
  halfLength: 30,

  cost: {
    move: 2,
    sprint: 4,
    pass: 3,
    shoot: 4,
    tackle: 3,
    hold: 1,
    intercept: 2,
    challenge: 2,
    block: 2,
    dive: 3,
  },

  sprintExtraHexes: 2,

  /** A robot may react if its token is at most this + Reflex ticks past the clock. */
  reactionWindowBase: 2,

  passRangeBase: 4,
  /** Distance bands: hits needed for an accurate pass. */
  passBand(distance: number): number {
    if (distance <= 3) return 1;
    if (distance <= 6) return 2;
    return 3;
  },

  flight: {
    ground: (distance: number) => Math.max(1, Math.ceil(distance / 2)),
    lofted: (distance: number) => 2 + Math.floor(distance / 3),
    driven: 1,
    placed: 2,
    chip: 3,
  },

  shot: {
    distancePenaltyPer: 3,
    placedBonus: 1,
    chipBonusKeeperOut: 2,
    cornerGuessRight: 2,
    cornerGuessWrong: -1,
    keeperPositioningDice: 2,
    clearDistance: 3,
  },

  keeperOutsideAreaPenalty: -1,

  /**
   * Proposed by the rules playtest (not yet in the design doc). Defaults match
   * the doc today; flip them to try the fix pack.
   */
  tackleTie: 'loose' as 'loose' | 'carrier',
  /** Extra ticks for a robot that loses the ball to a tackle or Challenge. */
  lostBallDelay: 0,
  overheatTicks: 12,
};
