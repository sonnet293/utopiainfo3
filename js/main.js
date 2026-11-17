(() => {
    const SECTIONS = ['notice', 'world', 'system', 'battle'];
    const BGM_VOLUME = 0.4;
    const STAGGER_MS = 90;
    const STATIC_MS = 900;
    const STATIC_PEAK = 0.5;
    const STATIC_FRAME_MS = 40;
    const STATIC_PIXEL = 3;

    const body = document.body;
    const intro = document.getElementById('intro-overlay');
    const bgmIntro = document.getElementById('bgm');
    const bgmLoop = document.getElementById('bgm-loop');
    let bgm = bgmIntro;
    const pageBar = document.querySelector('.page-bar');
    const progress = document.querySelector('.scroll-progress span');
    const views = [...document.querySelectorAll('.view')];
    const soundButtons = document.querySelectorAll('[data-sound]');
    const tabs = document.querySelectorAll('.page-tabs [data-section]');

    let entered = false;
    let observer = null;
    let markObserver = null;
    let activeView = null;

    if (location.hash) history.replaceState(null, '', location.pathname + location.search);

    // BGM
    function fadeInBgm() {
        const start = performance.now();
        const step = (now) => {
            const t = Math.max(0, Math.min((now - start) / 1500, 1));
            bgm.volume = BGM_VOLUME * t;
            if (t < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function playBgm() {
        bgm.play().catch(updateSoundButtons);
    }

    function updateSoundButtons() {
        const on = !bgm.paused && !bgm.muted;
        soundButtons.forEach((button) => {
            button.setAttribute('aria-label', on ? 'BGM 끄기' : 'BGM 켜기');
            button.setAttribute('aria-pressed', String(on));
        });
    }

    function toggleSound() {
        if (bgm.paused || bgm.muted) {
            bgm.muted = false;
            playBgm();
        } else {
            bgm.muted = true;
        }
    }

    ['play', 'pause', 'volumechange'].forEach((type) => {
        bgmIntro.addEventListener(type, updateSoundButtons);
        bgmLoop.addEventListener(type, updateSoundButtons);
    });

    bgmIntro.addEventListener('ended', () => {
        bgmLoop.volume = bgmIntro.volume;
        bgmLoop.muted = bgmIntro.muted;
        bgm = bgmLoop;
        playBgm();
    });

    let resumeOnReturn = false;
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            resumeOnReturn = !bgm.paused;
            bgm.pause();
        } else if (resumeOnReturn) {
            playBgm();
        }
    });

    // 문서 구성
    document.querySelectorAll('.doc-body table').forEach((table) => {
        const wrap = document.createElement('div');
        wrap.className = 'table-wrap';
        wrap.tabIndex = 0;
        table.replaceWith(wrap);
        wrap.append(table);
    });

    document.querySelectorAll('.doc-body > :not(ul, ol), .doc-body > ul > li, .doc-body > ol > li').forEach((block) => block.classList.add('reveal'));

    const outlines = new Map();
    document.querySelectorAll('.page').forEach((page) => {
        const toc = document.createElement('nav');
        toc.className = 'doc-toc';
        toc.setAttribute('aria-label', '목차');
        toc.innerHTML = '<p>CONTENTS</p>';

        const items = [...page.querySelectorAll('.doc-body h3')].map((heading) => {
            const button = document.createElement('button');
            button.textContent = heading.textContent;
            button.addEventListener('click', () => heading.scrollIntoView({ behavior: 'smooth' }));
            toc.append(button);
            return { heading, button };
        });

        page.prepend(toc);
        outlines.set(page, items);
    });

    function updateOutline() {
        const items = outlines.get(activeView);
        if (!items) return;

        const line = pageBar.offsetHeight + 80;
        const current = items.filter(({ heading }) => heading.getBoundingClientRect().top < line).pop();
        items.forEach((item) => {
            if (item === current) item.button.setAttribute('aria-current', 'true');
            else item.button.removeAttribute('aria-current');
        });
    }

    // 지도
    const map = document.querySelector('.region-map');
    if (map) {
        const areas = map.querySelectorAll('.map-area');
        const tip = map.querySelector('.map-tip');
        const tipTitle = tip.querySelector('strong');
        const tipDesc = tip.querySelector('p');
        const TIP_GAP = 14;
        let activeArea = null;

        areas.forEach((area) => area.setAttribute('aria-label', `${area.dataset.title}. ${area.dataset.desc}`));

        function hideTip() {
            if (activeArea) activeArea.classList.remove('is-active');
            activeArea = null;
            tip.hidden = true;
        }

        function showTip(area, clientX, clientY) {
            if (area !== activeArea) {
                hideTip();
                activeArea = area;
                area.classList.add('is-active');
                tipTitle.textContent = area.dataset.title;
                tipDesc.textContent = area.dataset.desc;
                tip.hidden = false;
            }

            const box = map.getBoundingClientRect();
            const x = clientX - box.left;
            const y = clientY - box.top;
            const above = y - tip.offsetHeight - TIP_GAP;
            const left = Math.max(0, Math.min(x - tip.offsetWidth / 2, box.width - tip.offsetWidth));
            tip.style.transform = `translate(${left}px, ${above >= 0 ? above : y + TIP_GAP}px)`;
        }

        map.addEventListener('pointermove', (event) => {
            if (event.pointerType === 'touch') return;
            const area = event.target.closest('.map-area');
            if (area) showTip(area, event.clientX, event.clientY);
            else hideTip();
        });

        map.addEventListener('pointerleave', (event) => {
            if (event.pointerType !== 'touch') hideTip();
        });

        document.addEventListener('click', (event) => {
            const area = event.target.closest('.map-area');
            if (area) showTip(area, event.clientX, event.clientY);
            else hideTip();
        });

        map.addEventListener('focusin', (event) => {
            const area = event.target.closest('.map-area');
            if (!area || !area.matches(':focus-visible')) return;
            const box = area.getBoundingClientRect();
            showTip(area, box.left + box.width / 2, box.top + box.height / 2);
        });

        map.addEventListener('focusout', hideTip);
    }

    // 스크롤 등장
    function watchReveals(view) {
        if (observer) observer.disconnect();

        const items = view.querySelectorAll('.reveal');
        items.forEach((item) => {
            item.classList.remove('is-in');
            item.style.removeProperty('--delay');
        });

        observer = new IntersectionObserver((entries) => {
            entries
                .filter((entry) => entry.isIntersecting)
                .forEach((entry, index) => {
                    entry.target.style.setProperty('--delay', `${index * STAGGER_MS}ms`);
                    entry.target.classList.add('is-in');
                    observer.unobserve(entry.target);
                });
        }, {
            rootMargin: view.id === 'view-main' ? '0px' : '0px 0px -10% 0px',
            threshold: 0.05,
        });

        requestAnimationFrame(() => items.forEach((item) => observer.observe(item)));

        watchMarks(view);
    }

    // 하이라이트
    function watchMarks(view) {
        if (markObserver) markObserver.disconnect();

        const marks = view.querySelectorAll('mark');
        marks.forEach((mark) => mark.classList.remove('is-drawn'));

        markObserver = new IntersectionObserver((entries) => {
            entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
                entry.target.classList.add('is-drawn');
                markObserver.unobserve(entry.target);
            });
        }, { rootMargin: '0px 0px -22% 0px' });

        requestAnimationFrame(() => marks.forEach((mark) => markObserver.observe(mark)));
    }

    // 타이핑
    const TYPE_START_MS = 500;
    const TYPE_CHAR_MS = 38;
    const TYPE_LINE_MS = 350;
    const TYPE_CURSOR_HOLD_MS = 1600;
    const TYPE_FOLLOW_MS = 450;

    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const groups = [];
        const groupOf = new Map();
        const textsOf = new Map();

        document.querySelectorAll('[data-typing]').forEach((line) => {
            const prev = line.previousElementSibling;
            if (prev && prev.hasAttribute('data-typing')) groups[groups.length - 1].push(line);
            else groups.push([line]);
            groupOf.set(line, groups[groups.length - 1]);

            const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
            const texts = [];
            while (walker.nextNode()) {
                if (walker.currentNode.data.trim()) texts.push({ node: walker.currentNode, text: walker.currentNode.data });
            }
            textsOf.set(line, texts);

            line.classList.add('type-pending');
        });

        const followersOf = new Map();
        groups.forEach((group) => {
            const followers = [];
            let next = group[group.length - 1].nextElementSibling;
            while (next && next.hasAttribute('data-after-typing')) {
                next.classList.add('type-pending');
                followers.push(next);
                next = next.nextElementSibling;
            }
            followersOf.set(group, followers);
        });

        async function typeGroup(group) {
            await wait(TYPE_START_MS);

            const cursor = document.createElement('span');
            cursor.className = 'type-cursor';
            cursor.setAttribute('aria-hidden', 'true');

            group.forEach((line) => {
                line.style.minHeight = `${line.offsetHeight}px`;
                textsOf.get(line).forEach(({ node }) => { node.data = ''; });
                line.classList.add('is-typing');
                line.classList.remove('type-pending');
            });

            for (const line of group) {
                for (const { node, text } of textsOf.get(line)) {
                    node.after(cursor);
                    const chars = [...text];
                    for (let i = 1; i <= chars.length; i += 1) {
                        node.data = chars.slice(0, i).join('');
                        await wait(TYPE_CHAR_MS * (0.5 + Math.random()));
                    }
                }
                line.style.removeProperty('min-height');
                line.classList.remove('is-typing');
                await wait(TYPE_LINE_MS);
            }

            for (const follower of followersOf.get(group)) {
                follower.classList.remove('type-pending');
                follower.classList.add('type-appear');
                await wait(TYPE_FOLLOW_MS);
            }

            await wait(TYPE_CURSOR_HOLD_MS);
            cursor.remove();
        }

        const typeObserver = new IntersectionObserver((entries) => {
            entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
                typeObserver.unobserve(entry.target);
                typeGroup(groupOf.get(entry.target));
            });
        }, { threshold: 1 });

        groups.forEach((group) => typeObserver.observe(group[0]));
    }

    function updateProgress() {
        const max = document.documentElement.scrollHeight - window.innerHeight;

        if (activeView && max - window.scrollY <= 2) {
            activeView.querySelectorAll('mark').forEach((mark) => mark.classList.add('is-drawn'));
            activeView.querySelectorAll('.reveal').forEach((item) => item.classList.add('is-in'));
        }

        const ratio = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
        progress.style.setProperty('--progress', ratio);
        updateOutline();
    }

    // 페이지 전환
    function currentSection() {
        return SECTIONS.indexOf(location.hash.slice(1));
    }

    function render({ focus = true } = {}) {
        const section = currentSection();
        const target = document.getElementById(section < 0 ? 'view-main' : `view-section-${section}`);

        if (target === activeView) return;
        activeView = target;

        views.forEach((view) => { view.hidden = view !== target; });
        pageBar.hidden = section < 0;
        document.body.classList.toggle('is-home', section < 0);
        tabs.forEach((tab) => {
            if (Number(tab.dataset.section) === section) tab.setAttribute('aria-current', 'page');
            else tab.removeAttribute('aria-current');
        });

        window.scrollTo(0, 0);
        watchReveals(target);
        updateProgress();

        const heading = target.querySelector('h2');
        if (focus && heading) heading.focus({ preventScroll: true });
    }

    function go(hash) {
        if (location.hash.slice(1) === hash) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (hash) {
            location.hash = hash;
        } else {
            history.pushState(null, '', location.pathname + location.search);
            render();
        }
    }

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-section], [data-home], [data-sound]');
        if (!button) return;

        if ('sound' in button.dataset) toggleSound();
        else if ('home' in button.dataset) go('');
        else go(SECTIONS[Number(button.dataset.section)]);
    });

    window.addEventListener('hashchange', () => { if (entered) render(); });
    window.addEventListener('popstate', () => { if (entered) render(); });
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);

    // 인트로
    function playStatic(onPeak) {
        const canvas = document.getElementById('static-noise');
        const width = Math.ceil(window.innerWidth / STATIC_PIXEL);
        const height = Math.ceil(window.innerHeight / STATIC_PIXEL);
        canvas.width = width;
        canvas.height = height;
        canvas.hidden = false;

        const ctx = canvas.getContext('2d');
        const image = ctx.createImageData(width, height);
        const pixels = new Uint32Array(image.data.buffer);
        const start = performance.now();
        let lastDraw = -Infinity;
        let peaked = false;

        const draw = (intensity) => {
            const alpha = Math.round(intensity * 255) << 24;
            let tear = 0;
            for (let y = 0, i = 0; y < height; y += 1) {
                if (tear > 0) tear -= 1;
                else if (Math.random() < 0.012) tear = 1 + Math.floor(Math.random() * 6);
                const base = tear > 0 ? 130 : 0;
                for (let x = 0; x < width; x += 1, i += 1) {
                    const v = Math.min(255, base + Math.floor(Math.random() * 200));
                    pixels[i] = alpha | (v << 16) | (v << 8) | v;
                }
            }
            ctx.putImageData(image, 0, 0);
        };

        const step = (now) => {
            const t = Math.max(0, (now - start) / STATIC_MS);
            if (!peaked && t >= STATIC_PEAK) {
                peaked = true;
                onPeak();
            }
            if (t >= 1) {
                canvas.hidden = true;
                return;
            }
            if (now - lastDraw >= STATIC_FRAME_MS) {
                lastDraw = now;
                const intensity = t < STATIC_PEAK
                    ? (t / STATIC_PEAK) ** 2
                    : (1 - (t - STATIC_PEAK) / (1 - STATIC_PEAK)) * (0.65 + Math.random() * 0.35);
                draw(intensity);
            }
            requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
    }

    function enter() {
        if (entered) return;
        entered = true;

        bgm.volume = 0;
        playBgm();
        fadeInBgm();

        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            intro.classList.add('is-glitching');
            playStatic(() => {
                intro.hidden = true;
                body.classList.remove('is-locked');
                render({ focus: false });
            });
            return;
        }

        intro.classList.add('is-leaving');
        body.classList.remove('is-locked');

        setTimeout(() => render({ focus: false }), 400);
        setTimeout(() => { intro.hidden = true; }, 1000);
    }

    intro.addEventListener('click', enter);
    intro.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            enter();
        }
    });

    updateSoundButtons();
})();