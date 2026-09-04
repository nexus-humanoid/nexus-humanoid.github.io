import assert from "node:assert/strict";
import test from "node:test";

import { siteConfig } from "../assets/js/site-config.js";
import * as siteModule from "../assets/js/site.js";

const { buildSiteState } = siteModule;

test("copying the contact email writes only the address", async () => {
  assert.equal(typeof siteModule.copyContactEmail, "function");

  let copied = "";
  const success = await siteModule.copyContactEmail("xiangyu.miao@outlook.com", {
    writeText: async (value) => {
      copied = value;
    },
  });

  assert.equal(success, true);
  assert.equal(copied, "xiangyu.miao@outlook.com");
});

test("copying the contact email fails safely without clipboard access", async () => {
  assert.equal(typeof siteModule.copyContactEmail, "function");
  assert.equal(await siteModule.copyContactEmail("xiangyu.miao@outlook.com", undefined), false);
  assert.equal(
    await siteModule.copyContactEmail("xiangyu.miao@outlook.com", {
      writeText: async () => {
        throw new Error("Clipboard permission denied");
      },
    }),
    false,
  );
});

test("release cache key propagates to the site configuration request", () => {
  assert.equal(typeof siteModule.versionedSiblingUrl, "function");
  assert.equal(
    siteModule.versionedSiblingUrl(
      "./site-config.js",
      "https://nexus-humanoid.github.io/assets/js/site.js?v=3",
    ),
    "./site-config.js?v=3",
  );
  assert.equal(
    siteModule.versionedSiblingUrl(
      "./site-config.js",
      "https://nexus-humanoid.github.io/assets/js/site.js",
    ),
    "./site-config.js",
  );
});

test("published config exposes the approved video and contact email", () => {
  const state = buildSiteState(siteConfig);

  assert.deepEqual(state.video, {
    kind: "youtube",
    embedUrl: "https://www.youtube-nocookie.com/embed/2J9YmBuMFoc?rel=0",
    watchUrl: "https://www.youtube.com/watch?v=2J9YmBuMFoc",
  });
  assert.deepEqual(state.resources.find((resource) => resource.id === "youtube"), {
    id: "youtube",
    label: "Video",
    available: true,
    href: "https://www.youtube.com/watch?v=2J9YmBuMFoc",
  });
  assert.equal(state.contact.email, "xiangyu.miao@outlook.com");
  assert.equal(state.contact.wechatQrPath, "assets/images/wechat-qr.jpg");
});

test("published config exposes only the video as an available primary resource", () => {
  const state = buildSiteState(siteConfig);

  assert.deepEqual(
    state.resources.map((resource) => resource.id),
    ["youtube", "paper", "arxiv", "code"],
  );
  assert.equal(state.resources[0].label, "Video");
  assert.equal(state.resources[0].available, true);
  assert.equal(state.resources[0].href, "https://www.youtube.com/watch?v=2J9YmBuMFoc");
  assert.ok(state.resources.slice(1).every((resource) => resource.available === false));
  assert.ok(state.resources.slice(1).every((resource) => resource.href === ""));
});

test("valid YouTube ID activates only the YouTube resource", () => {
  const state = buildSiteState({ ...siteConfig, youtubeId: "abcdefghijk" });

  assert.deepEqual(state.video, {
    kind: "youtube",
    embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
    watchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  });
  assert.deepEqual(
    state.resources.filter((resource) => resource.available).map((resource) => resource.id),
    ["youtube"],
  );
});

test("only available HTTPS academic resources become links", () => {
  const resources = siteConfig.resources.map((resource) => {
    if (resource.id === "paper") {
      return {
        ...resource,
        status: "available",
        href: "https://example.edu/nexus.pdf",
      };
    }
    if (resource.id === "code") {
      return {
        ...resource,
        status: "available",
        href: "http://example.edu/private-code",
      };
    }
    return resource;
  });

  const state = buildSiteState({ ...siteConfig, resources });

  assert.deepEqual(state.resources.find((resource) => resource.id === "paper"), {
    id: "paper",
    label: "Paper",
    available: true,
    href: "https://example.edu/nexus.pdf",
  });
  assert.equal(state.resources.find((resource) => resource.id === "code").available, false);
});

test("contact details reject malformed email and traversing QR paths", () => {
  const valid = buildSiteState({
    ...siteConfig,
    contactEmail: "research@example.edu",
    wechatQrPath: "assets/images/wechat-qr.png",
  });
  assert.deepEqual(valid.contact, {
    email: "research@example.edu",
    wechatQrPath: "assets/images/wechat-qr.png",
  });

  const invalid = buildSiteState({
    ...siteConfig,
    contactEmail: "not-an-email",
    wechatQrPath: "assets/../private/qr.png",
  });
  assert.deepEqual(invalid.contact, { email: "", wechatQrPath: "" });
});
