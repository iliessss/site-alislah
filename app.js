window.addEventListener("DOMContentLoaded", () => {
  const IS_WHATSAPP = /WhatsApp/i.test(navigator.userAgent);

  const els = {
    catalogue: document.getElementById("catalogue-view"),
    course: document.getElementById("course-view"),
    list: document.getElementById("courses"),
    back: document.getElementById("back"),
    title: document.getElementById("course-title"),
    teacher: document.getElementById("course-teacher"),
    desc: document.getElementById("course-desc"),
    audio: document.getElementById("audio"),
    supportsDiv: document.getElementById("supports"),
    zoomBlock: document.getElementById("zoom-block"),
    zoomLink: document.getElementById("zoom-link"),
    homeLink: document.getElementById("home-link"),

    // Modal mdp
    pwModal: document.getElementById("pw-modal"),
    pwTitle: document.getElementById("pw-title"),
    pwSubtitle: document.getElementById("pw-subtitle"),
    pwInput: document.getElementById("pw-input"),
    pwOk: document.getElementById("pw-ok"),
    pwCancel: document.getElementById("pw-cancel"),
    pwError: document.getElementById("pw-error"),

    // PDF inline viewer
    pdfInline: document.getElementById("pdf-inline"),
    pdfIframe: document.getElementById("pdf-iframe"),
    pdfInlineTitle: document.getElementById("pdf-inline-title"),
    pdfInlineClose: document.getElementById("pdf-inline-close"),

    videoInline: document.getElementById("video-inline"),
    videoIframe: document.getElementById("video-iframe"),
    videoInlineTitle: document.getElementById("video-inline-title"),
    videoInlineClose: document.getElementById("video-inline-close"),
  };

  const courses = Array.isArray(window.courses) ? window.courses : [];
  if (!courses.length && els.list) {
    els.list.innerHTML =
      `<div class="home-card"><div class="home-body"><p class="muted">Aucun cours chargé. Vérifie <code>courses.js</code>.</p></div></div>`;
  }

  let active = null;
  let openingSlug = null;
  let lastPrompt = { slug: null, t: 0 };
  let ignoreFirstPopstate = true;

  // Password modal state
  let pwBusy = false;
  let lastPwCheck = { slug: null, t: 0, ok: false };

  const esc = (s) => (s ?? "").toString().trim();

  function cleanUrl(url) {
    const u = (url ?? "")
      .toString()
      .trim()
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "");
    if (!u) return "";
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return "https:" + u;
    return u;
  }

  function linkOrSpan(label, url) {
    const u = cleanUrl(url);
    return u
      ? `<a href="${u}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : `<span class="muted">${label} indisponible</span>`;
  }

  function isYouTubeUrl(url) {
    return /(?:youtube\.com|youtube-nocookie\.com|youtu\.be)\//i.test(url);
  }

  function canOpenInline(url) {
    if (isYouTubeUrl(url)) return false;
    return /(?:drive\.google\.com|player\.vimeo\.com|vimeo\.com)\//i.test(url);
  }

  function courseMeta(c) {
    if (c.slug === "alphabetisation-homme") return { icon: "🧔🏻‍♂️", badge: "Hommes" };
    if (c.slug === "alphabetisation-femme") return { icon: "🧕🏼", badge: "Femmes" };
    if (c.slug === "tajwid") return { icon: "📖", badge: "Mixte" };
    return { icon: "📚", badge: "" };
  }

  // ===== PDF INLINE =====
  function hidePdfInline() {
    if (!els.pdfInline) return;
    els.pdfInline.classList.add("hidden");
    els.pdfInline.setAttribute("aria-hidden", "true");
    if (els.pdfIframe) els.pdfIframe.src = "";
  }

  function showPdfInline(url, title = "Fiche PDF") {
    const u = cleanUrl(url);
    if (!u || !els.pdfInline || !els.pdfIframe) return;

    // WhatsApp iOS : très fragile => ouvrir externe direct (le plus fiable)
    if (IS_WHATSAPP) {
      window.open(u, "_blank", "noopener");
      return;
    }

    // Masque la toolbar (ça dépend du navigateur)
    const withParams = u.includes("#") ? u : (u + "#toolbar=0&navpanes=0&scrollbar=0");

    els.pdfInlineTitle.textContent = title;
    els.pdfIframe.src = withParams;

    els.pdfInline.classList.remove("hidden");
    els.pdfInline.setAttribute("aria-hidden", "false");
    els.pdfInline.scrollIntoView({ behavior: "smooth", block: "start" });

    // Fallback: si au bout de 1.5s l’iframe n’a pas chargé, on ouvre externe
    // (sur iOS certains viewers ne déclenchent pas onload => on garde une sécurité légère)
    let done = false;

    const onOk = () => { done = true; cleanup(); };
    const onErr = () => { done = true; cleanup(); window.open(u, "_blank", "noopener"); };

    const cleanup = () => {
      els.pdfIframe.removeEventListener("load", onOk);
      els.pdfIframe.removeEventListener("error", onErr);
    };

    els.pdfIframe.addEventListener("load", onOk, { once: true });
    els.pdfIframe.addEventListener("error", onErr, { once: true });

    setTimeout(() => {
      if (!done) {
        // Si ça paraît bloqué, on bascule externe (évite écran “vide”)
        cleanup();
        window.open(u, "_blank", "noopener");
      }
    }, 1500);
  }

  els.pdfInlineClose?.addEventListener("click", hidePdfInline);

  // ===== Password modal (async) =====
  function askPasswordEveryTime(course) {
    if (!course.password) return Promise.resolve(true);

    const now = Date.now();
    if (lastPwCheck.slug === course.slug && now - lastPwCheck.t < 1200) {
      return Promise.resolve(lastPwCheck.ok);
    }
    if (pwBusy) return Promise.resolve(false);
    pwBusy = true;

    return new Promise((resolve) => {
      if (!els.pwModal || !els.pwInput || !els.pwOk || !els.pwCancel) {
        pwBusy = false;
        const entered = prompt(
          `Mot de passe requis :\n${course.titre}\n\nEntrez le mot de passe :`
        );
        if (entered === null) return resolve(false);
        const ok = entered.trim() === String(course.password).trim();
        lastPwCheck = { slug: course.slug, t: Date.now(), ok };
        return resolve(ok);
      }

      els.pwError.style.display = "none";
      els.pwError.textContent = "";
      els.pwSubtitle.textContent = course.titre || "";
      els.pwInput.value = "";

      els.pwModal.classList.remove("hidden");
      els.pwModal.setAttribute("aria-hidden", "false");

      const close = (ok) => {
        els.pwModal.classList.add("hidden");
        els.pwModal.setAttribute("aria-hidden", "true");
        pwBusy = false;
        lastPwCheck = { slug: course.slug, t: Date.now(), ok };
        resolve(ok);
      };

      const validate = () => {
        const entered = (els.pwInput.value || "").trim();
        const target = String(course.password).trim();

        if (entered === target) return close(true);

        els.pwError.textContent = "Mot de passe incorrect.";
        els.pwError.style.display = "block";
        els.pwInput.focus();
        els.pwInput.select();
      };

      els.pwOk.onclick = () => validate();
      els.pwCancel.onclick = () => close(false);
      els.pwInput.onkeydown = (e) => {
        if (e.key === "Enter") validate();
        if (e.key === "Escape") close(false);
      };

      setTimeout(() => els.pwInput.focus(), 0);
    });
  }

  function hideVideoInline() {
  if (!els.videoInline) return;
  els.videoInline.classList.add("hidden");
  els.videoInline.setAttribute("aria-hidden", "true");
  if (els.videoIframe) els.videoIframe.src = "";
}

function toEmbedUrl(url) {
  const u = cleanUrl(url);

  // YouTube normal -> embed
  // https://www.youtube.com/watch?v=VIDEO_ID
  // https://youtu.be/VIDEO_ID
  const ytWatch = u.match(/youtube\.com\/watch\?v=([^&]+)/i);
  const ytShort = u.match(/youtu\.be\/([^?&]+)/i);
  if (ytWatch) return `https://www.youtube.com/embed/${ytWatch[1]}`;
  if (ytShort) return `https://www.youtube.com/embed/${ytShort[1]}`;

  // Vimeo -> embed
  const vimeo = u.match(/vimeo\.com\/(\d+)/i);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;

  // Sinon on tente tel quel (si déjà une URL embed)
  return u;
}

function showVideoInline(url, title = "Replay") {
  const u = cleanUrl(url);
  if (!u || !els.videoInline || !els.videoIframe) return;

  els.videoInlineTitle.textContent = title;
  els.videoIframe.src = toEmbedUrl(u);

  els.videoInline.classList.remove("hidden");
  els.videoInline.setAttribute("aria-hidden", "false");
  els.videoInline.scrollIntoView({ behavior: "smooth", block: "start" });
}

els.videoInlineClose?.addEventListener("click", hideVideoInline);

  function renderHome() {
    if (!els.list) return;

    els.list.innerHTML = courses
      .map((c) => {
        const m = courseMeta(c);
        return `
          <div class="home-card">
            <div class="cap">
              <div class="home-icon" aria-hidden="true">${m.icon}</div>
              <h3>${c.titre || ""}</h3>
              ${m.badge ? `<div class="home-badge">${m.badge}</div>` : ``}
            </div>
            <div class="home-body">
              ${(c.description || "").replace(/\n/g, "<br>")}
            </div>
            <div class="home-actions">
              <button class="btn" data-open="${c.slug}" type="button">Accéder au cours →</button>
            </div>
          </div>
        `;
      })
      .join("");

    els.list.querySelectorAll("[data-open]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        await openCourse(btn.dataset.open);
        setTimeout(() => (btn.disabled = false), 400);
      });
    });
  }

  async function openCourse(slug) {
    if (!slug) return;

    if (openingSlug === slug) return;
    openingSlug = slug;

    try {
      if (active?.slug === slug && !els.course.classList.contains("hidden")) return;

      const c = courses.find((x) => x.slug === slug);
      if (!c) return;

      const now = Date.now();
      const shouldPrompt = !(lastPrompt.slug === slug && now - lastPrompt.t < 1200);
      if (shouldPrompt) {
        lastPrompt = { slug, t: now };
        const ok = await askPasswordEveryTime(c);
        if (!ok) return;
      }

      active = c;

      // cacher le PDF inline quand on change de page/cours
      hidePdfInline();
      hideVideoInline();

      els.title.textContent = c.titre || "";
      els.teacher.textContent = c.enseignant || "";
      els.desc.innerHTML = (c.description || "").replace(/\n/g, "<br>");

      // Zoom
      if (c.zoomUrl) {
        const z = cleanUrl(c.zoomUrl);
        if (z) {
          els.zoomLink.href = z;
          els.zoomBlock.style.display = "block";
        } else {
          els.zoomBlock.style.display = "none";
          els.zoomLink.removeAttribute("href");
        }
      } else {
        els.zoomBlock.style.display = "none";
        els.zoomLink.removeAttribute("href");
      }

      // Audio
      if (c.audioUrl) {
        els.audio.src = c.audioUrl;
        els.audio.style.display = "block";
      } else {
        els.audio.removeAttribute("src");
        els.audio.style.display = "none";
      }

      // ===== Supports =====
      const replayHtml =
        Array.isArray(c.replays) && c.replays.length
          ? `
            <h3>Replay</h3>
            <ul>
              ${c.replays
                .map((r) => {
                  const replayUrl = cleanUrl(r.url);
                  const replayTitle = esc(r.titre);

                  if (!replayUrl) {
                    return `<li><span class="muted">${replayTitle} indisponible</span></li>`;
                  }

                  const inlineAttrs = canOpenInline(replayUrl)
                    ? `class="video-inline-link" data-video="${replayUrl}" data-title="${replayTitle}"`
                    : "";

                  return `
                    <li>
                      <a href="${replayUrl}" ${inlineAttrs} target="_blank" rel="noopener noreferrer">
                        ${replayTitle}
                      </a>
                    </li>
                  `;
                })
                .join("")}
            </ul>
          `
          : "";

      const fichesHtml =
        Array.isArray(c.supports) && c.supports.length
          ? `
            <h3>Fiches</h3>
            <ul>
              ${c.supports
                .map((s) => {
                  const coursLink = linkOrSpan("Explication des fiches", s.cours);
                  const corrLink = linkOrSpan("Correction", s.correction);

                  const pdfUrl = cleanUrl(s.pdf);
                  const pdfLink = pdfUrl
                    ? `<a href="${pdfUrl}" class="pdf-inline-link" data-pdf="${pdfUrl}" data-title="${esc(s.titre)}">Fiche PDF</a>`
                    : `<span class="muted">Fiche PDF indisponible</span>`;

                  return `
                    <li>
                      <strong>${esc(s.titre)}</strong>
                      <div style="display:flex; gap:12px; margin-top:4px; flex-wrap:wrap;">
                        ${coursLink}
                        ${corrLink}
                        ${pdfLink}
                      </div>
                    </li>
                  `;
                })
                .join("")}
            </ul>
          `
          : `<p class="muted">Aucun support pour le moment.</p>`;

      els.supportsDiv.innerHTML = replayHtml + fichesHtml;

      els.supportsDiv.querySelectorAll(".video-inline-link").forEach((a) => {
  a.addEventListener("click", (e) => {
    e.preventDefault();
    const url = a.getAttribute("data-video");
    const title = a.getAttribute("data-title") || "Replay";
    showVideoInline(url, title);
  });
});

      // intercepte les clics PDF pour affichage inline
      els.supportsDiv.querySelectorAll(".pdf-inline-link").forEach((a) => {
        a.addEventListener("click", (e) => {
          e.preventDefault();
          const url = a.getAttribute("data-pdf");
          const title = a.getAttribute("data-title") || "Fiche PDF";
          showPdfInline(url, title);
        });
      });

      // show
      els.catalogue.classList.add("hidden");
      els.course.classList.remove("hidden");

      if (location.hash !== `#${slug}`) {
        history.pushState({ slug }, "", `#${slug}`);
      }
    } finally {
      openingSlug = null;
    }
  }

  function backToHome() {
  hidePdfInline();
  hideVideoInline();
  els.course.classList.add("hidden");
  els.catalogue.classList.remove("hidden");
  if (location.hash !== "#") history.pushState({}, "", "#");
}

  els.homeLink?.addEventListener("click", backToHome);
  els.back?.addEventListener("click", backToHome);

  window.addEventListener("popstate", () => {
    if (ignoreFirstPopstate) {
      ignoreFirstPopstate = false;
      return;
    }
    const slug = location.hash.replace("#", "");
    if (slug) openCourse(slug);
    else backToHome();
  });

  renderHome();
  const initialSlug = location.hash.replace("#", "");
  if (initialSlug) openCourse(initialSlug);
});
