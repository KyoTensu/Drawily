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

1. Open a PR from `dev` to `main`: `gh pr create --base main --head dev --title "Release vX.Y.Z"`.
2. Merge it with a **merge commit**. Squash is disabled on `main`, because a squash would make `main` and
   `dev` drift apart.
3. Tag the merge commit and publish the release:
   `gh release create vX.Y.Z --target main --generate-notes`.

Versions follow [Semantic Versioning](https://semver.org/).
