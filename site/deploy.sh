#!/usr/bin/env bash
# deploy.sh - build this one-pager and ship it to CloudFlare Workers static assets.
# Self-contained: everything it needs is baked in at scaffold time.
#
#   ./deploy.sh              build + deploy to https://anvil-md.frst.dev
#   ./deploy.sh --dry-run    build + validate the upload, change nothing remote
#   ./deploy.sh --force      deploy even if a worker named anvil-md already exists

set -euo pipefail

SLUG="anvil-md"
ZONE="frst.dev"
DOMAIN="anvil-md.frst.dev"
ACCOUNT_ID="e6bd4c9e08862c4b3c8ddacbbef253b1" # Duplo
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MARKER="$PROJECT_DIR/.wrangler/onepager-deployed"

DRY_RUN=false
FORCE=false
while [[ $# -gt 0 ]]; do
	case "$1" in
		--dry-run) DRY_RUN=true; shift ;;
		--force) FORCE=true; shift ;;
		-h|--help) sed -n '2,7p' "${BASH_SOURCE[0]}" | cut -c3-; exit 0 ;;
		*) echo "deploy.sh: unknown option $1" >&2; exit 2 ;;
	esac
done

cd "$PROJECT_DIR"
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"

echo "==> Building $SLUG"
bun run build

if [[ ! -f dist/index.html ]]; then
	echo "deploy.sh: dist/index.html missing after build - aborting." >&2
	exit 1
fi

# Refuse to silently stomp somebody else's worker of the same name. Once we've
# deployed this project once, the marker says the name is ours.
if [[ "$FORCE" != true && "$DRY_RUN" != true && ! -f "$MARKER" ]]; then
	TOKEN_FILE="$HOME/.config/cloudflare/token"
	if [[ -r "$TOKEN_FILE" ]]; then
		EXISTS=$(curl -sf -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
			"https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts/$SLUG" \
			-o /dev/null -w '%{http_code}' || true)
		if [[ "$EXISTS" == "200" ]]; then
			echo "" >&2
			echo "  ABORT: a worker named '$SLUG' already exists on the Duplo account," >&2
			echo "  and this project has never deployed to it. Deploying would overwrite it." >&2
			echo "" >&2
			echo "  Rename the project, or re-run with --force if the name really is yours." >&2
			exit 1
		fi
	fi
fi

if [[ "$DRY_RUN" == true ]]; then
	echo "==> Dry run (nothing will be uploaded)"
	bunx wrangler deploy --dry-run
	exit 0
fi

echo "==> Deploying to $DOMAIN"
bunx wrangler deploy

mkdir -p "$(dirname "$MARKER")"
date -u +%Y-%m-%dT%H:%M:%SZ > "$MARKER"

# Two things make a naive status-code check useless here:
#   1. On a first deploy the edge cert for the custom hostname takes a couple of
#      minutes, and the domain answers 5xx until it issues.
#   2. Some zones (frst.dev among them) have a PROXIED WILDCARD whose catch-all
#      answers HTTP 200 with its own page, so $DOMAIN returns 200 even when
#      nothing is deployed - a status check alone reports a false success.
# So: poll, and only believe it when the live HTML carries this page's own title.
TITLE=$(sed -n 's/.*<title>\(.*\)<\/title>.*/\1/p' dist/index.html | head -1)

echo ""
echo "==> Waiting for https://$DOMAIN"
STATUS=000
MATCHED=false
for _ in $(seq 1 24); do
	BODY=$(curl -s --compressed --max-time 10 -w '\n%{http_code}' "https://$DOMAIN/" || echo "000")
	STATUS=$(tail -1 <<<"$BODY")
	if [[ "$STATUS" == "200" && -n "$TITLE" ]] && grep -qF "<title>$TITLE</title>" <<<"$BODY"; then
		MATCHED=true
		break
	fi
	sleep 10
done

if [[ "$MATCHED" == true ]]; then
	echo "    HTTP 200 and the page is ours - live at https://$DOMAIN"
elif [[ "$STATUS" == "200" ]]; then
	echo "    HTTP 200 but the HTML isn't this site - you're seeing the *.$ZONE"
	echo "    wildcard catch-all, so the custom hostname hasn't taken effect yet."
	echo "    Re-check: curl -s https://$DOMAIN/ | grep '<title>'"
else
	echo "    HTTP $STATUS after 4 minutes."
	echo "    The assets ARE uploaded - this is the custom-hostname certificate still issuing."
	echo "    Re-check: curl -I https://$DOMAIN/"
	echo "    Meanwhile: bunx wrangler deployments list  (shows the *.workers.dev fallback URL)"
fi
