const section = document.querySelector("#gallery");

async function initGallery() {
  const response = await fetch(
    new URL(`../data/gallery.json${new URL(import.meta.url).search}`, import.meta.url),
  );
  if (!response.ok) throw new Error("Gallery unavailable");
  const { categories, clips } = await response.json();
  // Refresh media URLs with the module version when the audio/video assets change.
  for (const clip of clips) clip.video += new URL(import.meta.url).search;
  const filters = section.querySelector("[data-gallery-filters]");
  const grid = section.querySelector("[data-gallery-grid]");
  const summary = section.querySelector("[data-gallery-summary]");
  const description = section.querySelector("[data-gallery-description]");
  const toggle = section.querySelector("[data-gallery-preview-toggle]");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let previewsEnabled = !reducedMotion.matches && !navigator.connection?.saveData;
  let currentCategory = "featured";
  let opener;
  const visible = new Set();

  const dialog = document.createElement("dialog");
  dialog.className = "gallery-dialog";
  dialog.setAttribute("aria-labelledby", "gallery-player-title");
  dialog.innerHTML = `
    <div class="gallery-dialog-header">
      <div><h2 id="gallery-player-title"></h2><p data-player-meta></p></div>
      <button class="gallery-close" type="button" aria-label="Close video" autofocus>✕</button>
    </div>
    <video controls playsinline preload="none"></video>
    <p class="gallery-player-fallback">Playback trouble? <a target="_blank" rel="noopener noreferrer">Open this clip directly ↗</a></p>`;
  document.body.append(dialog);
  const player = dialog.querySelector("video");
  const close = () => dialog.close();
  dialog.querySelector("button").addEventListener("click", close);
  dialog.addEventListener("click", (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      close();
  });

  function syncPlayback(video) {
    if (previewsEnabled && visible.has(video) && !document.hidden && !dialog.open) {
      if (!video.getAttribute("src")) video.src = video.dataset.src;
      video.play().catch(() => {
        /* Poster and the explicit player remain available. */
      });
    } else {
      video.pause();
    }
  }

  function syncPreviews() {
    grid.querySelectorAll("video").forEach(syncPlayback);
    toggle.textContent = previewsEnabled ? "Pause previews" : "Play previews";
    toggle.setAttribute("aria-pressed", String(previewsEnabled));
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) visible.add(entry.target);
        else visible.delete(entry.target);
        syncPlayback(entry.target);
      }
    },
    { threshold: 0.25 },
  );

  function openClip(clip, button) {
    opener = button;
    dialog.querySelector("h2").textContent = clip.title;
    dialog.querySelector("[data-player-meta]").textContent = `${clip.setting} · ${clip.terrain}`;
    dialog.querySelector("a").href = clip.video;
    player.poster = clip.poster;
    player.src = clip.video;
    player.muted = false;
    dialog.showModal();
    document.body.classList.add("gallery-player-open");
    syncPreviews();
    player.play().catch(() => {
      /* Native controls support manual playback. */
    });
  }

  dialog.addEventListener("close", () => {
    player.pause();
    player.removeAttribute("src");
    player.load();
    document.body.classList.remove("gallery-player-open");
    opener?.focus({ preventScroll: true });
    syncPreviews();
  });
  toggle.addEventListener("click", () => {
    previewsEnabled = !previewsEnabled;
    syncPreviews();
  });
  reducedMotion.addEventListener("change", () => {
    previewsEnabled = !reducedMotion.matches && !navigator.connection?.saveData;
    syncPreviews();
  });
  document.addEventListener("visibilitychange", syncPreviews);

  const choices = [
    {
      id: "featured",
      label: "Highlights",
      description:
        "A selection of terrain-adaptive behaviors, from everyday locomotion to whole-body motion.",
    },
    ...categories,
  ];
  const selectClips = (id) => {
    const selected = clips.filter((clip) =>
      id === "featured" ? clip.featured : clip.category === id,
    );
    return id === "featured"
      ? selected
      : selected.sort((a, b) => (a.categoryOrder ?? 0) - (b.categoryOrder ?? 0));
  };

  function render(id) {
    currentCategory = id;
    observer.disconnect();
    visible.clear();
    grid.querySelectorAll("video").forEach((video) => {
      video.pause();
      video.removeAttribute("src");
      video.load();
    });
    grid.replaceChildren();
    const selected = selectClips(id);
    const choice = choices.find((item) => item.id === id);
    summary.textContent = `${choice.label} · ${selected.length} clips`;
    description.textContent = choice.description;
    filters.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.category === id));
    });
    for (const clip of selected) {
      const card = document.createElement("article");
      card.className = "gallery-card";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "gallery-clip";
      button.setAttribute("aria-label", `Watch ${clip.title}`);
      const video = document.createElement("video");
      video.poster = clip.poster;
      video.dataset.src = clip.video;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.preload = "none";
      video.setAttribute("aria-hidden", "true");
      video.tabIndex = -1;
      const badge = document.createElement("span");
      badge.className = "gallery-play";
      badge.textContent = "↗ Watch clip";
      const duration = document.createElement("span");
      duration.className = "gallery-duration";
      const seconds = Math.round(clip.duration);
      duration.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
      button.append(video, badge, duration);
      button.addEventListener("click", () => openClip(clip, button));
      const copy = document.createElement("div");
      copy.className = "gallery-card-copy";
      const tags = document.createElement("p");
      tags.className = "gallery-tags";
      tags.textContent = `${clip.setting} / ${clip.terrain}`;
      const title = document.createElement("h3");
      title.textContent = clip.title;
      copy.append(tags, title);
      card.append(button, copy);
      grid.append(card);
      observer.observe(video);
    }
    syncPreviews();
  }

  for (const choice of choices) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.category = choice.id;
    button.setAttribute("aria-controls", "gallery-clips");
    button.textContent = `${choice.label} `;
    const count = document.createElement("span");
    count.textContent = selectClips(choice.id).length;
    count.setAttribute("aria-hidden", "true");
    button.append(count);
    button.addEventListener("click", () => {
      if (currentCategory !== choice.id) render(choice.id);
    });
    filters.append(button);
  }
  grid.id = "gallery-clips";
  render("featured");
  filters.hidden = false;
  section.querySelector("[data-gallery-toolbar]").hidden = false;
  section.querySelector("[data-gallery-fallback]").hidden = true;
}

if (section)
  initGallery().catch(() => {
    // The static link remains usable if fetching the gallery fails.
    section.querySelector("[data-gallery-fallback]").hidden = false;
  });
