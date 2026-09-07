# Deployment

How this project is served, and how it fits alongside the other sites on the same machine.

## Live configuration

| | |
|---|---|
| Tunnel name | `binod-home` |
| Tunnel UUID | `cd90781c-9c68-42a4-a7ce-0f25e8defa1d` |
| Canonical config | `/etc/cloudflared/config.yml` (system location — the service runs as root) |
| Credentials | `/etc/cloudflared/cd90781c-9c68-42a4-a7ce-0f25e8defa1d.json` |
| Account cert | `~/.cloudflared/cert.pem` (account-level; can create/delete tunnels — never commit or back up off-machine) |

Set up 2026-09-06. `abstract-physics.binodtiwari.com` CNAME created and routed to this tunnel.
`staging-abstract-physics.binodtiwari.com` added 2026-09-07 for the release path below.

| Hostname | Port | Serves |
|---|---|---|
| `abstract-physics.binodtiwari.com` | 8080 | production — `physics-web:live` |
| `staging-abstract-physics.binodtiwari.com` | 8082 | release candidate — `physics-web:rc` |

**Edit `/etc/cloudflared/config.yml`, not the copy in `~/.cloudflared/`.** Keeping two is what
broke the previous setup — see Troubleshooting. The `~/.cloudflared/` copy is kept in sync anyway,
with a header saying it is not the live one, because `cloudflared tunnel ingress rule <url>`
defaults to that path and a stale copy makes it answer differently from production.

## History (2026-09-06)

`cloudflared` is installed on the host but is **not logged in and has no local config**:
`~/.cloudflared/` contains neither `cert.pem` nor `config.yml`. The previously-running
subdomains were served by a dashboard-managed (token-based) tunnel whose token lived in the
service definition, and that has been retired.

So this is a **fresh, locally-managed setup**. Chosen deliberately: with a locally-managed
tunnel every hostname on the machine is listed in one version-controllable file, which is what
makes a growing set of subdomains legible. Dashboard-managed hides the routing in a web UI.

## Architecture: one tunnel, many hostnames

- **One `cloudflared` process for the whole machine**, as a host systemd service. Not one per
  project, and *not* inside any project's `docker compose`.
- **Each project is its own compose stack**, publishing exactly one port on `127.0.0.1`.
- **cloudflared routes by hostname** to those ports. It already does hostname routing, so there
  is no nginx or Traefik in front — a second reverse proxy only adds a second place for a
  request to go wrong.

Adding a site later is then: one ingress block, one `route dns` command, one restart.

```
                    ┌────────────────────────────────────────┐
 Cloudflare edge    │  one tunnel: <TUNNEL-UUID>             │
        │           └────────────────────────────────────────┘
        │ encrypted outbound only — no inbound ports open on the PC
        ▼
  cloudflared (systemd, host)  ── reads /home/blinded-christi/.cloudflared/config.yml
        │
        ├── abstract-physics.binodtiwari.com  →  127.0.0.1:8080   (this project)
        ├── documind.binodtiwari.com          →  127.0.0.1:8081   (when revived)
        └── <catch-all>                       →  404
```

## Port registry

**The authoritative allocation for this machine.** Check it before assigning a port; update it
in the same commit as any change.

Recovered from the previous tunnel config (`/etc/cloudflared/config.yml.old-2026-09-06`) plus
the current allocation. Dormant entries are not currently served but their ports are reserved so
a revived service keeps its old address.

| Port | Project | Hostname | Status |
|---|---|---|---|
| 8080 | **Abstract Physics** — production | `abstract-physics.binodtiwari.com` | **live, all four simulations** |
| 8082 | **Abstract Physics** — staging | `staging-abstract-physics.binodtiwari.com` | **live, release candidate** |
| 3000 | Portfolio (apex site) | `binodtiwari.com` | dormant |
| 3001 | NeuralForge | `neuralforge.binodtiwari.com` | dormant |
| 3002 | PipelineGuard | `pipelineguard.binodtiwari.com` | dormant |
| 3003 | ResearchCrew | `researchcrew.binodtiwari.com` | dormant |
| 3004 | DataflowAgent | `dataflowagent.binodtiwari.com` | dormant |
| 3005 | DefectScope | `defectscope.binodtiwari.com` | dormant |
| 3006 | ContractLens | `contractlens.binodtiwari.com` | dormant |
| 3007 | QuantumShield | `quantumshield.binodtiwari.com` | dormant |
| 3008 | ModelForge | `modelforge.binodtiwari.com` | dormant |
| 3009 | MLPipelineX | `mlpipelinex.binodtiwari.com` | dormant |
| 3010 | DocuMind (frontend) | `documind.binodtiwari.com` | dormant |
| 8001 | DocuMind (API) | `documind.binodtiwari.com/api/*`, `/health`, `/docs` | dormant |
| 80 | StudyAI | `studyai.binodtiwari.com` | dormant |
| 8083+ | *(free)* | | |

Ports 8080 and 8082 were chosen because they collide with nothing above. 8081 is left
free deliberately: it is the obvious next default and reserving it avoids a future collision.

### Reviving a dormant site

Two things are needed, and the second is the one people forget: those hostnames' DNS records
still point at the **old, deleted-or-idle tunnel** `d61228a8-8e71-457b-988b-cbaacf646760`, so
they currently return error 1016. Adding an ingress rule alone will not route them.

```bash
# 1. add the ingress block to /etc/cloudflared/config.yml, above the catch-all
# 2. repoint the hostname at the CURRENT tunnel (overwrites the stale CNAME)
cloudflared tunnel route dns binod-home documind.binodtiwari.com
# 3. restart
sudo systemctl restart cloudflared
```

DocuMind's path-based split is worth preserving verbatim when it comes back — more specific
paths must come first, since rules match top to bottom:

```yaml
  - hostname: documind.binodtiwari.com
    path: /api/.*
    service: http://localhost:8001
  - hostname: documind.binodtiwari.com
    path: /health
    service: http://localhost:8001
  - hostname: documind.binodtiwari.com
    path: /docs
    service: http://localhost:8001
  - hostname: documind.binodtiwari.com          # catch-all for this host, must be last of the four
    service: http://localhost:3010
```

### Retiring the old tunnel

`d61228a8-…` is superseded. Once nothing is expected from it:

```bash
cloudflared tunnel list                  # confirm it is idle (no connections)
cloudflared tunnel delete d61228a8-8e71-457b-988b-cbaacf646760
```

Deleting a tunnel does **not** remove the DNS records that point at it — those must be deleted
or repointed in the Cloudflare DNS tab separately, or they keep returning 1016.

---

## One-time host setup

### 0. Clear out any retired token-based service

```bash
systemctl status cloudflared
docker ps -a | grep -i cloudflare
```

If an old token-based service or container is still defined, remove it before continuing — two
cloudflared instances competing is a confusing failure mode:

```bash
sudo systemctl disable --now cloudflared
sudo cloudflared service uninstall     # only if a service is currently installed
```

### 1. Authenticate

```bash
cloudflared tunnel login
```

Opens a browser; pick the `binodtiwari.com` zone. Writes `~/.cloudflared/cert.pem`. This is an
account-level credential — it can create and delete tunnels. Keep it off any repo and off any
backup that leaves the machine.

### 2. Create the tunnel

```bash
cloudflared tunnel create binod-home
```

One tunnel for the whole machine, named for the machine rather than any one site — it will carry
every subdomain. Note the **UUID** it prints; it also writes
`~/.cloudflared/<UUID>.json` (the tunnel secret).

### 3. Write the config

`~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL-UUID>
credentials-file: /home/blinded-christi/.cloudflared/<TUNNEL-UUID>.json

ingress:
  - hostname: abstract-physics.binodtiwari.com
    service: http://localhost:8080

  # one block per additional site, always above the catch-all:
  # - hostname: documind.binodtiwari.com
  #   service: http://localhost:8081

  - service: http_status:404      # MANDATORY — must be the last rule
```

```bash
cloudflared tunnel ingress validate
```

Three things that will bite:

1. **The catch-all is required.** A config whose `ingress` list doesn't end in a rule with no
   `hostname` is rejected outright.
2. **Order matters** — rules match top to bottom, first match wins, catch-all last.
3. **Never mix management models.** A tunnel created in the dashboard and run with `--token`
   ignores this file completely.

### 4. Create the DNS record

```bash
cloudflared tunnel route dns binod-home abstract-physics.binodtiwari.com
```

This creates the proxied CNAME to `<UUID>.cfargotunnel.com`. **Editing `config.yml` alone gets
you nothing** — without this the hostname does not resolve.

### 5. Promote the config to the system location and install the service

The service runs as root, so the config belongs in `/etc/cloudflared/`, not a user home. Having
a config in **both** places makes `service install` refuse to run:

> `Possible conflicting configuration in ~/.cloudflared/config.yml and /etc/cloudflared/config.yml`

```bash
# retire anything left from a previous setup
sudo mv /etc/cloudflared/config.yml /etc/cloudflared/config.yml.old-$(date +%F) 2>/dev/null

sudo cp ~/.cloudflared/config.yml /etc/cloudflared/config.yml
sudo cp ~/.cloudflared/<TUNNEL-UUID>.json /etc/cloudflared/
sudo sed -i 's|/home/blinded-christi/.cloudflared/|/etc/cloudflared/|' /etc/cloudflared/config.yml
sudo chmod 600 /etc/cloudflared/*.json

sudo cloudflared --config /etc/cloudflared/config.yml service install
sudo systemctl enable --now cloudflared
systemctl status cloudflared --no-pager
```

Note the `--config` flag: under `sudo`, `$HOME` resolves to `/root`, so cloudflared will not
find a config in your home directory on its own. Always pass the path explicitly.

---

## Releasing: build once, verify on staging, promote the same image

**Nothing reaches production that has not been served, over the real Cloudflare edge, from the
byte-identical image.** That is the whole point of the staging stack, and it exists because the
edge is not transparent: Cloudflare injects a hidden `<a>` into `<body>` and a challenge script
before `</body>`, so the HTML a browser receives is not what nginx sent. An accessibility
violation caused by exactly that injection passed every local check and only appeared through the
tunnel. Verifying against `127.0.0.1:8080` is verifying something the public never receives.

```bash
./scripts/release.sh build      # physics-web:rc-<sha>, also tagged :rc
./scripts/release.sh stage      # starts the staging stack on 127.0.0.1:8082
#                                 -> https://staging-abstract-physics.binodtiwari.com
#   ... verify against the STAGING HOSTNAME, not localhost ...
./scripts/release.sh promote    # retags the staged image :live, recreates production
./scripts/release.sh status     # what is built, staged and live, by image ID
```

**`promote` cannot rebuild.** `docker-compose.yml` has no `build:` — production can only start an
image that already exists — and `promote` refuses unless `physics-web:rc` is the image the
staging *container* is running. Rebuilding after staging therefore fails the promotion rather than
silently shipping something the verification never covered. Both stacks are separate compose
projects (`physics`, `physics-staging`), so staging can never recreate a production container.

Rolling back needs no rebuild either, because every candidate keeps its own tag:

```bash
docker images physics-web            # find the previous rc-<sha>
./scripts/release.sh rollback rc-1a2b3c4
```

### What to check on staging

The same sweep production gets, against the staging hostname over HTTPS: every sim route in both
themes, zero axe violations, zero console errors, no horizontal overflow at 360 and 390 px, and
the controls driven to their limits. `npx playwright test` covers the app against a local preview;
staging is where the *edge* is exercised.

### The two stacks are independent

Staging holds port 8082 continuously; it is not torn down between releases. It costs one small
nginx container and means the hostname is always there to deploy into. If it must be stopped:

```bash
docker compose -f docker-compose.staging.yml down
```

That leaves the ingress rule in place and the hostname returns the catch-all 404 — which is also
the signal that staging is down rather than broken.

## Adding the next site later

```bash
# 1. point the hostname at the tunnel (needs ~/.cloudflared/cert.pem; no root)
cloudflared tunnel route dns binod-home <new>.binodtiwari.com

# 2. add an ingress block ABOVE the catch-all. Validate before installing, not after:
#    a bad config makes the service crash-loop and takes every hostname down with it.
cloudflared --config /tmp/proposed.yml tunnel ingress validate
cloudflared --config /tmp/proposed.yml tunnel ingress rule https://<new>.binodtiwari.com

# 3. install and restart (needs root; back the old one up first)
sudo cp -a /etc/cloudflared/config.yml /etc/cloudflared/config.yml.bak-$(date +%Y%m%d-%H%M%S)
sudo cp /tmp/proposed.yml /etc/cloudflared/config.yml
sudo cloudflared --config /etc/cloudflared/config.yml tunnel ingress validate
sudo systemctl restart cloudflared
```

`--config` is a **global** flag and must come before the subcommand: `cloudflared --config X
tunnel ingress validate`, not `cloudflared tunnel ingress validate --config X`, which is silently
parsed as something else and prints the help text instead of validating.

Update the port registry above in the same commit.

## The domain name

It is **`abstract-physics.binodtiwari.com`**, with a hyphen. `abstract_physics...` is not a valid
hostname — RFC 1123 disallows underscores, public CAs will not issue a certificate for one, and
browsers reject it. Not a preference.

## Container side

Cloudflare terminates TLS at its edge and the tunnel itself is encrypted, so the container serves
plain HTTP bound to localhost only. **No certificate in the container**, and do not publish to
`0.0.0.0` — binding `127.0.0.1` means the tunnel is the only route in.

```yaml
# docker-compose.yml — production. No `build:` on purpose; see the release section.
name: physics
services:
  web:
    image: physics-web:live
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:80"
```

```yaml
# docker-compose.staging.yml — the release candidate, same image, different port.
name: physics-staging
services:
  web:
    image: physics-web:rc
    restart: unless-stopped
    ports:
      - "127.0.0.1:8082:80"
```

Multi-stage Dockerfile: node build stage → nginx serving `dist/`. Nginx needs gzip (brotli if
available), long `Cache-Control` on hashed assets, `no-cache` on `index.html`, correct MIME type
for `.wasm`, and SPA fallback to `index.html`.

## Housekeeping on the Cloudflare side

- **Retiring a tunnel does not delete its DNS records.** The subdomains from the previous setup
  still have CNAMEs pointing at a tunnel that no longer runs; those return error **1016** rather
  than failing quietly. Review the DNS tab for `binodtiwari.com` and delete records for anything
  not being served, or repoint them at the new tunnel.
- Records for tunnel hostnames must be **proxied** (orange cloud). A grey-cloud CNAME to
  `cfargotunnel.com` will not resolve.
- Confirm the zone is still on Cloudflare's nameservers — none of this works otherwise.

## Troubleshooting

| Symptom | Cause |
|---|---|
| Error 1016 | DNS record exists; tunnel not running, or no ingress rule matches that hostname |
| Error 502 / 504 | Tunnel is up; nothing listening on the mapped port, or it bound to a container-internal address |
| Hostname doesn't resolve at all | `route dns` was never run, or the record isn't proxied |
| Service fails to start | Missing `--config` on install (looking in `/root`), missing catch-all, or YAML indentation |
| Config edits do nothing | Editing `~/.cloudflared/config.yml` while the service reads `/etc/cloudflared/config.yml`. The system copy is the live one. |
| Error 1033 on a new hostname | The CNAME exists and reaches Cloudflare but no tunnel claims it — usually `route dns` not yet run, or run against a different tunnel. |
| A new hostname returns the catch-all 404 rather than the app | DNS is correct and the tunnel is reachable; the **ingress rule is missing or below the catch-all**. This is the expected state between `route dns` and the config edit. |
| `cloudflared tunnel ingress validate --config X` prints help | `--config` is a global flag: it must precede the subcommand. |
| axe reports a violation live that the container does not | **Cloudflare injects into the HTML at the edge.** It adds a hidden `<a href="/cdn-cgi/content?…">` as the first child of `<body>`, plus a challenge-platform script before `</body>`. The response through the tunnel is not byte-identical to what nginx serves. This displaced the skip link from first position and tripped axe's `region` best-practice rule on every page, while `curl` of the container showed nothing wrong. Diff `curl` of the public host against `curl` of `127.0.0.1:8080` before assuming the app changed. |
| `service install` refuses to run | A config exists in both `~/.cloudflared/` and `/etc/cloudflared/`. Retire one. |
| Service crash-loops, `status=1/FAILURE` | Usually a stale `/etc/cloudflared/config.yml` from a previous setup referencing a tunnel that no longer exists |

## Sources

- [Routing to a tunnel — DNS records](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/dns/)
- [Configuration file / ingress rules](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/configuration-file/)
- [Create a locally-managed tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/create-local-tunnel/)
- [Run as a service on Linux](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/linux/)
