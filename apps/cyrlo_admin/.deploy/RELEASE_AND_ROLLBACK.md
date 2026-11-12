# Cyrlo Admin — release layout and rollback

**Host:** `cyrlorideadmin.eqostack.com`  
**Web root:** `/var/www/cyrlorideadmin`

## Layout

```
/var/www/cyrlorideadmin/
  current -> releases/<release-id>     # Nginx root
  releases/
    20261112T084947Z/                  # first production release (live at remediation time)
    <future-id>/
  shared/
    current-release.txt                # records active release id
```

## First-release limitation (explicit)

The first live release is `20261112T084947Z`.

**There is no prior release artifact to roll back to.**  
Symlink rollback only works after a **second** (or later) successful promote. Until then, recovery options are:

1. Re-upload a known-good `dist/` into a **new** release directory and point `current` at it (preferred).  
2. Disable only the Admin site symlink under `/etc/nginx/sites-enabled/` (leaves Ride/Maps/other apps alone).  
3. If the incident is CORS-only: restore `/etc/cyrlo-ride/ride.env.bak-admin-cors-20261112` and restart `cyrlo-ride-api` — do **not** touch Maps or other apps.

Do **not** invent a fake “previous” release directory.

## Future promote (safe baseline)

Use `promote-release.sh` on the VPS after uploading a new `releases/<id>/` tree:

1. Verify `index.html` + `assets/` exist in the new release.  
2. Atomically `ln -sfn` `current` → new release.  
3. Keep at least **one** prior release (default retain **5**).  
4. Never delete the release that `current` still points at.  
5. `nginx -t` is not required for a pure static symlink flip; reload Nginx only if the vhost file changed.

## Rollback (when ≥2 releases exist)

```bash
# Example — replace PRIOR with an existing directory under releases/
ln -sfn /var/www/cyrlorideadmin/releases/PRIOR /var/www/cyrlorideadmin/current
echo PRIOR > /var/www/cyrlorideadmin/shared/current-release.txt
# Optional if vhost unchanged: no nginx reload needed for static root symlink
curl -sS -o /dev/null -w '%{http_code}\n' https://cyrlorideadmin.eqostack.com/
```

Do not roll back Ride API, Maps API, Cirlo, or EQOStack for an Admin frontend issue.
