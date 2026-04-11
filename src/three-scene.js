import * as THREE from 'three';
import { GLTFLoader }      from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

/* ── Sur mobile : pas de Three.js ── */
if(window.innerWidth <= 768) { throw 0; }

/* ── Attend que les projets soient chargés depuis l'API ── */
await window._projectsReady;
const PROJECTS = window.PROJECTS;

const ENABLE_RGB = true;
const ENABLE_SCREEN_LIGHT = true; // false = désactive la lumière dynamique (gain de fluidité)

const CRTShader = {
    uniforms: {
        "tDiffuse": { value: null },
        "tRGB": { value: null },
        "time": { value: 0.0 },
        "uEnableRGB": { value: ENABLE_RGB ? 1.0 : 0.0 }
    },
    vertexShader: `
        varying vec2 vUv;
        varying vec2 vCentered;
        void main() {
            vUv = uv;
            vec2 centered = uv * 2.0 - 1.0;
            centered *= 1.0 + 0.05 * pow(length(centered), 2.0);
            vCentered = centered;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform sampler2D tDiffuse;
        uniform sampler2D tRGB;
        uniform float time;
        uniform float uEnableRGB;
        varying vec2 vUv;
        varying vec2 vCentered;

        void main() {
            vec2 uv = (vCentered + 1.0) / 2.0;
            if(uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
                gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
                return;
            }

            // Chromatic aberration — effet "baveux" CRT
            float ca = 0.004;
            float r = texture2D(tDiffuse, uv + vec2(ca, 0.0)).r;
            float g = texture2D(tDiffuse, uv).g;
            float b = texture2D(tDiffuse, uv - vec2(ca, 0.0)).b;
            vec4 color = vec4(r, g, b, 1.0);

            if(uEnableRGB > 0.5) {
                // Scanlines douces (sin lisse, pas de masque dur)
                float scan = sin(uv.y * 500.0) * 0.5 + 0.5;
                color.rgb *= mix(0.82, 1.0, scan);

                // Légère instabilité temporelle
                color.rgb += sin(time * 60.0) * 0.006;

                // Boost de saturation
                float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
                color.rgb = mix(vec3(luma), color.rgb, 1.45);

                // Légère luminosité
                color.rgb *= 1.1;
            }

            gl_FragColor = vec4(clamp(color.rgb, 0.0, 1.0), 1.0);
        }
    `
};

const loaderEl=document.getElementById('loader');
const loaderBar=document.getElementById('loader-bar');
const loaderPercent=document.getElementById('loader-percent');
const loaderLabel=document.getElementById('loader-label');
const swipeHint=document.getElementById('swipe-hint');
const soundHint=document.getElementById('sound-hint');
let gltfLoaded=false, videosReady=0, rgbLoaded=false;

const TOTAL_VIDEOS = PROJECTS.length;

function setProgress(v,label){ const pct=Math.min(Math.round(v),100); loaderBar.style.width=pct+'%'; loaderPercent.innerText=pct+'%'; if(label) loaderLabel.innerText=label; }
function tryAutoplay(){ if(window.resumeVideos) window.resumeVideos(); }
function checkAllLoaded(){ if(gltfLoaded && videosReady>=TOTAL_VIDEOS && (rgbLoaded || !ENABLE_RGB)){ setProgress(100,'PRÊT'); setTimeout(()=>{ loaderEl.classList.add('hidden'); tryAutoplay(); showHints(); },600); } }
function onVideoReady(){ videosReady++; setProgress(30+(videosReady/TOTAL_VIDEOS)*30,'VIDÉO '+videosReady+'/'+TOTAL_VIDEOS+' CHARGÉE'); checkAllLoaded(); }

let hintsDismissed=false;
function showHints(){
    swipeHint.classList.add('visible');
    soundHint.classList.add('visible');
    setTimeout(dismissHints,4000);
}
function dismissHints(){
    if(hintsDismissed)return;
    hintsDismissed=true;
    swipeHint.classList.remove('visible'); swipeHint.classList.add('hidden');
    soundHint.classList.remove('visible');
}

const canvas=document.querySelector('canvas.webgl');
const btnProject=document.getElementById('btn-project');
const projectPreview=document.getElementById('project-preview');
const projectPanel=document.getElementById('project-panel');

const scene=new THREE.Scene();
const projectNames = PROJECTS.map(p => p.title);
scene.background=new THREE.Color(0x050505); scene.fog=new THREE.FogExp2(0x050505,0.9);

const radius=2.1,tvCount=PROJECTS.length,anglePerTV=(Math.PI*2)/tvCount;
const carouselGroup=new THREE.Group(); scene.add(carouselGroup);

let hasInteracted = false;
let scrollTarget=0,scrollCurrent=0,isTouching=false,snapTimeout=null,isProjectOpen=false,currentActiveIndex=0;
let timeMaterials=[], tvObjects=[]; /* cache — rempli après chargement GLTF */

function handleUserInteraction() {
    if(!hasInteracted) {
        hasInteracted = true;
        dismissHints();
    }
}

function doSnap(){
    isTouching=false;
    const s=Math.round(scrollTarget/anglePerTV);
    scrollTarget=s*anglePerTV;
    currentActiveIndex=((s%tvCount)+tvCount)%tvCount; window.currentActiveIndex=currentActiveIndex;

    const name = projectNames[currentActiveIndex];
    projectPreview.innerText=name;

    if(!isProjectOpen && hasInteracted){
        projectPreview.classList.add('visible');
        const isComingSoon = projectNames[currentActiveIndex] === 'COMMING SOON';
        btnProject.style.display = isComingSoon ? 'none' : 'block';
        if(!isComingSoon) setTimeout(() => { btnProject.classList.add('visible'); }, 10);
    }
}


window.addEventListener('wheel',(e)=>{
    if(window.currentPage!=='selects') return;
    const absX=Math.abs(e.deltaX), absY=Math.abs(e.deltaY);
    const isHoriz=absX>absY;
    if(isHoriz) e.preventDefault();
    if(isProjectOpen){
        if(isHoriz){
            const inner=document.getElementById('project-inner');
            if(inner) inner.scrollTop+=e.deltaX;
        }
        return;
    }
    handleUserInteraction();
    clearTimeout(snapTimeout);
    isTouching=true;
    btnProject.classList.remove('visible');
    projectPreview.classList.remove('visible');
    scrollTarget+=(e.deltaY+e.deltaX)*0.002;
    snapTimeout=setTimeout(doSnap,250);
},{ passive:false });

let t3dX=0;
window.addEventListener('touchstart',(e)=>{
    if(window.currentPage!=='selects'||isProjectOpen)return;
    t3dX=e.touches.clientX;
},{ passive:true });

window.addEventListener('touchmove',(e)=>{
    if(window.currentPage!=='selects'||isProjectOpen)return;
    handleUserInteraction();
    const dx=t3dX-e.touches.clientX;
    scrollTarget+=dx*0.003;
    t3dX=e.touches.clientX;
    clearTimeout(snapTimeout);
    isTouching=true;
    btnProject.classList.remove('visible');
    projectPreview.classList.remove('visible');
    snapTimeout=setTimeout(doSnap,250);
},{ passive:true });

setProgress(10,'CHARGEMENT VIDÉOS');
/* Créer les <video> et textures Three.js dynamiquement depuis PROJECTS */
const projectVideos = PROJECTS.map(function(proj) {
    const v = document.createElement('video');
    if(!proj.noCors) v.crossOrigin = 'anonymous';
    v.setAttribute('playsinline', '');
    v.muted = true; v.loop = true; v.style.display = 'none';
    const s = document.createElement('source');
    s.src = proj.videoSrc; s.type = 'video/mp4';
    v.appendChild(s);
    document.body.appendChild(v);
    return v;
});
/* Texture noire de substitution pour les projets sans CORS */
const _blackTex = (function(){
    const c = document.createElement('canvas'); c.width = 2; c.height = 2;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.flipY = true;
    return t;
})();

const projectTextures = PROJECTS.map(function(proj, i) {
    const v = projectVideos[i];
    if(proj.noCors) {
        onVideoReady(); /* compte quand même dans le loader */
        return _blackTex;
    }
    const tex = new THREE.VideoTexture(v);
    tex.colorSpace = THREE.SRGBColorSpace; tex.flipY = true;
    v.addEventListener('canplay', onVideoReady, {once:true});
    v.load();
    return tex;
});

const textureLoader = new THREE.TextureLoader();
let rgbTexture = null;
if(ENABLE_RGB) {
    textureLoader.load('/rgb.png', (tex) => {
        tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
        rgbTexture = tex;
        rgbLoaded = true;
        checkAllLoaded();
    });
}

const camera=new THREE.PerspectiveCamera(50,window.innerWidth/window.innerHeight,0.1,100);
camera.position.set(0,0.2,3); scene.add(camera);
const renderer=new THREE.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance'});
renderer.setSize(window.innerWidth,window.innerHeight); renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));
renderer.toneMapping=THREE.ReinhardToneMapping; renderer.toneMappingExposure=1.5;
renderer.shadowMap.enabled=false;

const composer=new EffectComposer(renderer);
composer.addPass(new RenderPass(scene,camera));
composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth*0.5,window.innerHeight*0.5),0.5,0.1,0.85));

scene.add(new THREE.AmbientLight(0xffffff,0.05));
const cL=new THREE.PointLight(0xffaa55,3,15); cL.position.set(0,2,0); scene.add(cL);
const fL=new THREE.DirectionalLight(0xaaccff,0.5); fL.position.set(0,2,8); scene.add(fL);

const screenLights = [];

setProgress(20,'CHARGEMENT SCÈNE 3D');
new GLTFLoader().load('https://assets.frantzimann.org/obj-3D/crt_tv.glb',(gltf)=>{
    setProgress(90,'CONSTRUCTION SCÈNE');
    const orig=gltf.scene;

    for(let i=0;i<tvCount;i++){
        const tv=orig.clone(); const angle=(i/tvCount)*Math.PI*2;
        tv.position.x=Math.sin(angle)*radius; tv.position.z=Math.cos(angle)*radius; tv.rotation.y=angle+Math.PI;

        tv.traverse((c)=>{
            if(!c.isMesh)return;
            if(c.material) c.material.aoMapIntensity=1.5;
            if((c.material&&c.material.name==='TVScreen')||c.name==='defaultMaterial_3'){

                const activeVideo = projectTextures[i] || null;

                c.material = new THREE.ShaderMaterial({
                    uniforms: THREE.UniformsUtils.clone(CRTShader.uniforms),
                    vertexShader: CRTShader.vertexShader,
                    fragmentShader: CRTShader.fragmentShader
                });
                c.material.uniforms.tDiffuse.value = activeVideo;
                if(ENABLE_RGB) c.material.uniforms.tRGB.value = rgbTexture;

                c.material.onBeforeCompile = (shader) => {
                    shader.fragmentShader = shader.fragmentShader.replace(
                        `gl_FragColor = vec4(color.rgb, 1.0);`,
                        `
                        vec3 finalColor = color.rgb;
                        float specular = pow(max(0.0, 1.0 - length(vCentered * 0.8)), 4.0) * 0.2;
                        finalColor += specular;
                        float fresnel = pow(length(vCentered) * 0.5, 3.0) * 0.15;
                        finalColor += fresnel;
                        gl_FragColor = vec4(finalColor, 1.0);
                        `
                    );
                };
            }
        });

        carouselGroup.add(tv);
    }
    /* Cache : évite traverse() à chaque frame */
    carouselGroup.children.forEach(tv => {
        tvObjects.push(tv);
        tv.traverse(c => {
            if(c.isMesh && c.material && c.material.uniforms && c.material.uniforms.time)
                timeMaterials.push(c.material);
        });
    });

    if(ENABLE_SCREEN_LIGHT) {
        const screenLight = new THREE.PointLight(0xffffff, 2.5, 2.8);
        screenLight.position.set(0, 0.1, 1.5);
        scene.add(screenLight);
        screenLights.push(screenLight);
    }
    gltfLoaded=true; checkAllLoaded();

    setTimeout(()=>{
        projectPreview.innerText = projectNames;
        projectPreview.classList.remove('visible');
        btnProject.classList.remove('visible');
        btnProject.style.display = 'none';
    },1000);
},(xhr)=>{ if(xhr.total) setProgress(20+(xhr.loaded/xhr.total)*68,'CHARGEMENT MODÈLE 3D'); });

window.addEventListener('resize',()=>{ camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth,window.innerHeight); composer.setSize(window.innerWidth,window.innerHeight); });

// ── Gestion centralisée des vidéos ──
window.pauseVideos  = () => projectVideos.forEach(v => v.pause());
window.resumeVideos = () => projectVideos.forEach(v => v.play().catch(()=>{}));

// Débloque l'autoplay au premier geste utilisateur
document.addEventListener('click',     () => { if(window.currentPage==='selects') window.resumeVideos(); }, { once:true });
document.addEventListener('touchstart', () => { if(window.currentPage==='selects') window.resumeVideos(); }, { once:true });

// Canvas pour sampler la couleur moyenne des vidéos
const tvVideoSources = projectVideos;
const sampleCvs = document.createElement('canvas');
sampleCvs.width = 4; sampleCvs.height = 4;
const sampleCtx2d = sampleCvs.getContext('2d', { willReadFrequently: true });

// ── Boucle 3D contrôlée ──
let verticalOffset=0, frameCount=0, rafId3d=null;

function tick3d() {
    const time = Date.now() * 0.001;
    scrollCurrent+=(scrollTarget-scrollCurrent)*0.02; carouselGroup.rotation.y=-scrollCurrent;
    const ty=isProjectOpen?3:0; verticalOffset+=(ty-verticalOffset)*0.09; carouselGroup.position.y=verticalOffset;

    if(!isProjectOpen) tvObjects.forEach((tv,i) => { tv.position.y=Math.sin(time+i)*0.05; });
    timeMaterials.forEach(mat => { mat.uniforms.time.value = time; });

    if(ENABLE_SCREEN_LIGHT && frameCount % 6 === 0 && screenLights.length) {
        const light = screenLights[0];
        const vid = tvVideoSources[currentActiveIndex] || tvVideoSources[0];
        if(vid && vid.readyState >= 2) {
            try {
                sampleCtx2d.drawImage(vid, 0, 0, 4, 4);
                const px = sampleCtx2d.getImageData(0, 0, 4, 4).data;
                let rr=0, gg=0, bb=0;
                for(let p=0; p<px.length; p+=4){ rr+=px[p]; gg+=px[p+1]; bb+=px[p+2]; }
                const n = px.length / 4;
                const lr=rr/n/255, lg=gg/n/255, lb=bb/n/255;
                const luma=lr*0.2126+lg*0.7152+lb*0.0722;
                const tr=luma+(lr-luma)*2, tg=luma+(lg-luma)*2, tb=luma+(lb-luma)*2;
                light.color.r+=(tr-light.color.r)*0.35;
                light.color.g+=(tg-light.color.g)*0.35;
                light.color.b+=(tb-light.color.b)*0.35;
            } catch(e) {}
        }
    }
    frameCount++;
    composer.render();
    rafId3d = requestAnimationFrame(tick3d);
}

window.start3D = () => { if(!rafId3d) tick3d(); };
window.stop3D  = () => { if(rafId3d){ cancelAnimationFrame(rafId3d); rafId3d=null; } };

window.start3D();

// ── Page Visibility API — onglet navigateur masqué ──
document.addEventListener('visibilitychange', () => {
    if(document.hidden) {
        window.stop3D();
        window.pauseVideos();
        if(window.stopPhotoWheel) window.stopPhotoWheel();
        if(window.stopInfoCube)   window.stopInfoCube();
    } else {
        if(window.currentPage === 'selects') { window.start3D(); window.resumeVideos(); }
        if(window.currentPage === 'photo'   && window.startPhotoWheel) window.startPhotoWheel();
        if(window.currentPage === 'info'    && window.startInfoCube)   window.startInfoCube();
    }
});

// ── Scène cube — section INFO ──
(function() {
    const cvs = document.getElementById('info-cube-canvas');
    const rightEl = document.getElementById('info-right');

    const iRenderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true, alpha: true });
    iRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    iRenderer.setClearColor(0x000000, 0);

    const iScene  = new THREE.Scene();
    const iCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 50);
    iCamera.position.set(2.8, 1.6, 3.5);
    iCamera.lookAt(0, 0, 0);

    iScene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const dKey = new THREE.DirectionalLight(0xffffff, 2.5);
    dKey.position.set(4, 6, 3); iScene.add(dKey);
    const dFill = new THREE.DirectionalLight(0xff2200, 1.2);
    dFill.position.set(-3, -2, 1); iScene.add(dFill);
    const dRim = new THREE.DirectionalLight(0x4444ff, 0.6);
    dRim.position.set(0, -4, -3); iScene.add(dRim);

    const cube = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 1.6, 1.6),
        new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.25, metalness: 0.9 })
    );
    iScene.add(cube);

    function resize() {
        const w = rightEl.clientWidth || window.innerWidth / 2;
        const h = rightEl.clientHeight || window.innerHeight;
        iRenderer.setSize(w, h);
        iCamera.aspect = w / h;
        iCamera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);

    let iRaf = null;
    const PERIOD = 5000;

    window.startInfoCube = function() {
        resize();
        if(iRaf) return;
        function tick() {
            cube.rotation.z = (performance.now() / PERIOD) * Math.PI * 2;
            iRenderer.render(iScene, iCamera);
            iRaf = requestAnimationFrame(tick);
        }
        tick();
    };
    window.stopInfoCube = function() {
        if(iRaf) { cancelAnimationFrame(iRaf); iRaf = null; }
    };
})();
