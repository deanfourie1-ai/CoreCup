// The two starting rival clubs. First-draft names; see the design doc.

export type Role = 'Keeper' | 'Defender' | 'Midfielder' | 'Striker';

export interface PlayerDef {
  name: string;
  role: Role;
  core: string;
}

export interface ClubDef {
  id: string;
  name: string;
  tagline: string;
  colour: string;
  players: PlayerDef[];
}

export const CLUBS: ClubDef[] = [
  {
    id: 'emberforge',
    name: 'Emberforge Foundry',
    tagline: 'Sky-port club of brass and sunset reds',
    colour: '#d9622b',
    players: [
      { name: 'Hollis Stonewright', role: 'Keeper', core: 'Golem' },
      { name: 'Lan Shuyi', role: 'Defender', core: 'Qilin' },
      { name: 'Kweku Thread', role: 'Midfielder', core: 'Anansi' },
      { name: 'Rune Halvard', role: 'Midfielder', core: 'Fenrir' },
      { name: 'Iggy Vale', role: 'Striker', core: 'Phoenix' },
    ],
  },
  {
    id: 'tidewell',
    name: 'Tidewell Mariners',
    tagline: 'Harbour city club of deep blues and teal',
    colour: '#2a8a9a',
    players: [
      { name: 'Old Xuan', role: 'Keeper', core: 'Black Tortoise' },
      { name: 'Brin Tolland', role: 'Defender', core: 'Kraken' },
      { name: 'Sora Fennick', role: 'Midfielder', core: 'Kitsune' },
      { name: 'Niamh Brack', role: 'Midfielder', core: 'Kelpie' },
      { name: 'Tauro Kastellan', role: 'Striker', core: 'Minotaur' },
    ],
  },
];
