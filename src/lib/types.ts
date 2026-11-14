/** Kinds of entries in the log. */
export type Kind = 'tkk' | 'event' | 'photo' | 'merch' | 'travel' | 'collab' | 'wallet';

/** One logged item. Fields are shared across kinds; each kind uses a subset. */
export interface Entry {
  id: string;
  kind: Kind;
  /** ISO date (YYYY-MM-DD). For collabs, the start date. */
  date: string;
  /** Creation time, ms. */
  ts: number;
  /** Last local change, ms. Used to resolve sync conflicts. */
  updatedAt: number;
  deleted?: boolean;
  /** 1 while the change still has to be pushed to the server. */
  dirty?: 0 | 1;

  oshi?: string;
  eventId?: string;
  title?: string;
  venue?: string;
  note?: string;
  amount?: number;
  photos?: string[];
  /** Photo ids that are cheki scans (already framed). */
  scans?: string[];

  /** Live / event */
  etype?: string;
  number?: string;

  /** 特典会 loop */
  talk?: string;
  n?: number;
  unit?: number;
  chtype?: string;
  perk?: string;
  free?: number;
  loop?: number;
  /** Tickets taken from a wallet entry instead of paid on the spot. */
  walletId?: string;

  /** Wallet: tickets bought ahead of time */
  qty?: number;
  expires?: string;
  label?: string;

  /** Collab */
  cotype?: string;
  end?: string;

  /** Marche */
  media?: 'photo' | 'video';
}

/** A stored image or video. The blob is missing until downloaded on a new device. */
export interface Photo {
  id: string;
  blob?: Blob;
  type?: string;
  createdAt: number;
  /** 1 once the file is in cloud storage. */
  uploaded: 0 | 1;
}

/** An idol, with optional face descriptors for recognition. */
export interface Member {
  id: string;
  name: string;
  group?: string;
  color?: string;
  /** 128-number face descriptors from reference photos. */
  faces?: number[][];
  facePhotos?: string[];
  /** Marks the user's own face, so it's ignored in 2-shot chekis. */
  isMe?: boolean;
  updatedAt: number;
  deleted?: boolean;
  dirty?: 0 | 1;
}

export interface Settings {
  hideMoney: boolean;
}
