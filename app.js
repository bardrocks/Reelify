// ===== Reelify App with TMDB API =====

const TMDB_API_KEY = 'ade47b730c1d2be154529d2f4f002162';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const TMDB_IMG = 'https://image.tmdb.org/t/p';

class ReelifyApp {
    constructor() {
        this.localMovies = window.MOVIES || [];
        this.moodKeywords = window.MOOD_KEYWORDS || {};
        this.searchMappings = window.SEARCH_MAPPINGS || {};
        this.currentFilter = 'all';
        this.currentMood = null;
        this.currentPage = 1;
        this.currentMovies = [];
        this.isLoading = false;

        // Collection from localStorage
        this.watchlist = JSON.parse(localStorage.getItem('reelify_watchlist') || '[]');
        this.watched = JSON.parse(localStorage.getItem('reelify_watched') || '[]');
        this.ratings = JSON.parse(localStorage.getItem('reelify_ratings') || '{}');

        this.init();
    }

    init() {
        this.bindEvents();
        this.loadPopularMovies();
    }

    // ===== TMDB API Functions =====
    async fetchTMDB(endpoint, params = {}) {
        const url = new URL(`${TMDB_BASE}${endpoint}`);
        url.searchParams.append('api_key', TMDB_API_KEY);
        url.searchParams.append('language', 'tr-TR');
        Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

        try {
            const res = await fetch(url);
            return await res.json();
        } catch (e) {
            console.error('TMDB Error:', e);
            return null;
        }
    }

    async loadPopularMovies(page = 1) {
        this.showLoading();
        const data = await this.fetchTMDB('/movie/popular', { page });
        if (data?.results?.length) {
            const movies = await this.enrichMovies(data.results);
            this.displayResults(movies, 'Popüler Filmler', data.total_results);
        } else {
            // Fallback to local movies
            this.displayResults(this.localMovies, 'Popüler Filmler', this.localMovies.length);
        }
        this.hideLoading();
    }

    async searchMoviesAPI(query, page = 1) {
        this.showLoading();
        const data = await this.fetchTMDB('/search/movie', { query, page });
        if (data?.results?.length) {
            const movies = await this.enrichMovies(data.results);
            this.displayResults(movies, `"${query}" için sonuçlar`, data.total_results);
        } else {
            // Local search fallback
            const lower = query.toLowerCase();
            const results = this.localMovies.filter(m =>
                m.title.toLowerCase().includes(lower) ||
                m.keywords?.some(k => k.includes(lower))
            );
            this.displayResults(results, `"${query}" için sonuçlar`, results.length);
        }
        this.hideLoading();
    }

    async discoverByMood(mood, page = 1) {
        const genreMap = {
            sad: '18', happy: '35', relaxed: '10751', excited: '28',
            romantic: '10749', scared: '27', thoughtful: '878', nostalgic: '36'
        };
        this.showLoading();
        const data = await this.fetchTMDB('/discover/movie', {
            with_genres: genreMap[mood] || '18',
            sort_by: 'popularity.desc',
            page
        });
        if (data?.results) {
            const movies = await this.enrichMovies(data.results);
            const labels = { sad: '😢 Üzgün', happy: '😄 Mutlu', relaxed: '😌 Rahat', excited: '🤩 Heyecanlı', romantic: '🥰 Romantik', scared: '😱 Korkulu', thoughtful: '🤔 Düşünceli', nostalgic: '🥲 Nostaljik' };
            this.displayResults(movies, `${labels[mood]} ruh haline uygun`, data.total_results);
        }
        this.hideLoading();
    }

    async getMovieDetails(movieId) {
        const [details, videos, providers] = await Promise.all([
            this.fetchTMDB(`/movie/${movieId}`, { append_to_response: 'credits' }),
            this.fetchTMDB(`/movie/${movieId}/videos`),
            this.fetchTMDB(`/movie/${movieId}/watch/providers`)
        ]);
        return { details, videos, providers };
    }

    async enrichMovies(movies) {
        return movies.map(m => ({
            id: m.id,
            title: m.title,
            originalTitle: m.original_title || m.title,
            year: m.release_date?.split('-')[0] || 'N/A',
            duration: m.runtime || 120,
            rating: m.vote_average?.toFixed(1) || 'N/A',
            imdb: m.vote_average?.toFixed(1) || 'N/A',
            poster: m.poster_path ? `${TMDB_IMG}/w500${m.poster_path}` : 'https://via.placeholder.com/500x750?text=No+Poster',
            backdrop: m.backdrop_path ? `${TMDB_IMG}/original${m.backdrop_path}` : null,
            overview: m.overview || 'Açıklama mevcut değil.',
            genres: m.genre_ids || [],
            reason: null
        }));
    }

    // Generate dynamic AI review based on movie data
    generateAIReview(movie) {
        const genres = movie.genres || [];
        const rating = parseFloat(movie.rating) || 7;
        const overview = movie.overview || '';

        // Genre-based pros and cons
        const genreReviews = {
            'Action': { pros: ['Nefes kesen aksiyon sahneleri', 'Adrenalin dolu anlar'], cons: ['Bazı sahneler fazla şiddet içerebilir'] },
            'Aksiyon': { pros: ['Nefes kesen aksiyon sahneleri', 'Adrenalin dolu anlar'], cons: ['Bazı sahneler fazla şiddet içerebilir'] },
            'Comedy': { pros: ['Eğlenceli ve güldüren anlar', 'Hafif bir izleme deneyimi'], cons: ['Mizah tarzı herkese hitap etmeyebilir'] },
            'Komedi': { pros: ['Eğlenceli ve güldüren anlar', 'Hafif bir izleme deneyimi'], cons: ['Mizah tarzı herkese hitap etmeyebilir'] },
            'Drama': { pros: ['Duygusal derinlik', 'Etkileyici karakter gelişimi'], cons: ['Yavaş tempo bazılarını sıkabilir'] },
            'Dram': { pros: ['Duygusal derinlik', 'Etkileyici karakter gelişimi'], cons: ['Yavaş tempo bazılarını sıkabilir'] },
            'Horror': { pros: ['Gerilim dolu atmosfer', 'Etkili korku sahneleri'], cons: ['Hassas izleyiciler için rahatsız edici olabilir'] },
            'Korku': { pros: ['Gerilim dolu atmosfer', 'Etkili korku sahneleri'], cons: ['Hassas izleyiciler için rahatsız edici olabilir'] },
            'Romance': { pros: ['Romantik ve duygusal anlar', 'Güzel kimya'], cons: ['Klişe anlar içerebilir'] },
            'Romantik': { pros: ['Romantik ve duygusal anlar', 'Güzel kimya'], cons: ['Klişe anlar içerebilir'] },
            'Science Fiction': { pros: ['Yaratıcı bilim kurgu konsepti', 'Görsel efektler etkileyici'], cons: ['Bazı bilimsel detaylar gerçekçi olmayabilir'] },
            'Bilim Kurgu': { pros: ['Yaratıcı bilim kurgu konsepti', 'Görsel efektler etkileyici'], cons: ['Bazı bilimsel detaylar gerçekçi olmayabilir'] },
            'Thriller': { pros: ['Sürekli merak uyandıran hikaye', 'Tahmin edilemez gelişmeler'], cons: ['Gerilim sevmeyenler için yorucu olabilir'] },
            'Gerilim': { pros: ['Sürekli merak uyandıran hikaye', 'Tahmin edilemez gelişmeler'], cons: ['Gerilim sevmeyenler için yorucu olabilir'] },
            'Animation': { pros: ['Görsel olarak büyüleyici', 'Her yaştan izleyiciye uygun'], cons: ['Yetişkinler için basit gelebilir'] },
            'Animasyon': { pros: ['Görsel olarak büyüleyici', 'Her yaştan izleyiciye uygun'], cons: ['Yetişkinler için basit gelebilir'] },
            'Adventure': { pros: ['Macera dolu hikaye', 'Keşfetme hissi veriyor'], cons: ['Bazı bölümler uzun gelebilir'] },
            'Macera': { pros: ['Macera dolu hikaye', 'Keşfetme hissi veriyor'], cons: ['Bazı bölümler uzun gelebilir'] },
            'Fantasy': { pros: ['Zengin fantastik evren', 'Hayal gücünü zorlayan görsellik'], cons: ['Gerçekçilik arayanlar için uygun olmayabilir'] },
            'Fantastik': { pros: ['Zengin fantastik evren', 'Hayal gücünü zorlayan görsellik'], cons: ['Gerçekçilik arayanlar için uygun olmayabilir'] },
            'Crime': { pros: ['İlgi çekici suç hikayesi', 'Zekice kurgulanmış senaryo'], cons: ['Karanlık temalar içerir'] },
            'Suç': { pros: ['İlgi çekici suç hikayesi', 'Zekice kurgulanmış senaryo'], cons: ['Karanlık temalar içerir'] },
            'War': { pros: ['Tarihsel gerçekçilik', 'Duygusal derinlik'], cons: ['Şiddet sahneleri rahatsız edici olabilir'] },
            'Savaş': { pros: ['Tarihsel gerçekçilik', 'Duygusal derinlik'], cons: ['Şiddet sahneleri rahatsız edici olabilir'] }
        };

        let pros = [];
        let cons = [];

        // Add genre-specific reviews
        for (const genre of genres) {
            const genreName = typeof genre === 'string' ? genre : genre.name;
            if (genreReviews[genreName]) {
                pros.push(...genreReviews[genreName].pros);
                cons.push(...genreReviews[genreName].cons);
            }
        }

        // Add rating-based comments
        if (rating >= 8) {
            pros.push('Eleştirmenlerden yüksek puan aldı');
        } else if (rating >= 7) {
            pros.push('Genel olarak olumlu değerlendirmeler');
        } else if (rating < 6) {
            cons.push('Bazı izleyiciler hayal kırıklığına uğramış');
        }

        // Remove duplicates and limit
        pros = [...new Set(pros)].slice(0, 3);
        cons = [...new Set(cons)].slice(0, 2);

        // Fallback if no genre matched
        if (pros.length === 0) {
            pros = ['İlgi çekici hikaye anlatımı', 'Görsel açıdan tatmin edici'];
        }
        if (cons.length === 0) {
            cons = ['Herkesin zevkine uygun olmayabilir'];
        }

        return { pros, cons };
    }
    bindEvents() {
        document.getElementById('searchBtn').addEventListener('click', () => this.handleSearch());
        document.getElementById('searchInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleSearch();
        });

        document.querySelectorAll('.filter-chip').forEach(chip => {
            chip.addEventListener('click', (e) => this.handleDurationFilter(e));
        });

        document.querySelectorAll('.mood-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleMoodSelect(e));
        });

        document.getElementById('surpriseBtn').addEventListener('click', () => this.surpriseMe());
        document.getElementById('ideaBtn').addEventListener('click', () => this.getIdea());

        document.getElementById('collectionBtn').addEventListener('click', () => this.openSidebar());
        document.getElementById('closeSidebar').addEventListener('click', () => this.closeSidebar());

        document.querySelectorAll('.sidebar-tab').forEach(tab => {
            tab.addEventListener('click', (e) => this.handleTabSwitch(e));
        });

        document.getElementById('modalOverlay').addEventListener('click', () => this.closeModal());
        document.getElementById('modalClose').addEventListener('click', () => this.closeModal());

        // Chat bot
        document.getElementById('chatFab').addEventListener('click', () => this.toggleChat());
        document.getElementById('chatClose').addEventListener('click', () => this.toggleChat());
        document.getElementById('chatSend').addEventListener('click', () => this.sendChatMessage());
        document.getElementById('chatInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendChatMessage();
        });

        // Infinite scroll
        window.addEventListener('scroll', () => {
            if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
                this.loadMore();
            }
        });
    }

    // ===== Search & Mood =====
    handleSearch() {
        const query = document.getElementById('searchInput').value.trim();
        if (!query) { this.loadPopularMovies(); return; }
        document.querySelectorAll('.mood-btn').forEach(btn => btn.classList.remove('active'));
        this.currentMood = null;
        this.currentPage = 1;
        this.searchMoviesAPI(query);
    }

    handleMoodSelect(e) {
        const btn = e.currentTarget;
        const mood = btn.dataset.mood;
        document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('active'));
        if (this.currentMood === mood) {
            this.currentMood = null;
            this.loadPopularMovies();
        } else {
            btn.classList.add('active');
            this.currentMood = mood;
            this.currentPage = 1;
            this.discoverByMood(mood);
        }
        document.getElementById('searchInput').value = '';
    }

    handleDurationFilter(e) {
        document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.currentFilter = e.currentTarget.dataset.duration;
    }

    // ===== Quick Actions =====
    async surpriseMe() {
        this.showLoading();
        const randomPage = Math.floor(Math.random() * 100) + 1;
        const data = await this.fetchTMDB('/discover/movie', { page: randomPage, sort_by: 'popularity.desc' });
        if (data?.results?.length) {
            const random = data.results[Math.floor(Math.random() * data.results.length)];
            const movies = await this.enrichMovies([random]);
            movies[0].reason = '✨ Özel olarak senin için seçildi!';
            this.openModal(movies[0]);
        } else if (this.localMovies.length) {
            const random = this.localMovies[Math.floor(Math.random() * this.localMovies.length)];
            random.reason = '✨ Özel olarak senin için seçildi!';
            this.openModal(random);
        }
        this.hideLoading();
    }

    async getIdea() {
        this.showLoading();
        const data = await this.fetchTMDB('/movie/top_rated', { page: 1 });
        if (data?.results?.length) {
            const random = data.results[Math.floor(Math.random() * 10)];
            const movies = await this.enrichMovies([random]);
            movies[0].reason = `⭐ ${movies[0].rating} puanla en iyilerden!`;
            this.openModal(movies[0]);
        } else if (this.localMovies.length) {
            const top = [...this.localMovies].sort((a, b) => b.rating - a.rating).slice(0, 10);
            const random = top[Math.floor(Math.random() * top.length)];
            random.reason = `⭐ ${random.rating} puanla en iyilerden!`;
            this.openModal(random);
        }
        this.hideLoading();
    }

    async loadMore() {
        if (this.isLoading) return;
        this.currentPage++;
        if (this.currentMood) {
            await this.discoverByMood(this.currentMood, this.currentPage);
        } else {
            await this.loadPopularMovies(this.currentPage);
        }
    }

    // ===== Display =====
    showLoading() { this.isLoading = true; }
    hideLoading() { this.isLoading = false; }

    displayResults(movies, title, total = 0) {
        document.getElementById('resultsTitle').textContent = title;
        document.getElementById('resultsCount').textContent = total > 0 ? `${total.toLocaleString()} film` : '';

        const grid = document.getElementById('moviesGrid');
        if (this.currentPage === 1) {
            grid.innerHTML = '';
            this.currentMovies = [];
        }
        // Cache movies for modal access
        this.currentMovies = [...(this.currentMovies || []), ...movies];

        if (!movies.length && this.currentPage === 1) {
            grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><div class="empty-state-icon">🎬</div><p>Film bulunamadı</p></div>`;
            return;
        }

        grid.innerHTML += movies.map(m => this.createMovieCard(m)).join('');
        grid.querySelectorAll('.movie-card:not([data-bound])').forEach(card => {
            card.setAttribute('data-bound', 'true');
            card.addEventListener('click', () => this.openMovieModal(parseInt(card.dataset.id)));
        });
    }

    createMovieCard(movie) {
        return `
            <article class="movie-card" data-id="${movie.id}">
                <div class="movie-poster">
                    <img src="${movie.poster}" alt="${movie.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/500x750?text=No+Poster'">
                    <div class="movie-rating">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                        ${movie.rating}
                    </div>
                </div>
                <div class="movie-info">
                    <h3 class="movie-title">${movie.originalTitle || movie.title}</h3>
                    ${movie.originalTitle && movie.originalTitle !== movie.title ? `<p class="movie-turkish-title">(${movie.title})</p>` : ''}
                    ${movie.reason ? `<p class="movie-reason">${movie.reason}</p>` : ''}
                    <div class="movie-meta"><span>${movie.year}</span></div>
                </div>
            </article>`;
    }

    // ===== Modal =====
    async openMovieModal(movieId) {
        this.showLoading();
        try {
            // Check local movies first
            const localMovie = this.localMovies.find(m => m.id === movieId);
            if (localMovie) {
                this.openModal(localMovie);
                this.hideLoading();
                return;
            }

            // Check cached movies from current display
            const cachedMovie = this.currentMovies.find(m => m.id === movieId);

            // Try TMDB API
            const { details, videos, providers } = await this.getMovieDetails(movieId);
            if (details && !details.status_code) {
                const movie = {
                    id: details.id,
                    title: details.title,
                    originalTitle: details.original_title || details.title,
                    year: details.release_date?.split('-')[0] || 'N/A',
                    duration: details.runtime || 120,
                    rating: details.vote_average?.toFixed(1),
                    imdb: details.vote_average?.toFixed(1),
                    poster: details.poster_path ? `${TMDB_IMG}/w500${details.poster_path}` : null,
                    backdrop: details.backdrop_path ? `${TMDB_IMG}/original${details.backdrop_path}` : null,
                    overview: details.overview || 'Açıklama mevcut değil.',
                    genres: details.genres?.map(g => g.name) || [],
                    trailer: videos?.results?.find(v => v.type === 'Trailer')?.key,
                    platforms: providers?.results?.TR?.flatrate?.map(p => p.provider_name) || ['Bilgi yok']
                };
                this.openModal(movie);
            } else if (cachedMovie) {
                // Use cached movie if API fails
                this.openModal(cachedMovie);
            } else {
                alert('Film detayları yüklenemedi. Lütfen tekrar deneyin.');
            }
        } catch (error) {
            console.error('Modal yükleme hatası:', error);
            // Try cached movie on error
            const cachedMovie = this.currentMovies.find(m => m.id === movieId);
            if (cachedMovie) {
                this.openModal(cachedMovie);
            } else {
                alert('Film detayları yüklenemedi. Lütfen tekrar deneyin.');
            }
        }
        this.hideLoading();
    }

    openModal(movie) {
        const modal = document.getElementById('movieModal');
        const body = document.getElementById('modalBody');
        const isInWatchlist = this.watchlist.includes(movie.id);
        const isWatched = this.watched.includes(movie.id);
        const currentRating = this.ratings[movie.id];

        body.innerHTML = `
            <div class="modal-backdrop">
                <img src="${movie.backdrop || movie.poster}" alt="${movie.title}" onerror="this.style.display='none'">
            </div>
            <div class="modal-detail">
                <div class="modal-header">
                    <div class="modal-poster">
                        <img src="${movie.poster}" alt="${movie.title}" onerror="this.src='https://via.placeholder.com/140x210?text=No+Poster'">
                    </div>
                    <div class="modal-title-section">
                        <h1 class="modal-title">${movie.originalTitle || movie.title}</h1>
                        ${movie.originalTitle && movie.originalTitle !== movie.title ? `<p class="modal-turkish-title">(${movie.title})</p>` : ''}
                        <div class="modal-meta">
                            <span class="imdb-badge">IMDb ${movie.imdb || movie.rating}</span>
                            <span>${movie.year}</span>
                            <span>${movie.duration} dk</span>
                        </div>
                        <div class="modal-genres">${(movie.genres || []).map(g => `<span class="genre-tag">${g}</span>`).join('')}</div>
                    </div>
                </div>
                
                ${movie.reason ? `<div class="modal-reason">💡 ${movie.reason}</div>` : ''}
                
                <p class="modal-overview">${movie.overview}</p>
                
                ${movie.trailer ? `
                <div style="margin: 20px 0">
                    <a href="https://www.youtube.com/watch?v=${movie.trailer}" target="_blank" class="trailer-btn">
                        ▶ Fragmanı İzle
                    </a>
                </div>` : ''}
                
                <div class="modal-platforms">
                    <h3>📺 Nerede İzlenir?</h3>
                    <div class="platforms-list">${(movie.platforms || []).map(p => `<div class="platform-badge">${p}</div>`).join('')}</div>
                </div>
                
                <div class="ai-review">
                    <h3>🤖 AI Değerlendirmesi</h3>
                    ${(() => {
                const review = this.generateAIReview(movie);
                return `
                            <div class="review-pros"><h4>👍 Beğenilenler</h4><ul>${review.pros.map(p => `<li>${p}</li>`).join('')}</ul></div>
                            <div class="review-cons"><h4>👎 Eleştiriler</h4><ul>${review.cons.map(c => `<li>${c}</li>`).join('')}</ul></div>
                        `;
            })()}
                </div>
                
                <div class="modal-actions">
                    <button class="modal-action-btn ${isInWatchlist ? 'active' : ''}" id="watchlistBtn">
                        ${isInWatchlist ? '✓ Listede' : '+ Listeye Ekle'}
                    </button>
                    <button class="modal-action-btn watched ${isWatched ? 'active' : ''}" id="watchedBtn">
                        ${isWatched ? '✓ İzlendi' : 'İzledim'}
                    </button>
                </div>
                
                <div class="rating-section">
                    <h3>Bu filmi nasıl buldunuz?</h3>
                    <div class="rating-buttons">
                        <button class="rating-btn ${currentRating === 'fire' ? 'active' : ''}" data-rating="fire"><span class="rating-emoji">🔥</span><span class="rating-label">Efsane</span></button>
                        <button class="rating-btn ${currentRating === 'good' ? 'active' : ''}" data-rating="good"><span class="rating-emoji">👍</span><span class="rating-label">İyi</span></button>
                        <button class="rating-btn ${currentRating === 'meh' ? 'active' : ''}" data-rating="meh"><span class="rating-emoji">😐</span><span class="rating-label">Eh İşte</span></button>
                    </div>
                </div>
            </div>`;

        document.getElementById('watchlistBtn').onclick = () => this.toggleWatchlist(movie.id);
        document.getElementById('watchedBtn').onclick = () => this.toggleWatched(movie.id);
        body.querySelectorAll('.rating-btn').forEach(btn => {
            btn.onclick = () => this.setRating(movie.id, btn.dataset.rating);
        });

        modal.classList.add('open');
        document.body.style.overflow = 'hidden';
        this.currentMovie = movie;
    }

    closeModal() {
        document.getElementById('movieModal').classList.remove('open');
        document.body.style.overflow = '';
    }

    // ===== Collection =====
    toggleWatchlist(id) {
        const i = this.watchlist.indexOf(id);
        i > -1 ? this.watchlist.splice(i, 1) : this.watchlist.push(id);
        localStorage.setItem('reelify_watchlist', JSON.stringify(this.watchlist));
        if (this.currentMovie) this.openModal(this.currentMovie);
    }

    toggleWatched(id) {
        const i = this.watched.indexOf(id);
        if (i > -1) { this.watched.splice(i, 1); }
        else {
            this.watched.push(id);
            const wi = this.watchlist.indexOf(id);
            if (wi > -1) { this.watchlist.splice(wi, 1); localStorage.setItem('reelify_watchlist', JSON.stringify(this.watchlist)); }
        }
        localStorage.setItem('reelify_watched', JSON.stringify(this.watched));
        if (this.currentMovie) this.openModal(this.currentMovie);
    }

    setRating(id, rating) {
        this.ratings[id] === rating ? delete this.ratings[id] : this.ratings[id] = rating;
        localStorage.setItem('reelify_ratings', JSON.stringify(this.ratings));
        if (this.currentMovie) this.openModal(this.currentMovie);
    }

    // ===== Sidebar =====
    openSidebar() {
        document.getElementById('sidebar').classList.add('open');
        document.body.style.overflow = 'hidden';
        this.updateSidebarContent();
    }
    closeSidebar() {
        document.getElementById('sidebar').classList.remove('open');
        document.body.style.overflow = '';
    }
    handleTabSwitch(e) {
        document.querySelectorAll('.sidebar-tab').forEach(t => t.classList.remove('active'));
        e.currentTarget.classList.add('active');
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        document.getElementById(`${e.currentTarget.dataset.tab}Tab`).classList.add('active');
    }
    updateSidebarContent() {
        document.getElementById('watchlistItems').innerHTML = this.watchlist.length ?
            `<p style="color:var(--text-muted)">${this.watchlist.length} film kaydedildi</p>` :
            `<div class="collection-empty"><div class="collection-empty-icon">📋</div><p>Liste boş</p></div>`;
        document.getElementById('watchedItems').innerHTML = this.watched.length ?
            `<p style="color:var(--text-muted)">${this.watched.length} film izlendi</p>` :
            `<div class="collection-empty"><div class="collection-empty-icon">🎬</div><p>Henüz izlemediniz</p></div>`;
        document.getElementById('statsContainer').innerHTML = `
            <div class="stat-card"><div class="stat-value">${this.watched.length}</div><div class="stat-label">Film İzlediniz</div></div>
            <div class="stat-card"><div class="stat-value">${this.watchlist.length}</div><div class="stat-label">Listede Bekliyor</div></div>`;
    }

    // ===== Chat Bot =====
    toggleChat() {
        document.getElementById('chatPanel').classList.toggle('open');
    }

    async sendChatMessage() {
        const input = document.getElementById('chatInput');
        const msg = input.value.trim();
        if (!msg) return;

        const container = document.getElementById('chatMessages');
        container.innerHTML += `<div class="chat-message user"><div class="message-content">${msg}</div></div>`;
        input.value = '';
        container.scrollTop = container.scrollHeight;

        // AI Response
        setTimeout(async () => {
            let response = 'Hmm, anlıyorum! ';
            const lower = msg.toLowerCase();

            if (lower.includes('ağla') || lower.includes('üzgün') || lower.includes('duygusal')) {
                response += 'Duygusal bir film istiyorsun! 😢 Sana "Yeşil Yol" veya "Titanik" gibi filmler önerebilirim. Ruh hali butonlarından 😢 Üzgün seçebilirsin!';
            } else if (lower.includes('komedi') || lower.includes('gül') || lower.includes('eğlen')) {
                response += 'Biraz gülmek istiyorsun yani! 😄 "Hangover" veya "Deadpool" harika seçenekler. Mutlu butonuna tıkla!';
            } else if (lower.includes('korku') || lower.includes('kork')) {
                response += 'Cesursun! 😱 "Korku Seansı" veya "Get Out" dene. Korkulu modunu seç!';
            } else if (lower.includes('aksiyon') || lower.includes('heyecan')) {
                response += 'Adrenalin zamanı! 🤩 "Matrix" veya "Kara Şövalye" tam sana göre!';
            } else if (lower.includes('romantik') || lower.includes('aşk')) {
                response += 'Aşk havası var! 🥰 "Notebook" veya "La La Land" romantik bir gece için mükemmel!';
            } else {
                response += 'Yukarıdaki arama kutusuna ne istediğini yaz veya ruh hali butonlarından birini seç. Sana en iyi filmleri bulacağım! 🎬';
            }

            container.innerHTML += `<div class="chat-message bot"><div class="message-content">${response}</div></div>`;
            container.scrollTop = container.scrollHeight;
        }, 500);
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => new ReelifyApp());
