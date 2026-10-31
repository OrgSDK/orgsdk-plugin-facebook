# Current execution contract

Set plugin configuration `{ "pageId": "YOUR_PAGE_ID" }`. The plugin resolves a page access token from the host-supplied user token, checks the returned page ID, and uses bearer headers. Do not store a page token or page ID in the OAuth snapshot.

Native OAuth providers receive only `{source: "byo", secret_accessToken}`. The host owns refresh. The first-party relay is retired.

## Historical source reference

The following describes the former author-source host; current npm and native credential behaviour above takes precedence.

# Facebook

Post to and read from Facebook Pages — publishing, scheduling, and engagement
insights. OAuth2 (BYO client).

## What it does

The `facebook` plugin automates Facebook Page management: list your pages,
publish posts (immediate or scheduled), fetch posts, pull engagement insights,
and delete posts. It targets **Pages** (not personal profiles), which is the
correct surface for brand/agency automation.

Typical uses:

- **Cross-posting** — publish the same content across Facebook, LinkedIn, and
  X from one workflow (compose with the `linkedin` and `twitter` plugins).
- **Scheduled campaigns** — queue a series of posts across a launch window.
- **Engagement reporting** — pull per-post metrics into a sheet for review.

## Functions

| Function | Purpose |
|---|---|
| `getPages` | List Pages the connected account manages. |
| `getPage` | Get a single Page. |
| `getPagePosts` | List posts on a Page. |
| `createPagePost` | Publish a post (immediate or `scheduledPublishTime`). |
| `deletePagePost` | Delete a post. |
| `getPostInsights` | Pull engagement metrics for a post. |

The full function list (parameters, return types) is available via the
`plugins:info` command in the dashboard.

## Credentials

Every function declares `requiredCredentials: ["facebook-oauth"]`. A Facebook
OAuth credential must be connected before any function is callable.

| Provider | Type | Connect method |
|---|---|---|
| `facebook-oauth` | oauth2 | BYO Facebook OAuth app. Connect via the dashboard Credentials flow; the granted scopes cover page list, read, and post/engagement management. |

Required scopes: `pages_show_list`, `pages_read_engagement`,
`pages_read_user_content`, `pages_manage_posts`, `pages_manage_engagement`.

## Using it in a workflow

```typescript
const pages = await getPages();
const page = pages.find((p) => p.name === "Acme");
if (!page) throw new Error("Acme page not found");

const post = await createPagePost({
  pageId: page.id,
  message: "New blog post: Scaling agent workflows →",
  linkUrl: "https://acme.com/blog/scaling-agents",
});

// Pull metrics later
const insights = await getPostInsights({ pageId: page.id, postId: post.id });
```

## Notes

- All operations are scoped to a **Page** (`pageId`) — pass it per call.
- Scheduled publishing uses `scheduledPublishTime` (UTC ISO string) on
  `createPagePost`.
- No `guides/` reference yet; agent usage patterns can be added later.
