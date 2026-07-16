import type {
	AuthProvider,
	HttpEndpoint,
	PluginContext,
} from "@orgsdk/plugins";

const STATE_TTL_MS = 10 * 60 * 1000;

interface PendingState {
	credentialName: string;
	createdAt: number;
}

type FacebookOAuthClientFile = {
	app_id?: string;
	app_secret?: string;
};

export class FacebookAuthProvider implements AuthProvider {
	readonly type = "oauth2" as const;
	readonly authMeta = {
		displayName: "Facebook/Meta",
		configField: {
			label: "Facebook App Credentials JSON",
			placeholder: '{"app_id": "...", "app_secret": "..."}',
		},
	};
	private readonly pendingStates = new Map<string, PendingState>();
	private readonly ctx: PluginContext;
	private readonly scopes: string[];

	constructor(ctx: PluginContext, scopes: string[]) {
		this.ctx = ctx;
		this.scopes = scopes;
	}

	async initiate(
		credentialName: string,
	): Promise<{ authUrl: string; state: string }> {
		const { appId, appSecret } = await this.resolveClientConfig(credentialName);
		if (!appId) {
			throw new Error(
				`Facebook OAuth app credentials not configured. ` +
					`Checked facebook-oauth-client/default, facebook-oauth-client/${credentialName}, facebook-oauth/${credentialName}. ` +
					`Paste your app credentials JSON in the Credentials tab.`,
			);
		}

		const redirectUri = `${this.ctx.publicBaseUrl}/plugins/facebook/callback`;
		const state = crypto.randomUUID();

		this.cleanExpiredStates();
		this.pendingStates.set(state, { credentialName, createdAt: Date.now() });

		const params = new URLSearchParams({
			response_type: "code",
			client_id: appId,
			redirect_uri: redirectUri,
			scope: this.scopes.join(","),
			state,
		});

		const authUrl = `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
		return { authUrl, state };
	}

	async handleCallback(
		req: Request,
	): Promise<{ success: boolean; credentialName: string; error?: string }> {
		const url = new URL(req.url);
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");

		if (!state || !code) {
			return {
				success: false,
				credentialName: "",
				error: "Missing code or state parameter",
			};
		}

		const pending = this.pendingStates.get(state);
		if (!pending) {
			return {
				success: false,
				credentialName: "",
				error: "Invalid or expired state",
			};
		}

		if (Date.now() - pending.createdAt > STATE_TTL_MS) {
			this.pendingStates.delete(state);
			return { success: false, credentialName: "", error: "State expired" };
		}

		this.pendingStates.delete(state);

		try {
			const { appId, appSecret } = await this.resolveClientConfig(
				pending.credentialName,
			);

			if (!appId || !appSecret) {
				return {
					success: false,
					credentialName: pending.credentialName,
					error:
						`Facebook OAuth app credentials not configured. ` +
						`Checked facebook-oauth-client/default, facebook-oauth-client/${pending.credentialName}, facebook-oauth/${pending.credentialName}.`,
				};
			}

			const redirectUri = `${this.ctx.publicBaseUrl}/plugins/facebook/callback`;

			// Exchange code for short-lived access token
			const tokenResp = await fetch(
				`https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams(
					{
						code,
						redirect_uri: redirectUri,
						client_id: appId,
						client_secret: appSecret,
					},
				)}`,
			);

			if (!tokenResp.ok) {
				const errText = await tokenResp.text();
				return {
					success: false,
					credentialName: pending.credentialName,
					error: `Token exchange failed: ${tokenResp.status} ${errText}`,
				};
			}

			const tokens = await tokenResp.json();

			// Exchange for long-lived token
			const longLivedResp = await fetch(
				`https://graph.facebook.com/v21.0/oauth/access_token?${new URLSearchParams(
					{
						grant_type: "fb_exchange_token",
						client_id: appId,
						client_secret: appSecret,
						fb_exchange_token: tokens.access_token,
					},
				)}`,
			);

			const longLived = await longLivedResp.json();
			const accessToken = longLived.access_token ?? tokens.access_token;

			await this.ctx.stores.credential.setSecrets(
				"facebook-oauth",
				pending.credentialName,
				{
					secret_appId: appId,
					secret_appSecret: appSecret,
					secret_accessToken: accessToken,
					createdAt: new Date().toISOString(),
				},
				{
					label: `Facebook OAuth (${pending.credentialName})`,
					valid: true,
				},
			);

			return { success: true, credentialName: pending.credentialName };
		} catch (err) {
			return {
				success: false,
				credentialName: pending.credentialName,
				error: err instanceof Error ? err.message : String(err),
			};
		}
	}

	getHttpEndpoints(): HttpEndpoint[] {
		return [
			{
				method: "GET",
				path: "/callback",
				handler: async (req) => {
					const result = await this.handleCallback(req);
					if (result.success) {
						return new Response(
							`<html><body><h2>Facebook OAuth success</h2><p>Credential '${result.credentialName}' saved. You can close this tab.</p></body></html>`,
							{
								headers: { "Content-Type": "text/html" },
							},
						);
					}
					return new Response(
						`<html><body><h2>Facebook OAuth failed</h2><p>${result.error ?? "Unknown error"}</p></body></html>`,
						{
							status: 400,
							headers: { "Content-Type": "text/html" },
						},
					);
				},
			},
		];
	}

	async configure(json: string, credentialName: string): Promise<void> {
		const parsed = JSON.parse(json) as FacebookOAuthClientFile;
		if (!parsed.app_id || !parsed.app_secret) {
			throw new Error("JSON must contain 'app_id' and 'app_secret' fields");
		}
		await this.ctx.stores.credential.setSecrets(
			"facebook-oauth-client",
			credentialName,
			{
				secret_appId: parsed.app_id,
				secret_appSecret: parsed.app_secret,
			},
			{
				label: `Facebook OAuth client (${credentialName})`,
				valid: true,
			},
		);
	}

	private async resolveClientConfig(credentialName: string): Promise<{
		appId?: string;
		appSecret?: string;
	}> {
		let secrets = await this.ctx.stores.credential.getSecrets(
			"facebook-oauth-client",
			"default",
		);
		let appId = secrets?.secret_appId as string | undefined;
		let appSecret = secrets?.secret_appSecret as string | undefined;
		if (appId && appSecret) return { appId, appSecret };

		secrets = await this.ctx.stores.credential.getSecrets(
			"facebook-oauth-client",
			credentialName,
		);
		appId = secrets?.secret_appId as string | undefined;
		appSecret = secrets?.secret_appSecret as string | undefined;
		if (appId && appSecret) return { appId, appSecret };

		secrets = await this.ctx.stores.credential.getSecrets(
			"facebook-oauth",
			credentialName,
		);
		appId = secrets?.secret_appId as string | undefined;
		appSecret = secrets?.secret_appSecret as string | undefined;
		if (appId && appSecret) return { appId, appSecret };

		return {};
	}

	private cleanExpiredStates() {
		const now = Date.now();
		for (const [k, v] of this.pendingStates) {
			if (now - v.createdAt > STATE_TTL_MS) this.pendingStates.delete(k);
		}
	}
}
