import assert from "node:assert/strict";

const page = { id: "page", name: "Synthetic page", fan_count: 10 };
const post = {
	id: "page_post",
	message: "Synthetic post",
	likes: { summary: { total_count: 2 } },
	comments: { summary: { total_count: 1 } },
	shares: { count: 1 },
};
export default async function createFixture() {
	return {
		configuration: { pageId: "page" },
		provider: "facebook-oauth",
		secret: {
			source: "byo",
			secret_accessToken: "synthetic-user",
		},
		async fetch(request) {
			const url = new URL(request.url);
			assert.equal(url.origin, "https://graph.facebook.com");
			const path = url.pathname;
			if (url.searchParams.get("fields") === "access_token") {
				assert.equal(
					request.headers.get("authorization"),
					"Bearer synthetic-user",
				);
				return Response.json({ id: "page", access_token: "synthetic-page" });
			}
			assert.equal(
				request.headers.get("authorization"),
				path.endsWith("/me/accounts")
					? "Bearer synthetic-user"
					: "Bearer synthetic-page",
			);
			assert.equal(url.searchParams.has("access_token"), false);
			if (path === "/v21.0/me/accounts") return Response.json({ data: [page] });
			if (path === "/v21.0/page") return Response.json(page);
			if (path === "/v21.0/page/feed") {
				assert.equal(request.method, "POST");
				return Response.json({ id: post.id });
			}
			if (path === "/v21.0/page/posts") return Response.json({ data: [post] });
			if (path === "/v21.0/page_post/insights")
				return Response.json({
					data: [
						{ name: "post_impressions", values: [{ value: 100 }] },
						{ name: "post_impressions_unique", values: [{ value: 50 }] },
					],
				});
			if (path === "/v21.0/page_post")
				return Response.json(
					request.method === "DELETE" ? { success: true } : post,
				);
			assert.fail(path);
		},
		async run(call) {
			assert.equal((await call("getPage")).id, "page");
			assert.equal((await call("getPages"))[0].id, "page");
			assert.equal(
				(await call("createPagePost", { message: "Synthetic only" })).id,
				"page_post",
			);
			assert.equal((await call("getPagePosts"))[0].id, "page_post");
			assert.equal(
				(await call("getPostInsights", { postId: "page_post" })).impressions,
				100,
			);
			assert.equal(
				(await call("deletePagePost", { postId: "page_post" })).success,
				true,
			);
		},
	};
}
