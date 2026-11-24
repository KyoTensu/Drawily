# Contributing

## Branches

| Branch | Purpose | Receives changes from |
|--------|---------|-----------------------|
| `main` | Releases only. Every commit is a release. | `dev`, by PR (merge commit) |
| `dev` | Integration branch, default branch of the repo. | Work branches, by PR (squash) |
| `feature/<name>`, `fix/<name>`, `docs/<name>`, `chore/<name>` | One change each. | — |

Both `main` and `dev` are protected by GitHub rulesets: no direct push, no force push, no deletion,
and changes only through a pull request. No approval is required, since this is a solo project.

## Making a change

```bash
git switch dev && git pull
git switch -c feature/<name>
# ...commit...
git push -u origin feature/<name>
gh pr create --base dev
```

Merge the PR with **squash**, so each change is one commit on `dev`. The branch is deleted on merge.

## Making a release

1. Open a PR from `dev` to `main` titled exactly `Release vX.Y.Z`:
   `gh pr create --base main --head dev --title "Release vX.Y.Z"`.
2. Merge it with a **merge commit**. Squash is disabled on `main`, because a squash would make `main` and
   `dev` drift apart.
3. The `Publish` workflow then pushes the `latest` and `X.Y.Z` Docker images to
   `ghcr.io/kyotensu/drawily`, tags the merge commit `vX.Y.Z` and creates the GitHub release with
   generated notes. A PR into `main` with another title fails the workflow and publishes nothing.

Every merge into `dev` publishes the `staging` image the same way.

Versions follow [Semantic Versioning](https://semver.org/).
