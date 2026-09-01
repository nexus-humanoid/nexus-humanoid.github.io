import assert from "node:assert/strict";
import test from "node:test";

import { siteConfig } from "../assets/js/site-config.js";
import { buildSiteState } from "../assets/js/site.js";

test("reservation config exposes only the approved contact email", () => {
  const state = buildSiteState(siteConfig);

  assert.equal(state.video.kind, "coming-soon");
  assert.equal(state.contact.email, "xiangyu.miao@outlook.com");
  assert.equal(state.contact.wechatQrPath, "assets/images/wechat-qr.jpg");
  assert.ok(state.resources.every((resource) => resource.available === false));
  assert.ok(state.resources.every((resource) => resource.href === ""));
});

test("valid YouTube ID activates only the preview resource", () => {
  const state = buildSiteState({ ...siteConfig, youtubeId: "abcdefghijk" });

  assert.deepEqual(state.video, {
    kind: "youtube",
    embedUrl: "https://www.youtube-nocookie.com/embed/abcdefghijk?rel=0",
    watchUrl: "https://www.youtube.com/watch?v=abcdefghijk",
  });
  assert.deepEqual(
    state.resources.filter((resource) => resource.available).map((resource) => resource.id),
    ["preview"],
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
