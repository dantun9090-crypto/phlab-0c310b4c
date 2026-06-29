# Day-theme visual regression snapshots

Baselines for `e2e/day-theme-audit.spec.ts`.

## Initial baseline

Generated automatically on the first CI run of
`.github/workflows/day-theme-audit.yml` with `update_snapshots=true`:

```
gh workflow run "Day Theme Audit (axe + visual regression)" -f update_snapshots=true
```

Download the `day-theme-snapshots` artifact and commit the PNGs into this
directory. Subsequent PRs are then diffed against these baselines and the
build fails on any unintended change to the light theme.

## Re-baseline locally

```
TEST_BASE_URL=http://localhost:8080 \
  bunx playwright test e2e/day-theme-audit.spec.ts --update-snapshots
```

Only commit re-baselines together with the intentional design change that
caused them.
