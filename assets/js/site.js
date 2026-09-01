export function versionedSiblingUrl(relativePath, moduleUrl = import.meta.url) {
  return `${relativePath}${new URL(moduleUrl).search}`;
}

const { siteConfig } = await import(versionedSiblingUrl("./site-config.js"));

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

function safeHttpUrl(value) {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : "";
  } catch {
    return "";
  }
}

function validEmail(value) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ? value
    : "";
}

function safeAssetPath(value) {
  return typeof value === "string" &&
    !value.includes("..") &&
    /^assets\/[A-Za-z0-9_./-]+$/.test(value)
    ? value
    : "";
}

export function buildSiteState(config) {
  const youtubeId = YOUTUBE_ID.test(config.youtubeId) ? config.youtubeId : "";
  const watchUrl = youtubeId ? `https://www.youtube.com/watch?v=${youtubeId}` : "";

  return {
    video: youtubeId
      ? {
          kind: "youtube",
          embedUrl: `https://www.youtube-nocookie.com/embed/${youtubeId}?rel=0`,
          watchUrl,
        }
      : { kind: "coming-soon", embedUrl: "", watchUrl: "" },
    resources: config.resources.map(({ id, label, status, href }) => {
      const destination = id === "preview" ? watchUrl : safeHttpUrl(href);
      const available =
        id === "preview" ? Boolean(youtubeId) : status === "available" && Boolean(destination);
      return { id, label, available, href: available ? destination : "" };
    }),
    contact: {
      email: validEmail(config.contactEmail),
      wechatQrPath: safeAssetPath(config.wechatQrPath),
    },
  };
}

export function renderVideo(root, video) {
  const mount = root.querySelector("[data-video-mount]");
  if (!mount || video.kind !== "youtube") return;

  const iframe = root.createElement("iframe");
  iframe.src = video.embedUrl;
  iframe.title = "NEXUS project preview video";
  iframe.loading = "lazy";
  iframe.allow =
    "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.allowFullscreen = true;
  mount.replaceChildren(iframe);
}

export function renderResources(root, resources) {
  for (const resource of resources) {
    const link = root.querySelector(`[data-resource-id="${resource.id}"]`);
    if (!link || !resource.available) continue;

    link.href = resource.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.removeAttribute("aria-disabled");
    link.removeAttribute("tabindex");
    link.classList.remove("is-coming-soon");
    const status = link.querySelector("small");
    if (status) status.textContent = "Available";
  }
}

export function renderContact(root, contact) {
  const email = root.querySelector("[data-contact-email]");
  if (email && contact.email) {
    email.href = `mailto:${contact.email}`;
    email.textContent = contact.email;
    email.hidden = false;
  }

  const trigger = root.querySelector("[data-wechat-trigger]");
  const dialog = root.querySelector("[data-wechat-dialog]");
  const image = root.querySelector("[data-wechat-image]");
  const close = root.querySelector("[data-dialog-close]");
  if (!trigger || !dialog || !image || !contact.wechatQrPath) return;

  image.addEventListener(
    "load",
    () => {
      trigger.hidden = false;
    },
    { once: true },
  );
  image.addEventListener(
    "error",
    () => {
      trigger.hidden = true;
      image.removeAttribute("src");
    },
    { once: true },
  );
  image.src = contact.wechatQrPath;

  trigger.addEventListener("click", () => dialog.showModal());
  close?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export function renderSite(root, config) {
  const state = buildSiteState(config);
  renderVideo(root, state.video);
  renderResources(root, state.resources);
  renderContact(root, state.contact);
  return state;
}

export { siteConfig };

if (typeof document !== "undefined") {
  renderSite(document, siteConfig);
}
