import type {
	PluginContext,
	PluginFactory,
	PluginModule,
} from "@orgsdk/plugins";
import { FacebookAuthProvider } from "./auth-provider";
import { safeFunctions } from "./facebook-functions";

// Facebook permissions for page management
const DEFAULT_SCOPES = [
	"pages_show_list",
	"pages_read_engagement",
	"pages_read_user_content",
	"pages_manage_posts",
	"pages_manage_engagement",
];

const createPlugin: PluginFactory = (ctx: PluginContext): PluginModule => {
	const authProvider = new FacebookAuthProvider(ctx, DEFAULT_SCOPES);
	return {
		safeFunctions,
		httpEndpoints: authProvider.getHttpEndpoints(),
		authProvider,
		async onLoad() {
			const cred = await ctx.stores.credential.get("facebook-oauth", "default");
			if (!cred) {
				ctx.logger.warn(
					"[facebook] No facebook-oauth credential found. Connect it in the dashboard (Credentials tab).",
				);
			}
		},
	};
};

export default createPlugin;
