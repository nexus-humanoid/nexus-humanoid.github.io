# NEXUS project page

Static academic project page prepared for `https://nexus-humanoid.github.io/`.

## Preview locally

From this directory, run:

```bash
python3 -m http.server 8000
```

Then open `http://127.0.0.1:8000/`.

## Publish a resource

All release switches live in `assets/js/site-config.js`.

- Set `youtubeId` to the 11-character YouTube video ID to replace the poster with a
  privacy-enhanced embed and enable **Preview Video**.
- For Paper, arXiv, Code, Model, Data, or BibTeX, set `status` to `"available"` and
  provide an `https://` URL. A URL alone does not publish a resource.
- Set `contactEmail` to reveal the email link.
- Add the real WeChat QR image under `assets/images/` and set `wechatQrPath` to its
  relative path. The WeChat button is revealed only after the image loads.

Empty or invalid values remain hidden or display **Coming Soon**.

## Deploy at the organization URL

1. Create the GitHub organization `nexus-humanoid`.
2. In that organization, create a repository named `nexus-humanoid.github.io`.
3. Make this directory the repository root and push it to the `main` branch.
4. In **Settings → Pages → Build and deployment**, select **GitHub Actions**.

The included workflow publishes the static site. The preview MP4 is intentionally not
part of the site; only optimized poster/share images are committed.

## Checks

```bash
node tests/site-state.test.mjs
python3 -m unittest tests/test_page_semantics.py -v
```
