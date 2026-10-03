const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p';

const $ = (id) => document.getElementById(id);
const els = {
    search: $('search'), chips: $('chips'), title: $('section-title'),
    error: $('error'), empty: $('empty'), grid: $('grid'),
    loading: $('loading'), loadMore: $('load-more'),
    tabBrowse: $('tab-browse'), tabList: $('tab-list'),
    overlay: $('overlay'), modal: $('modal'),
};
const state = {
    query: '',
    genre: null,
    genres: [],
    movies: [],
    page: 1,
    totalPages: 1,
    tab: 'browse',
};

let watchlist = loadWatchlist();
let requestId = 0; // used to ignore outdated responses

function loadWatchlist() {
    try { return JSON.parse(localStorage.getItem('watchlist')) || []; }
    catch { return []; }
}
function saveWatchlist() {
    localStorage.setItem('watchlist', JSON.stringify(watchlist));
}
function esc(text = '') {
    return String(text).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
    );
}
const isSaved = (id) => watchlist.some((m) => m.id === id);

async function tmdb(path, params = {}) {
    const query = new URLSearchParams({ api_key: CONFIG.TMDB_KEY, ...params });
    const res = await fetch(`${BASE}${path}?${query}`);
    if (!res.ok) {
        throw new Error(res.status === 401 ? 'Invalid API key. Check config.js.' : 'Failed to load data.');
    }
    return res.json();
}

function showError(message) {
    els.error.textContent = message;
    els.error.hidden = !message;
}

function cardHTML(m, inList) {
    const saved = isSaved(m.id);
    return `
    <div class="movie">
      <div class="poster" data-action="open" data-id="${m.id}">
        ${m.poster_path
            ? `<img src="${IMG}/w342${m.poster_path}" alt="${esc(m.title)}" loading="lazy" />`
            : '<div class="no-poster">No poster</div>'}
        <span class="rating">⭐ ${m.vote_average ? m.vote_average.toFixed(1) : 'N/A'}</span>
      </div>
      <div class="movie-info">
        <b title="${esc(m.title)}">${esc(m.title)}</b>
        <span class="muted">${m.release_date?.slice(0, 4) || 'TBA'}</span>
        <button class="${saved ? 'ghost' : ''}" data-action="save" data-id="${m.id}">
          ${saved ? '✓ Saved' : '+ Watchlist'}
        </button>
        ${inList
            ? `<button class="ghost" data-action="watched" data-id="${m.id}">
               ${m.watched ? '✓ Watched' : 'Mark watched'}
             </button>`
            : ''}
      </div>
    </div>`;
}

function render(loading = false) {
    const inList = state.tab === 'list';
    const shown = inList ? watchlist : state.movies;


    els.tabBrowse.className = inList ? 'ghost' : '';
    els.tabList.className = inList ? '' : 'ghost';
    els.tabList.textContent = `Watchlist (${watchlist.length})`;


    els.chips.hidden = inList;
    els.chips.innerHTML = state.genres
        .map((g) => `<button class="chip ${state.genre === g.id ? 'on' : ''}" data-id="${g.id}">${esc(g.name)}</button>`)
        .join('');


    if (inList) {
        const watched = watchlist.filter((m) => m.watched).length;
        els.title.textContent = `My Watchlist · ${watched}/${watchlist.length} watched`;
    } else if (state.query) {
        els.title.textContent = `Results for "${state.query}"`;
    } else if (state.genre) {
        els.title.textContent = state.genres.find((g) => g.id === state.genre)?.name || '';
    } else {
        els.title.textContent = 'Trending this week';
    }


    els.grid.innerHTML = shown.map((m) => cardHTML(m, inList)).join('');

    els.empty.hidden = loading || shown.length > 0;
    els.empty.textContent = inList
        ? 'Your watchlist is empty. Add movies from Browse.'
        : 'No movies found.';
    els.loading.hidden = !loading;
    els.loadMore.hidden = inList || loading || state.page >= state.totalPages;
}


async function loadMovies() {
    const id = ++requestId;
    let path = '/trending/movie/week';
    const params = { page: state.page };


    if (state.query) {
        path = '/search/movie';
        params.query = state.query;
    } else if (state.genre) {
        path = '/discover/movie';
        params.with_genres = state.genre;
        params.sort_by = 'popularity.desc';
    }

    showError('');
    render(true);

    try {
        const data = await tmdb(path, params);
        if (id !== requestId) return; // a newer request has started, ignore this one

        if (state.page === 1) {
            state.movies = data.results;
        } else {
            const fresh = data.results.filter((m) => !state.movies.some((p) => p.id === m.id));
            state.movies = [...state.movies, ...fresh];
        }
        state.totalPages = data.total_pages;
        render();
    } catch (err) {
        if (id !== requestId) return;
        showError(err.message);
        render();
    }
}


const closeBtn = '<button class="close" data-action="close" aria-label="Close">✕</button>';

async function openModal(movieId) {
    els.overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    els.modal.innerHTML = `${closeBtn}<p class="muted pad">Loading...</p>`;

    try {
        const m = await tmdb(`/movie/${movieId}`, { append_to_response: 'videos,credits' });
        const trailer = m.videos?.results.find((v) => v.site === 'YouTube' && v.type === 'Trailer');
        const runtime = m.runtime ? `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m` : '';
        const cast = (m.credits?.cast || []).slice(0, 6).map((c) => c.name).join(', ');

        els.modal.innerHTML = `
      ${closeBtn}
      ${m.backdrop_path ? `<img class="backdrop" src="${IMG}/w780${m.backdrop_path}" alt="" />` : ''}
      <div class="modal-body">
        <h2>${esc(m.title)}</h2>
        ${m.tagline ? `<p class="muted"><i>${esc(m.tagline)}</i></p>` : ''}
        <p class="facts">
          <span>⭐ ${m.vote_average?.toFixed(1)}</span>
          <span>${m.release_date?.slice(0, 4) || ''}</span>
          ${runtime ? `<span>${runtime}</span>` : ''}
        </p>
        <div class="chips">
          ${m.genres.map((g) => `<span class="chip static">${esc(g.name)}</span>`).join('')}
        </div>
        <p>${esc(m.overview) || 'No overview available.'}</p>
        ${cast ? `<p><b>Cast: </b><span class="muted">${esc(cast)}</span></p>` : ''}
        ${trailer
                ? `<a class="btn-link" href="https://www.youtube.com/watch?v=${trailer.key}" target="_blank" rel="noreferrer">▶ Watch trailer</a>`
                : ''}
      </div>`;
    } catch (err) {
        els.modal.innerHTML = `${closeBtn}<p class="error pad">${esc(err.message)}</p>`;
    }
}

function closeModal() {
    els.overlay.hidden = true;
    els.modal.innerHTML = '';
    document.body.style.overflow = '';
}



let timer;
els.search.addEventListener('input', () => {
    state.tab = 'browse';
    clearTimeout(timer);
    timer = setTimeout(() => {
        state.query = els.search.value.trim();
        state.page = 1;
        loadMovies();
    }, 500);
});


els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const id = Number(chip.dataset.id);
    state.query = '';
    els.search.value = '';
    state.genre = state.genre === id ? null : id;
    state.page = 1;
    loadMovies();
});


els.grid.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const id = Number(target.dataset.id);
    const action = target.dataset.action;

    if (action === 'open') return openModal(id);

    if (action === 'save') {
        const movie = [...state.movies, ...watchlist].find((m) => m.id === id);
        watchlist = isSaved(id)
            ? watchlist.filter((m) => m.id !== id)
            : [...watchlist, { ...movie, watched: false }];
    }

    if (action === 'watched') {
        watchlist = watchlist.map((m) => (m.id === id ? { ...m, watched: !m.watched } : m));
    }

    saveWatchlist();
    render();
});


els.tabBrowse.addEventListener('click', () => { state.tab = 'browse'; render(); });
els.tabList.addEventListener('click', () => { state.tab = 'list'; render(); });


els.loadMore.addEventListener('click', () => { state.page += 1; loadMovies(); });


els.overlay.addEventListener('click', (e) => {
    if (e.target === els.overlay || e.target.dataset.action === 'close') closeModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.overlay.hidden) closeModal();
});


async function init() {
    try {
        const data = await tmdb('/genre/movie/list');
        state.genres = data.genres;
    } catch {

    }
    loadMovies();
}
init();

document.getElementById('year').textContent = new Date().getFullYear();

document.querySelectorAll('a[data-fake]').forEach((link) => {
    link.addEventListener('click', (e) => e.preventDefault());
});

document.getElementById('back-to-top').addEventListener('click', (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

document.getElementById('newsletter').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('news-email');
    const msg = document.getElementById('news-msg');
    msg.textContent = `Thanks! ${input.value} is subscribed.`;
    msg.hidden = false;
    input.value = '';
});