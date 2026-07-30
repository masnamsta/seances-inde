const API_URL = "https://datacinesindes.fr/data-fair/api/v1/datasets/programmation-cinemas/lines?draft=false&size=500&page=1";

const state = {
  raw: [],
  shows: [],
  filtered: [],
  activeView: "home",
  selectedFilmId: null,
  selectedFilmTitle: "",
  previousView: "home",
  nextUrl: null,
  isLoadingMore: false,
  filters: {
    query: "",
    city: "",
    date: ""
  }
};
const contentArea = document.getElementById("content-area");
const statusEl = document.getElementById("status");
const searchInput = document.getElementById("search-input");
const cityFilter = document.getElementById("city-filter");
const dateFilter = document.getElementById("date-filter");
const resetFiltersBtn = document.getElementById("reset-filters");
const refreshDataBtn = document.getElementById("refresh-data");
const tabs = document.querySelectorAll(".tab");
const themeToggle = document.querySelector("[data-theme-toggle]");

function initTheme() {
  let theme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);

  themeToggle?.addEventListener("click", () => {
    theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", theme);
  });
}

function normalizeRow(row) {
  return {
    showId: row.showid || "",
    filmId: row.filmid || "",
    title: row.filmtitle || "Titre inconnu",
    poster: row.filmposter || "",
    trailer: row.filmtrailer || "",
    storyline: row.filmstoryline || "",
    genre: row.filmgenre || "",
    duration: row.filmduration || 0,
    director: row.filmdirector || "",
    cast: row.filmcast || "",
    country: row.filmcountry || "",
    version: row.filmversion || "",
    audio: row.filmaudio || "",
    cinemaId: row.cineid || "",
    cinemaName: row.cinename || row.cineenseigne || row.tag || "",
    address: row.cineadresse || "",
    city: row.cineville || "",
    postalCode: row.cinecp || "",
    auditorium: row.auditoriumnumber || "",
    start: row.showstart || "",
    end: row.showend || "",
    bookingUrl: row.showurl || "",
    lat: row["_coords.lat"] || null,
    lon: row["_coords.lon"] || null
  };
}

function formatDate(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  });
}

function formatTime(dateString) {
  if (!dateString) return "";
  return new Date(dateString).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDuration(seconds) {
  if (!seconds) return "";
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes.toString().padStart(2, "0")}` : `${minutes} min`;
}

function setStatus(message) {
  statusEl.textContent = message;
}

async function fetchShows() {
  setStatus("Chargement des séances…");
  contentArea.innerHTML = `
    <div class="loading-grid">
      <div class="skeleton card-skeleton"></div>
      <div class="skeleton card-skeleton"></div>
      <div class="skeleton card-skeleton"></div>
    </div>
  `;

  try {
    const res = await fetch(API_URL);
    if (!res.ok) throw new Error("Réponse API invalide");

      const json = await res.json();
    state.raw = json.results || [];
    state.shows = state.raw.map(normalizeRow);
    state.nextUrl = json.next || null;
    populateCityFilter();
    applyFilters();
    setStatus(`${state.shows.length} séances chargées.`);
  } catch (error) {
    console.error(error);
    setStatus("Impossible de charger les données.");
    contentArea.innerHTML = `
      <div class="empty-state">
        <p>Le chargement a échoué. Vérifie que l’API autorise bien l’accès depuis le navigateur.</p>
      </div>
    `;
  }
}
async function loadMoreShows() {
  if (!state.nextUrl || state.isLoadingMore) return;

  state.isLoadingMore = true;
  setStatus("Chargement de séances supplémentaires…");

  try {
    const res = await fetch(state.nextUrl);
    if (!res.ok) throw new Error("Réponse API invalide");

    const json = await res.json();
    const newRaw = json.results || [];
    const newShows = newRaw.map(normalizeRow);

    state.raw = [...state.raw, ...newRaw];
    state.shows = [...state.shows, ...newShows];
    state.nextUrl = json.next || null;

    populateCityFilter();
    applyFilters();
    setStatus(`${state.shows.length} séances chargées.`);
  } catch (error) {
    console.error(error);
    setStatus("Impossible de charger plus de séances.");
  } finally {
    state.isLoadingMore = false;
  }
}
function populateCityFilter() {
  const cities = [...new Set(state.shows.map(item => item.city).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "fr")
  );

  cityFilter.innerHTML = `<option value="">Toutes les villes</option>` +
    cities.map(city => `<option value="${escapeHtml(city)}">${escapeHtml(city)}</option>`).join("");
}

function applyFilters() {
  const q = state.filters.query.toLowerCase().trim();
  const city = state.filters.city;
  const date = state.filters.date;

  state.filtered = state.shows.filter(item => {
    const title = (item.title || "").toLowerCase();
    const genre = (item.genre || "").toLowerCase();
    const cityName = item.city || "";
    const itemDate = item.start ? item.start.slice(0, 10) : "";

    const matchQuery = !q || title.includes(q) || genre.includes(q);
    const matchCity = !city || cityName === city;
    const matchDate = !date || itemDate === date;

    return matchQuery && matchCity && matchDate;
  });

  renderView();
}

function groupByFilm(items) {
  const map = new Map();

  items.forEach(item => {
    const key = item.filmId || item.title;
    if (!map.has(key)) {
      map.set(key, {
        filmId: item.filmId,
        title: item.title,
        poster: item.poster,
        genre: item.genre,
        duration: item.duration,
        director: item.director,
        storyline: item.storyline,
        shows: []
      });
    }
    map.get(key).shows.push(item);
  });

  return [...map.values()].sort((a, b) => b.shows.length - a.shows.length);
}

function groupByCinema(items) {
  const map = new Map();

  items.forEach(item => {
    const key = item.cinemaId || `${item.city}-${item.address}`;
    if (!map.has(key)) {
      map.set(key, {
        cinemaId: item.cinemaId,
        name: item.cinemaName || "Cinéma indépendant",
        city: item.city,
        address: item.address,
        lat: item.lat,
        lon: item.lon,
        shows: []
      });
    }
    map.get(key).shows.push(item);
  });

  return [...map.values()].sort((a, b) => (a.city || "").localeCompare(b.city || "", "fr"));
}
function openFilmDetail(filmId, filmTitle = "") {
  state.selectedFilmId = filmId || null;
  state.selectedFilmTitle = filmTitle || "";
  state.previousView = state.activeView;
  state.activeView = "film-detail";
  renderView();
}

function closeFilmDetail() {
  state.selectedFilmId = null;
  state.selectedFilmTitle = "";
  state.activeView = state.previousView || "films";
  renderView();
}

function getSelectedFilmData() {
  const grouped = groupByFilm(state.filtered);
  return grouped.find(film =>
    state.selectedFilmId
      ? film.filmId === state.selectedFilmId
      : film.title === state.selectedFilmTitle
  );
}
function getTodayShows(items) {
  const today = new Date().toISOString().slice(0, 10);
  return items.filter(item => item.start && item.start.slice(0, 10) === today);
}

function getTopFilms(items, limit = 6) {
  return groupByFilm(items).slice(0, limit);
}

function getTopCinemas(items, limit = 6) {
  return groupByCinema(items)
    .sort((a, b) => b.shows.length - a.shows.length)
    .slice(0, limit);
}

function renderView() {
  tabs.forEach(tab => {
    tab.classList.toggle("is-active", tab.dataset.view === state.activeView);
  });

  if (!state.filtered.length) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <p>Aucun résultat avec les filtres actuels.</p>
      </div>
    `;
    return;
  }

  if (state.activeView === "home") renderHome();
  if (state.activeView === "agenda") renderAgenda();
  if (state.activeView === "films") renderFilms();
  if (state.activeView === "cinemas") renderCinemas();
  if (state.activeView === "film-detail") renderFilmDetail(); 
}

function renderHome() {
  const todayShows = getTodayShows(state.filtered).slice(0, 8);
  const topFilms = getTopFilms(state.filtered, 6);
  const topCinemas = getTopCinemas(state.filtered, 6);

  contentArea.innerHTML = `
    <section>
      <div class="section-title">
        <h3>Ce soir</h3>
        <p class="small">${todayShows.length} séance(s)</p>
      </div>
      ${todayShows.length ? `
        <div class="list">
          ${todayShows.map(show => renderShowItem(show)).join("")}
        </div>
      ` : `
        <div class="empty-state"><p>Aucune séance pour aujourd’hui dans le jeu filtré.</p></div>
      `}
    </section>

    <section style="margin-top:2rem;">
      <div class="section-title">
        <h3>Films à l’affiche</h3>
      </div>
      <div class="grid grid-cards">
        ${topFilms.map(film => renderFilmCard(film)).join("")}
      </div>
    </section>

    <section style="margin-top:2rem;">
      <div class="section-title">
        <h3>Cinémas</h3>
      </div>
      <div class="grid grid-cards">
        ${topCinemas.map(cinema => renderCinemaCard(cinema)).join("")}
      </div>
    </section>

    ${renderLoadMoreButton()}
  `;

  bindDynamicEvents();
  document.getElementById("load-more-btn")?.addEventListener("click", loadMoreShows);
}

function renderAgenda() {
  const sorted = [...state.filtered].sort((a, b) => new Date(a.start) - new Date(b.start));
  contentArea.innerHTML = `
    <section>
      <div class="section-title">
        <h3>Agenda</h3>
        <p class="small">${sorted.length} séance(s)</p>
      </div>
          <div class="list">
        ${sorted.map(show => renderShowItem(show)).join("")}
      </div>
      ${renderLoadMoreButton()}
    </section>
  `;
  document.getElementById("load-more-btn")?.addEventListener("click", loadMoreShows);
}

function renderFilms() {
  const films = groupByFilm(state.filtered);
  contentArea.innerHTML = `
    <section>
      <div class="section-title">
        <h3>Films</h3>
        <p class="small">${films.length} film(s)</p>
      </div>
        <div class="grid grid-cards">
        ${films.map(film => renderFilmCard(film)).join("")}
      </div>
      ${renderLoadMoreButton()}
    </section>
  `;
  bindDynamicEvents();
  document.getElementById("load-more-btn")?.addEventListener("click", loadMoreShows);
}

function renderCinemas() {
  const cinemas = groupByCinema(state.filtered);
  contentArea.innerHTML = `
    <section>
      <div class="section-title">
        <h3>Cinémas</h3>
        <p class="small">${cinemas.length} cinéma(s)</p>
      </div>
          <div class="grid grid-cards">
        ${cinemas.map(cinema => renderCinemaCard(cinema)).join("")}
      </div>
      ${renderLoadMoreButton()} 
    </section>
  `;
  bindDynamicEvents();
  document.getElementById("load-more-btn")?.addEventListener("click", loadMoreShows);
}
function renderFilmDetail() {
  const film = getSelectedFilmData();

  if (!film) {
    contentArea.innerHTML = `
      <div class="empty-state">
        <p>Impossible de retrouver ce film dans les résultats actuels.</p>
        <p style="margin-top:1rem;">
          <button class="btn btn-secondary" type="button" id="back-to-list">Retour</button>
        </p>
      </div>
    `;

    document.getElementById("back-to-list")?.addEventListener("click", closeFilmDetail);
    return;
  }

  const sortedShows = [...film.shows].sort((a, b) => new Date(a.start) - new Date(b.start));

  contentArea.innerHTML = `
    <section class="film-detail">
      <div class="detail-back">
        <button class="btn btn-secondary" type="button" id="back-to-list">← Retour</button>
      </div>

      <article class="detail-layout">
        <div class="detail-poster-wrap">
          ${film.poster ? `<img class="detail-poster" src="${escapeAttribute(film.poster)}" alt="Affiche de ${escapeAttribute(film.title)}" loading="lazy">` : `<div class="detail-poster detail-poster-fallback"></div>`}
        </div>

        <div class="detail-main">
          <span class="pill">${film.shows.length} séance(s)</span>
          <h3 class="detail-title">${escapeHtml(film.title)}</h3>

          <div class="detail-meta">
            ${film.genre ? `<span>${escapeHtml(film.genre)}</span>` : ""}
            ${film.duration ? `<span>${escapeHtml(formatDuration(film.duration))}</span>` : ""}
            ${film.director ? `<span>Réalisation : ${escapeHtml(film.director)}</span>` : ""}
          </div>

          ${film.storyline ? `
            <div class="detail-block">
              <h4>Synopsis</h4>
              <p>${escapeHtml(film.storyline)}</p>
            </div>
          ` : ""}

          <div class="detail-block">
            <h4>Séances</h4>
            <div class="list">
              ${sortedShows.map(show => renderShowItem(show)).join("")}
            </div>
          </div>
        </div>
      </article>
    </section>
  `;

  document.getElementById("back-to-list")?.addEventListener("click", closeFilmDetail);
}
function renderShowItem(show) {
  return `
    <article class="show-item">
      <div class="timebox">
        <div>
          <div class="small">${escapeHtml(formatDate(show.start))}</div>
          <strong>${escapeHtml(formatTime(show.start))}</strong>
        </div>
      </div>

      <div>
        <h3>${escapeHtml(show.title)}</h3>
        <p class="meta">${escapeHtml(show.city || "Ville inconnue")} · ${escapeHtml(show.address || "Adresse non renseignée")}</p>
        <p class="small">${escapeHtml(show.genre || "Genre non renseigné")}${show.duration ? ` · ${escapeHtml(formatDuration(show.duration))}` : ""}</p>
      </div>

      <div class="actions-inline">
        ${show.bookingUrl ? `<a class="link-btn" href="${escapeAttribute(show.bookingUrl)}" target="_blank" rel="noopener noreferrer">Réserver</a>` : ""}
      </div>
    </article>
  `;
}

function renderFilmCard(film) {
  const firstShow = [...film.shows].sort((a, b) => new Date(a.start) - new Date(b.start))[0];

  return `
    <article class="card film-card" data-film-id="${escapeAttribute(film.filmId || "")}" data-film-title="${escapeAttribute(film.title)}" tabindex="0" role="button" aria-label="Voir le détail du film ${escapeAttribute(film.title)}">
      ${film.poster ? `<img class="poster" src="${escapeAttribute(film.poster)}" alt="Affiche de ${escapeAttribute(film.title)}" loading="lazy">` : ""}
      <div class="card-body">
        <span class="pill">${film.shows.length} séance(s)</span>
        <h3 style="margin-top:0.75rem;">${escapeHtml(film.title)}</h3>
        <p class="meta">${escapeHtml(film.genre || "Genre non renseigné")}</p>
        <p class="small">${film.duration ? escapeHtml(formatDuration(film.duration)) : ""}</p>
        <p class="small">${firstShow ? `Prochaine séance : ${escapeHtml(formatDate(firstShow.start))} à ${escapeHtml(formatTime(firstShow.start))}` : ""}</p>
      </div>
    </article>
  `;
}
function renderCinemaCard(cinema) {
  const filmCount = new Set(cinema.shows.map(item => item.filmId || item.title)).size;
  return `
    <article class="card">
      <div class="card-body">
        <span class="pill">${cinema.shows.length} séance(s)</span>
        <h3 style="margin-top:0.75rem;">${escapeHtml(cinema.name || "Cinéma indépendant")}</h3>
        <p class="meta">${escapeHtml(cinema.city || "Ville inconnue")}</p>
        <p class="small">${escapeHtml(cinema.address || "Adresse non renseignée")}</p>
        <p class="small">${filmCount} film(s) programmé(s)</p>
      </div>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value);
}
function bindDynamicEvents() {
  document.querySelectorAll(".film-card").forEach(card => {
    const open = () => openFilmDetail(card.dataset.filmId || null, card.dataset.filmTitle || "");

    card.addEventListener("click", open);
    card.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}
function renderLoadMoreButton() {
  const hasActiveFilters =
    state.filters.query.trim() !== "" ||
    state.filters.city !== "" ||
    state.filters.date !== "";

  if (!state.nextUrl || hasActiveFilters) return "";

  return `
    <div style="margin-top:1.5rem; display:flex; justify-content:center;">
      <button id="load-more-btn" class="btn btn-secondary" type="button">
        ${state.isLoadingMore ? "Chargement..." : "Charger plus"}
      </button>
    </div>
  `;
}
searchInput.addEventListener("input", e => {
  state.filters.query = e.target.value;
  applyFilters();
});

cityFilter.addEventListener("change", e => {
  state.filters.city = e.target.value;
  applyFilters();
});

dateFilter.addEventListener("change", e => {
  state.filters.date = e.target.value;
  applyFilters();
});

resetFiltersBtn.addEventListener("click", () => {
  state.filters = { query: "", city: "", date: "" };
  searchInput.value = "";
  cityFilter.value = "";
  dateFilter.value = "";
  applyFilters();
});

refreshDataBtn.addEventListener("click", fetchShows);

tabs.forEach(tab => {
  tab.addEventListener("click", () => {
    state.activeView = tab.dataset.view;
    renderView();
  });
});

initTheme();
fetchShows();
