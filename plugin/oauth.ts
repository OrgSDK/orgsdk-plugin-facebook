export interface FacebookOAuthBundle {
	secret_clientId?: string;
	secret_clientSecret?: string;
	secret_refreshToken?: string;
	secret_accessToken?: string;
	secret_pageId?: string;
	secret_pageAccessToken?: string;
	[key: string]: unknown;
}

export function getFacebookCredentials(
	creds: Record<string, unknown>,
): FacebookOAuthBundle {
	return (creds["facebook-oauth"] as FacebookOAuthBundle | undefined) ?? {};
}

/**
 * Exchange a short-lived user access token for a long-lived one.
 */
export async function getLongLivedUserToken(
	bundle: FacebookOAuthBundle,
): Promise<{ accessToken: string; expiresAt: number }> {
	if (!bundle.secret_clientId || !bundle.secret_clientSecret) {
		throw new Error("Missing Facebook OAuth client credentials");
	}
	if (!bundle.secret_accessToken) {
		throw new Error(
			"Missing Facebook access token. Connect Facebook in the dashboard (Credentials tab).",
		);
	}

	const params = new URLSearchParams({
		grant_type: "fb_exchange_token",
		client_id: bundle.secret_clientId,
		client_secret: bundle.secret_clientSecret,
		fb_exchange_token: bundle.secret_accessToken,
	});

	const resp = await fetch(
		`https://graph.facebook.com/v21.0/oauth/access_token?${params}`,
	);

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(
			`Facebook token exchange failed: ${resp.status} ${errText}`,
		);
	}

	const data = await resp.json();
	return {
		accessToken: data.access_token,
		expiresAt: data.expires_in
			? Date.now() + data.expires_in * 1000
			: Date.now() + 60 * 24 * 3600 * 1000, // ~60 days default
	};
}

/**
 * Get a page access token from a user access token.
 * Page tokens never expire (for business pages).
 */
export async function getPageAccessToken(
	userAccessToken: string,
	pageId: string,
): Promise<{ pageAccessToken: string; pageId: string }> {
	const resp = await fetch(
		`https://graph.facebook.com/v21.0/${pageId}?fields=access_token&access_token=${userAccessToken}`,
	);

	if (!resp.ok) {
		const errText = await resp.text();
		throw new Error(
			`Failed to get page access token: ${resp.status} ${errText}`,
		);
	}

	const data = await resp.json();
	return {
		pageAccessToken: data.access_token,
		pageId: data.id ?? pageId,
	};
}

/**
 * Get a valid page access token for Facebook page operations.
 * Page tokens are long-lived and derived from the user token.
 */
export async function getFacebookPageToken(
	creds: Record<string, unknown>,
): Promise<{ pageToken: string; pageId: string }> {
	const bundle = getFacebookCredentials(creds);

	// If we already have a stored page token, use it (page tokens don't expire)
	if (bundle.secret_pageAccessToken && bundle.secret_pageId) {
		return {
			pageToken: bundle.secret_pageAccessToken,
			pageId: bundle.secret_pageId,
		};
	}

	// Otherwise, get long-lived user token then exchange for page token
	if (!bundle.secret_pageId) {
		throw new Error(
			"Missing Facebook page ID. Set the pageId resource on the agent.",
		);
	}

	const longLived = await getLongLivedUserToken(bundle);
	const result = await getPageAccessToken(
		longLived.accessToken,
		bundle.secret_pageId,
	);

	return { pageToken: result.pageAccessToken, pageId: result.pageId };
}
