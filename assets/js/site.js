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
      const destination = id === "youtube" ? watchUrl : safeHttpUrl(href);
      const available =
        id === "youtube" ? Boolean(youtubeId) : status === "available" && Boolean(destination);
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

function bindDialog(trigger, dialog, beforeOpen) {
  const close = dialog.querySelector("[data-dialog-close]");

  trigger.addEventListener("click", () => {
    beforeOpen?.();
    dialog.showModal();
  });
  close?.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

export async function copyContactEmail(email, clipboard = globalThis.navigator?.clipboard) {
  if (!clipboard || typeof clipboard.writeText !== "function") return false;

  try {
    await clipboard.writeText(email);
    return true;
  } catch {
    return false;
  }
}

export function renderContact(root, contact, clipboard = globalThis.navigator?.clipboard) {
  const emailTrigger = root.querySelector("[data-email-trigger]");
  const emailDialog = root.querySelector("[data-email-dialog]");
  const emailAddress = root.querySelector("[data-email-address]");
  const emailCopy = root.querySelector("[data-email-copy]");
  const emailCopyStatus = root.querySelector("[data-email-copy-status]");
  if (
    emailTrigger &&
    emailDialog &&
    emailAddress &&
    emailCopy &&
    emailCopyStatus &&
    contact.email
  ) {
    emailAddress.textContent = contact.email;
    emailTrigger.hidden = false;
    bindDialog(emailTrigger, emailDialog, () => {
      emailCopyStatus.textContent = "";
    });
    emailCopy.addEventListener("click", async () => {
      const copied = await copyContactEmail(contact.email, clipboard);
      emailCopyStatus.textContent = copied
        ? "Copied"
        : "Select and copy the address manually.";
    });
  }

  const trigger = root.querySelector("[data-wechat-trigger]");
  const dialog = root.querySelector("[data-wechat-dialog]");
  const image = root.querySelector("[data-wechat-image]");
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

  bindDialog(trigger, dialog);
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
