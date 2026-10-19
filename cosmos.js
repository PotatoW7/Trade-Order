/* Реален Млечен път: процедурна панорама (светещ диск, прахови ленти, ярко ядро) + 3D звезди.
   Камерата е "в космоса" и бавно се върти. Без следене на мишката. */
(function () {
    document.documentElement.classList.add('js');
    const canvas = document.getElementById('cosmos');
    if (!window.THREE || !canvas) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0x000000, 1);
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(56, 1, .1, 1000);

    // --- шум (бърз целочислен хеш) ---
    const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
    const vn = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
        return (hash(xi, yi) * (1 - u) + hash(xi + 1, yi) * u) * (1 - v) + (hash(xi, yi + 1) * (1 - u) + hash(xi + 1, yi + 1) * u) * v; };
    const fbm = (x, y, o) => { let s = 0, a = .5; for (let i = 0; i < o; i++) { s += a * vn(x, y); x *= 2; y *= 2; a *= .5; } return s; };

    // --- Млечен път 2K изчисление -> 4K текстура (на части, без да замръзва страницата) ---
    const W = 2048, H = 1024, small = document.createElement('canvas'); small.width = W; small.height = H;
    const sc = small.getContext('2d'), img = sc.createImageData(W, H), d = img.data;
    const sky = new THREE.Group(); scene.add(sky);
    const skyMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthWrite: false, transparent: true, opacity: 0, color: 0x9096a6 });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(500, 96, 48), skyMat); skyMesh.renderOrder = -1; sky.add(skyMesh);
    let row = 0, fade = 0;
    function chunk() {
        const end = Math.min(row + 24, H);
        for (let y = row; y < end; y++) for (let x = 0; x < W; x++) {
            const u = x / W, v = y / H, du = u - .5;
            const lat = (v - .5) + (fbm(u * 5, 7, 3) - .5) * .09;
            const band = Math.exp(-.5 * (lat / .075) ** 2);
            const lon = .22 + .78 * Math.exp(-((du / .2) ** 2));
            const bulge = Math.exp(-((du / .075) ** 2) - (lat / .1) ** 2);
            const cloud = fbm(u * 38, v * 19, 6);
            let lum = band * lon * (.3 + cloud * 1.1) * Math.exp(-((du / .4) ** 2) * .6);
            const lane = Math.exp(-(((lat - (fbm(u * 13, v * 7 + 9, 4) - .5) * .05) / .016) ** 2)) * (.35 + .65 * fbm(u * 28, v * 28, 4));
            lum *= 1 - .88 * lane * Math.min(1, band * 1.6);
            lum += bulge * .4 * (.6 + cloud * .6) * (1 - .6 * lane) + band * .04;
            lum = Math.min(lum * .5, 1);
            const warm = Math.min(1, bulge * 1.3 + lon * .08), i = (y * W + x) * 4;
            d[i] = 4 + lum * (176 + 79 * warm); d[i + 1] = 6 + lum * (192 + 22 * warm); d[i + 2] = 12 + lum * (232 - 62 * warm); d[i + 3] = 255;
        }
        row = end;
        if (row < H) setTimeout(chunk, 0); else finish();
    }
    function finish() {
        sc.putImageData(img, 0, 0);
        const big = document.createElement('canvas'); big.width = 4096; big.height = 2048;
        const bc = big.getContext('2d'); bc.imageSmoothingQuality = 'high'; bc.drawImage(small, 0, 0, 4096, 2048);
        const tex = new THREE.CanvasTexture(big); tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        skyMat.map = tex; skyMat.needsUpdate = true;
    }
    setTimeout(chunk, 50);

    // --- 3D звезди (меки точки), концентрирани в лентата ---
    const spr = document.createElement('canvas'); spr.width = spr.height = 32; const g = spr.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32); const dot = new THREE.CanvasTexture(spr);
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    function layer(n, size, op, bandShare) {
        const p = new Float32Array(n * 3), c = new Float32Array(n * 3), col = new THREE.Color();
        for (let i = 0; i < n; i++) {
            const inB = Math.random() < bandShare, b = inB ? gauss() * .16 : Math.asin(2 * Math.random() - 1);
            const phi = inB ? Math.PI + gauss() * 1.4 * (Math.random() < .5 ? 1 : 2.2) : Math.random() * 6.283, th = Math.PI / 2 - b, r = 480;
            p.set([-r * Math.cos(phi) * Math.sin(th), r * Math.cos(th), r * Math.sin(phi) * Math.sin(th)], i * 3);
            const rr = Math.random(); col.setHSL(rr < .18 ? .07 : rr < .3 ? .12 : .6, .3 + Math.random() * .35, .74 + Math.random() * .2); c.set([col.r, col.g, col.b], i * 3);
        }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
        const m = new THREE.PointsMaterial({ size, map: dot, vertexColors: true, transparent: true, opacity: op, depthWrite: false, sizeAttenuation: false, blending: THREE.AdditiveBlending });
        const pts = new THREE.Points(geo, m); pts.renderOrder = 1; sky.add(pts); return m;
    }
    layer(70000, 1.3, .8, 0); layer(40000, 1.4, .8, .4); layer(12000, 2, .88, .25); layer(2600, 2.7, .92, .4); const bright = layer(600, 3.8, .92, .35);

    sky.rotation.set(-.5, 2.274, .6); // диагонално, както се вижда от Земята

    let target = 0, prog = 0;
    const onScroll = () => { target = scrollY / Math.max(document.documentElement.scrollHeight - innerHeight, 1); };
    addEventListener('scroll', onScroll, { passive: true }); onScroll();
    const resize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
    addEventListener('resize', resize); resize();

    const clock = new THREE.Clock();
    (function loop() {
        const dt = still ? 0 : clock.getDelta(), t = clock.elapsedTime;
        prog += (target - prog) * .05;
        if (skyMat.map && fade < 1) { fade = Math.min(1, fade + .012); skyMat.opacity = fade; }
        sky.rotation.y += dt * .006; camera.rotation.y = prog * 1.2; camera.rotation.x = prog * .25;
        bright.opacity = .75 + .2 * Math.sin(t * 1.2);
        renderer.render(scene, camera);
        requestAnimationFrame(loop);
    })();

    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: .1 });
    document.querySelectorAll('.reveal').forEach((el, i) => { el.style.transitionDelay = i * 90 + 'ms'; io.observe(el); });
})();
