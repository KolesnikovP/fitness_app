import type { Session, SessionSummary } from '@/entities/workout/@x/post';

/**
 * A finished Session as the User shows it. Its id is the Session's. caption
 * is empty when unset; photoUrl is the API path of its Progress photo, null
 * when it has none. session is the Session as it is now, stats and Personal
 * records included, not as it was when finished.
 */
export type Post = {
  id: string;
  caption: string;
  photoUrl: string | null;
  session: Session;
};

/** A Post as a list of them shows it, with its Session's summary rather than every Set. */
export type PostSummary = Omit<Post, 'session'> & { session: SessionSummary };

/** The most characters a caption may have: Instagram's limit. */
export const MAX_CAPTION_CHARS = 2200;
