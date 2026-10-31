import type { ConfigStore, SafeFunction } from "@orgsdk/plugins";
import { fetchJson } from "./http-client";
import { getFacebookPageToken } from "./oauth";

export const moduleDescription =
	"Post content, manage page posts, and read analytics for Facebook business pages";

// ─── Types ──────────────────────────────────────────────────────────────

interface FacebookPage {
	id: string;
	name: string;
	link: string;
	fanCount?: number;
}

interface FacebookPagePost {
	id: string;
	message?: string;
	createdTime: string;
	permalinkUrl: string;
	fullPicture?: string;
	likes: number;
	comments: number;
	shares: number;
}

// ─── Helpers ────────────────────────────────────────────────────────────

async function fbFetch(
	accessToken: string,
	path: string,
	options?: { method?: string; body?: Record<string, unknown> },
) {
	const url = path.startsWith("http")
		? path
		: `https://graph.facebook.com/v21.0${path}`;

	return fetchJson(url, {
		method: options?.method ?? "GET",
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"Content-Type": "application/json",
		},
		body: options?.body ? JSON.stringify(options.body) : undefined,
	});
}

// ─── Safe Functions ─────────────────────────────────────────────────────

export function createSafeFunctions(configStore: ConfigStore): SafeFunction[] {
	return [
		// ─── Get Page Info ────────────────────────────────────────────────
		{
			name: "getPage",
			requiredCredentials: ["facebook-oauth"],
			handler: async (
				credentials: Record<string, unknown>,
			): Promise<FacebookPage> => {
				const { pageToken, pageId } = await getFacebookPageToken(
					credentials,
					(await configStore.get("plugin:facebook"))?.value?.pageId,
				);
				const data = await fbFetch(
					pageToken,
					`/${pageId}?fields=id,name,link,fan_count`,
				);

				return {
					id: data.id,
					name: data.name ?? "Unknown",
					link: data.link ?? "",
					fanCount: data.fan_count ?? undefined,
				};
			},
			description:
				"Get the Facebook business page info including name, link, and follower count.",
			returnType:
				"Promise<{ id: string; name: string; link: string; fanCount?: number }>",
			parameters: [],
			metadata: {
				category: "facebook",
				tags: ["readonly", "discovery"],
				readonly: true,
				discovery: true,
				version: "1.0.0",
			},
			docs: {
				summary:
					"Retrieve the Facebook business page info for the configured page ID. Returns name, link, and follower count.",
				parameters: [],
				returns: {
					type: "Promise<FacebookPage>",
					description: "The Facebook page details.",
				},
			},
		},

		// ─── List Pages (admin access) ───────────────────────────────────
		{
			name: "getPages",
			requiredCredentials: ["facebook-oauth"],
			handler: async (
				credentials: Record<string, unknown>,
			): Promise<FacebookPage[]> => {
				const bundle = credentials["facebook-oauth"] as Record<string, unknown>;
				const accessToken = bundle?.secret_accessToken as string;
				if (!accessToken) {
					throw new Error("Missing Facebook access token");
				}

				const data = await fbFetch(
					accessToken,
					"/me/accounts?fields=id,name,link,fan_count",
				);

				return (data.data ?? []).map(
					(p: {
						id: string;
						name: string;
						link?: string;
						fan_count?: number;
					}) => ({
						id: p.id,
						name: p.name,
						link: p.link ?? "",
						fanCount: p.fan_count ?? undefined,
					}),
				);
			},
			description:
				"List all Facebook business pages where the authenticated user has admin access.",
			returnType:
				"Promise<Array<{ id: string; name: string; link: string; fanCount?: number }>>",
			parameters: [],
			metadata: {
				category: "facebook",
				tags: ["readonly", "discovery"],
				readonly: true,
				discovery: true,
				version: "1.0.0",
			},
			docs: {
				summary:
					"List all Facebook business pages where the authenticated user is an admin. Returns page IDs needed for posting.",
				parameters: [],
				returns: {
					type: "Promise<FacebookPage[]>",
					description:
						"Array of pages with ID, name, link, and follower count.",
				},
			},
		},

		// ─── Create Page Post ─────────────────────────────────────────────
		{
			name: "createPagePost",
			requiredCredentials: ["facebook-oauth"],
			handler: async (
				credentials: Record<string, unknown>,
				{
					message,
					linkUrl,
					scheduledPublishTime,
				}: {
					message: string;
					linkUrl?: string;
					scheduledPublishTime?: number;
				},
			): Promise<{ id: string; url: string }> => {
				const { pageToken, pageId } = await getFacebookPageToken(
					credentials,
					(await configStore.get("plugin:facebook"))?.value?.pageId,
				);

				const body: Record<string, unknown> = {
					message,
				};

				if (linkUrl) {
					body.link = linkUrl;
				}

				if (scheduledPublishTime) {
					body.published = false;
					body.scheduled_publish_time = scheduledPublishTime;
				}

				const result = await fbFetch(pageToken, `/${pageId}/feed`, {
					method: "POST",
					body,
				});

				const postId = result?.id ?? "unknown";

				return {
					id: postId,
					url: `https://www.facebook.com/${postId.replace("_", "/posts/")}`,
				};
			},
			description:
				"Create a post on the Facebook business page. Supports link attachments and scheduled publishing.",
			returnType: "Promise<{ id: string; url: string }>",
			parameters: [
				{ name: "message", type: "string" },
				{ name: "linkUrl", type: "string", optional: true },
				{ name: "scheduledPublishTime", type: "number", optional: true },
			],
			metadata: {
				category: "facebook",
				tags: ["write", "social"],
				readonly: false,
				version: "1.0.0",
			},
			docs: {
				summary:
					"Publish a post on the Facebook business page. Supports link attachments and scheduled publishing. The post appears on the page timeline.",
				parameters: [
					{
						name: "message",
						type: "string",
						description: "The post message text.",
						example: '"Check out our new blog post!"',
					},
					{
						name: "linkUrl",
						type: "string",
						description:
							"URL to attach as a link preview. Facebook will generate a preview card from Open Graph metadata.",
						optional: true,
						example: '"https://quokly.com.au/blog/my-post"',
					},
					{
						name: "scheduledPublishTime",
						type: "number",
						description:
							"Unix timestamp to schedule the post for future publication. Omit to publish immediately.",
						optional: true,
						example: "1715700000",
					},
				],
				returns: {
					type: "Promise<{ id: string; url: string }>",
					description: "The created post ID and Facebook URL.",
				},
				examples: [
					{
						title: "Share a blog post link",
						code: `const post = await facebook.createPagePost({
  message: "New on the blog: Why source transparency matters in AI research",
  linkUrl: "https://quokly.com.au/blog/why-source-transparency",
});`,
					},
					{
						title: "Schedule a post for tomorrow",
						code: `const tomorrow = Math.floor(Date.now() / 1000) + 86400;
await facebook.createPagePost({
  message: "Coming tomorrow: AI research for policy analysts",
  scheduledPublishTime: tomorrow,
});`,
					},
				],
			},
		},

		// ─── Get Page Posts ───────────────────────────────────────────────
		{
			name: "getPagePosts",
			requiredCredentials: ["facebook-oauth"],
			handler: async (
				credentials: Record<string, unknown>,
				{ limit }: { limit?: number },
			): Promise<FacebookPagePost[]> => {
				const { pageToken, pageId } = await getFacebookPageToken(
					credentials,
					(await configStore.get("plugin:facebook"))?.value?.pageId,
				);

				const data = await fbFetch(
					pageToken,
					`/${pageId}/posts?fields=id,message,created_time,permalink_url,full_picture,likes.summary(true).limit(0),comments.summary(true).limit(0),shares&limit=${limit ?? 10}`,
				);

				return (data.data ?? []).map(
					(p: {
						id: string;
						message?: string;
						created_time: string;
						permalink_url: string;
						full_picture?: string;
						likes?: { summary: { total_count: number } };
						comments?: { summary: { total_count: number } };
						shares?: { count: number };
					}) => ({
						id: p.id,
						message: p.message ?? undefined,
						createdTime: p.created_time,
						permalinkUrl: p.permalink_url,
						fullPicture: p.full_picture ?? undefined,
						likes: p.likes?.summary?.total_count ?? 0,
						comments: p.comments?.summary?.total_count ?? 0,
						shares: p.shares?.count ?? 0,
					}),
				);
			},
			description:
				"List recent posts on the Facebook business page with engagement metrics.",
			returnType:
				"Promise<Array<{ id: string; message?: string; createdTime: string; permalinkUrl: string; likes: number; comments: number; shares: number }>>",
			parameters: [{ name: "limit", type: "number", optional: true }],
			metadata: {
				category: "facebook",
				tags: ["readonly"],
				readonly: true,
				version: "1.0.0",
			},
			docs: {
				summary:
					"List recent posts on the Facebook business page with engagement metrics (likes, comments, shares).",
				parameters: [
					{
						name: "limit",
						type: "number",
						description: "Max number of posts to return. Default 10.",
						optional: true,
						defaultValue: "10",
					},
				],
				returns: {
					type: "Promise<FacebookPagePost[]>",
					description: "Array of page posts with engagement metrics.",
				},
			},
		},

		// ─── Get Post Insights ────────────────────────────────────────────
		{
			name: "getPostInsights",
			requiredCredentials: ["facebook-oauth"],
			handler: async (
				credentials: Record<string, unknown>,
				{ postId }: { postId: string },
			): Promise<{
				impressions: number;
				reach: number;
				likes: number;
				comments: number;
				shares: number;
				linkClicks: number;
				engagementRate: number;
			}> => {
				const { pageToken } = await getFacebookPageToken(
					credentials,
					(await configStore.get("plugin:facebook"))?.value?.pageId,
				);

				const data = await fbFetch(
					pageToken,
					`/${postId}/insights?metric=post_impressions,post_impressions_unique,post_engaged_users&period=lifetime`,
				);

				const metrics: Record<string, number> = {};
				for (const item of data.data ?? []) {
					if (item.values?.[0]?.value !== undefined) {
						metrics[item.name] = item.values[0].value;
					}
				}

				// Also get engagement counts
				const postData = await fbFetch(
					pageToken,
					`/${postId}?fields=likes.summary(true).limit(0),comments.summary(true).limit(0),shares`,
				);

				const likes = postData.likes?.summary?.total_count ?? 0;
				const comments = postData.comments?.summary?.total_count ?? 0;
				const shares = postData.shares?.count ?? 0;
				const reach = metrics.post_impressions_unique ?? 0;
				const impressions = metrics.post_impressions ?? 0;

				const engagementRate =
					reach > 0
						? Math.round(((likes + comments + shares) / reach) * 10000) / 100
						: 0;

				return {
					impressions,
					reach,
					likes,
					comments,
					shares,
					linkClicks: metrics.post_engaged_users ?? 0,
					engagementRate,
				};
			},
			description:
				"Get detailed insights for a Facebook page post including impressions, reach, engagement, and click metrics.",
			returnType:
				"Promise<{ impressions: number; reach: number; likes: number; comments: number; shares: number; linkClicks: number; engagementRate: number }>",
			parameters: [{ name: "postId", type: "string" }],
			metadata: {
				category: "facebook",
				tags: ["readonly", "analytics"],
				readonly: true,
				version: "1.0.0",
			},
			docs: {
				summary:
					"Retrieve detailed analytics for a Facebook page post. Returns impressions, reach, likes, comments, shares, link clicks, and engagement rate.",
				parameters: [
					{
						name: "postId",
						type: "string",
						description: "The Facebook post ID.",
					},
				],
				returns: {
					type: "Promise<FacebookPostInsights>",
					description: "Detailed engagement and reach metrics.",
				},
			},
		},

		// ─── Delete Page Post ─────────────────────────────────────────────
		{
			name: "deletePagePost",
			requiredCredentials: ["facebook-oauth"],
			handler: async (
				credentials: Record<string, unknown>,
				{ postId }: { postId: string },
			): Promise<{ success: boolean }> => {
				const { pageToken } = await getFacebookPageToken(
					credentials,
					(await configStore.get("plugin:facebook"))?.value?.pageId,
				);
				await fbFetch(pageToken, `/${postId}`, { method: "DELETE" });
				return { success: true };
			},
			description: "Delete a Facebook page post. This action is irreversible.",
			returnType: "Promise<{ success: boolean }>",
			parameters: [{ name: "postId", type: "string" }],
			metadata: {
				category: "facebook",
				tags: ["write", "destructive"],
				readonly: false,
				version: "1.0.0",
			},
			docs: {
				summary: "Delete a Facebook page post. This action is irreversible.",
				parameters: [
					{
						name: "postId",
						type: "string",
						description: "The ID of the post to delete.",
					},
				],
				returns: {
					type: "Promise<{ success: boolean }>",
					description: "Confirmation of deletion.",
				},
			},
		},
	];
}
