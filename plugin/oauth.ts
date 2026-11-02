import { fetchJson } from "./http-client";
export async function getFacebookPageToken(
	credentials: Record<string, unknown>,
	pageId: unknown,
): Promise<{ pageToken: string; pageId: string }> {
	const bundle = credentials["facebook-oauth"] as
		| { source?: unknown; secret_accessToken?: unknown }
		| undefined;
	if (
		bundle?.source !== "byo" ||
		typeof bundle.secret_accessToken !== "string" ||
		!bundle.secret_accessToken.trim()
	)
		throw new Error(
			"Missing facebook-oauth access token. Reconnect Facebook in OrgSDK.",
		);
	if (typeof pageId !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(pageId))
		throw new Error("Configure the Facebook pageId in plugin settings.");
	const data = await fetchJson(
		`https://graph.facebook.com/v21.0/${encodeURIComponent(pageId)}?fields=access_token`,
		{ headers: { Authorization: `Bearer ${bundle.secret_accessToken}` } },
	);
	if (
		data?.id !== pageId ||
		typeof data.access_token !== "string" ||
		!data.access_token
	)
		throw new Error("PAGE_ACCESS_DENIED");
	return { pageToken: data.access_token, pageId };
}
