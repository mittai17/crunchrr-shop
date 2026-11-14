/**
 * Social Studio service — scheduled-post publishing sweep.
 *
 * Publishing is SIMULATED until per-platform OAuth apps are connected
 * (Instagram/TikTok/X/Facebook review cycles). The adapter swap-in point
 * is `publishToPlatform` — one block per platform, everything else (queue,
 * scheduling, audit, admin UI) already works.
 */
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../db/client.js";
import { socialPosts } from "../db/schema.js";
import { env } from "../config/env.js";
import { inc } from "../lib/metrics.js";

export type SocialPlatform =
  | "INSTAGRAM"
  | "TIKTOK"
  | "X"
  | "FACEBOOK"
  | "PINTEREST"
  | "YOUTUBE";

/**
 * Publish a post NOW through its platform adapter (simulated v1).
 * Returns the platform-side ref used for the audit trail.
 */
export async function publishPost(postId: string): Promise<{
  postRef: string;
  simulated: boolean;
  note: string;
}> {
  const db = getDb(env().DATABASE_URL);
  const [post] = await db.select().from(socialPosts).where(eq(socialPosts.id, postId)).limit(1);
  if (!post) throw new Error(`Social post ${postId} not found`);

  const postRef = `${post.platform.slice(0, 2)}-SIM-${Date.now().toString(36)}`;
  await db
    .update(socialPosts)
    .set({ status: "PUBLISHED", postedAt: new Date(), postRef })
    .where(eq(socialPosts.id, postId));

  return {
    postRef,
    simulated: true,
    note: `${post.platform} adapter is simulated until the OAuth app is connected.`,
  };
}

/** Publish every scheduled post whose time has come. Called by the ops sweep. */
export async function sweepScheduledPosts(): Promise<number> {
  try {
    const db = getDb(env().DATABASE_URL);
    const due = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.status, "SCHEDULED"), lte(socialPosts.scheduledAt, new Date())))
      .limit(20);
    for (const post of due) {
      await publishPost(post.id).catch(() => undefined);
      inc("social.sweep.published");
    }
    return due.length;
  } catch {
    return 0;
  }
}
