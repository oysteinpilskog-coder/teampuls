/**
 * Globus-«wow»-effekter: dag/natt-terminator, prosedurale skyer,
 * nordlys, stjerneskudd. Holdes utenfor `globe-canvas.tsx` så den
 * filen kan fokusere på pin-oppsett og label-overlay.
 *
 * Alt her er ren three.js — ingen avhengighet til React. Hver factory
 * returnerer enten et `Object3D` du kan adde til scene-grafen, eller
 * en oppdaterer du kaller per frame for å skyve uniforms videre.
 */

import * as THREE from 'three'

/* ── Sol-posisjon ────────────────────────────────────────────── */

/**
 * Subsolar-punktet (latitude/longitude der sola står rett over) for
 * en gitt UTC-dato. Dekklinasjon fra forenklet astronomisk modell —
 * ±0.4° feil ift. ekte ephemeris, godt nok for visuell terminator.
 *
 * Returnerer en enhetsvektor i three-globe sitt koordinatsystem
 * (samme `unitCart`-konvensjon som pinnene bruker), klar til å
 * sendes inn som `uSunDir` i dag/natt-shaderen.
 */
export function sunDirectionAt(now: Date): THREE.Vector3 {
  // Dagsnummer i året (0–365)
  const start = Date.UTC(now.getUTCFullYear(), 0, 0)
  const diff = now.getTime() - start
  const dayOfYear = diff / 86_400_000

  // Solens deklinasjon — sinusoid med topp ~21. juni (dag 172).
  const decRad = (-23.44 * Math.PI / 180) * Math.cos((2 * Math.PI * (dayOfYear + 10)) / 365)

  // Subsolar-lengdegrad: -15°/time fra 12 UTC. Westover 360°/24h.
  const utcHours =
    now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600
  const subsolarLngDeg = -15 * (utcHours - 12)

  const lat = (decRad * 180) / Math.PI
  const lng = subsolarLngDeg

  // Samme konvensjon som GlobeCanvas.unitCart — speilet x-akse så
  // dot-produkt mot kameraposisjon fra three-globe stemmer.
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lng + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -Math.sin(phi) * Math.cos(theta),
    Math.cos(phi),
    Math.sin(phi) * Math.sin(theta),
  )
}

/* ── Dag/natt-shader ─────────────────────────────────────────── */

const EARTH_DAY_TEX = 'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg'
const EARTH_NIGHT_TEX = 'https://unpkg.com/three-globe/example/img/earth-night.jpg'

export interface DayNightMaterial {
  material: THREE.ShaderMaterial
  setSunDir: (v: THREE.Vector3) => void
}

/**
 * Bygger en `ShaderMaterial` som blender mellom day-tekstur og
 * night-tekstur etter solens vinkel mot hver pixel. Smooth
 * terminator + varm rim-glød der sola tangerer horisonten.
 *
 * Tekstur-fargerommet settes til SRGB så Earth-tekstur-koblingen
 * matcher resten av three.js (linear i shader, sRGB ut). Uten dette
 * blir oseanene seende mørke og «blassede» ut.
 */
export function buildDayNightMaterial(): DayNightMaterial {
  const loader = new THREE.TextureLoader()
  loader.setCrossOrigin('anonymous')

  const dayTex = loader.load(EARTH_DAY_TEX)
  const nightTex = loader.load(EARTH_NIGHT_TEX)
  dayTex.colorSpace = THREE.SRGBColorSpace
  nightTex.colorSpace = THREE.SRGBColorSpace
  dayTex.anisotropy = 4
  nightTex.anisotropy = 4

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uDayMap: { value: dayTex },
      uNightMap: { value: nightTex },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
      uAtmosphere: { value: new THREE.Color('#4a90e2') },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        // For three-globe sin standard SphereGeometry er position
        // i mesh-rom == world (mesh has no rotation/translation
        // applied at start), så vi normaliserer lokal posisjon
        // direkte. Hvis fremtiden roterer globen blir dette
        // automatisk riktig fordi modelMatrix-bidraget også
        // appliceres på normal som direction (w=0).
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D uDayMap;
      uniform sampler2D uNightMap;
      uniform vec3 uSunDir;
      uniform vec3 uAtmosphere;
      varying vec3 vWorldNormal;
      varying vec2 vUv;

      void main() {
        vec3 day = texture2D(uDayMap, vUv).rgb;
        vec3 night = texture2D(uNightMap, vUv).rgb;

        float lambert = dot(vWorldNormal, normalize(uSunDir));

        // Glatt overgang gjennom terminator-sonen. Bredden styrer
        // hvor lang og «filmisk» daggryet føles.
        float dayMix = smoothstep(-0.18, 0.28, lambert);

        // Boost natt-tekstur litt — den er dump i original.
        vec3 col = mix(night * 1.55, day * 1.08, dayMix);

        // Varm gylden rim akkurat ved terminator. exp-tail gir en
        // tynn, sterk linje uten å smøre lyset utover dagsiden.
        float rim = exp(-pow((lambert + 0.05) * 6.0, 2.0)) * 0.55;
        col += vec3(1.0, 0.55, 0.25) * rim;

        // Subtil atmospheric tint på lyssiden — gjør oseanene mer
        // CalWin-blå uten å dra over fargene.
        col = mix(col, col + uAtmosphere * 0.04, dayMix * 0.6);

        gl_FragColor = vec4(col, 1.0);
      }
    `,
  })

  return {
    material,
    setSunDir: (v: THREE.Vector3) => {
      const u = material.uniforms.uSunDir.value as THREE.Vector3
      u.copy(v)
    },
  }
}

/* ── Prosedurale skyer ───────────────────────────────────────── */

export interface CloudLayer {
  mesh: THREE.Mesh
  /** Push frame-tid (sekunder) inn i shader-uniformen + roter litt. */
  tick: (deltaSeconds: number, totalSeconds: number) => void
  setSunDir: (v: THREE.Vector3) => void
}

/**
 * Prosedural sky-sfære: samme radius som globen × 1.012 (~+1.2%),
 * gjennomsiktig material med fbm-støy. Skyene driver sakte over
 * planeten via en time-uniform og ekstra mesh-rotasjon — gir
 * paralakse mot terrenget under. Skyene skygges også av sola så
 * de blir mørkere på nattsiden i stedet for å glore på alle vinkler.
 */
export function buildCloudLayer(globeRadius: number): CloudLayer {
  // Litt høyoppløst geometri så støy-kantene leser glatt selv på
  // 4K-skjermer; segments=96 er fortsatt under 20k triangler.
  // 1.008× radius — skyene hugger overflaten tettere så paralaksen
  // mot terrenget leser tydelig på zoom-inn uten at vi får et
  // synlig «luftrom» mellom skydekke og land.
  const geometry = new THREE.SphereGeometry(globeRadius * 1.008, 96, 64)

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    uniforms: {
      uTime: { value: 0 },
      uSunDir: { value: new THREE.Vector3(1, 0, 0) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vUvSphere;
      void main() {
        vWorldNormal = normalize((modelMatrix * vec4(normal, 0.0)).xyz);
        // Bruk lokal posisjon som sample-domene — sphere-uv har
        // brutal pol-distorsjon, mens position på enhetssfæren gir
        // 3D-støy uten sømmer ved datolinjen.
        vUvSphere = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uSunDir;
      varying vec3 vWorldNormal;
      varying vec3 vUvSphere;

      // Iquilezles-style hash & 3D value noise — kompakt og
      // bånd-fri på sfæroverflaten.
      float hash(vec3 p) {
        p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
        p *= 17.0;
        return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
      }
      float noise(vec3 x) {
        vec3 i = floor(x);
        vec3 f = fract(x);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(mix(hash(i + vec3(0,0,0)), hash(i + vec3(1,0,0)), f.x),
              mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
          mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
              mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y),
          f.z
        );
      }
      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.07;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        // Driv skyene mot øst i langsom tempo. Sample-frekvens 7.5
        // gir enkeltskyer på ~200–500 km bredde — vesentlig mindre
        // og mer realistisk enn de kontinent-store massene man får
        // ved 3-4× (som leser «Mars-mønstre» fra kameraets avstand).
        vec3 p = vUvSphere * 7.5 + vec3(uTime * 0.012, 0.0, 0.0);
        float n = fbm(p);
        // Ekstra pass-by for «cirrus»-stripenivå — finskala virvler
        // som ligger oppå hovedskyene.
        float cirrus = fbm(p * 2.6 + vec3(uTime * 0.018, 1.7, 0.0));
        // Smalere terskler enn før så skydekket blir glissent i
        // stedet for å lukke seg over hele globen. Landformene må
        // skinne gjennom for at zoom-inn skal lønne seg.
        float density = smoothstep(0.55, 0.82, n) + smoothstep(0.70, 0.95, cirrus) * 0.28;
        density = clamp(density, 0.0, 1.0);

        // Sky-skygge fra sola: nattsiden fader ned til mørk grå
        // i stedet for å lyse hvitt. smoothstep matcher dag/natt-
        // miksen i terrenget så skyene «mørkner i samme tempo».
        float lambert = dot(vWorldNormal, normalize(uSunDir));
        float lit = smoothstep(-0.2, 0.3, lambert);
        vec3 lightCol = mix(vec3(0.18, 0.20, 0.28), vec3(1.0, 0.97, 0.92), lit);

        // Solnedgangs-tint langs terminator
        float rim = exp(-pow((lambert + 0.05) * 5.5, 2.0)) * 0.7;
        lightCol += vec3(1.0, 0.5, 0.25) * rim * density;

        // Svakere total alpha enn før (0.55 vs 0.72) — på zoom-inn
        // ville 0.72 dekke landformene helt; 0.55 lar dem leses
        // gjennom mens skyene fortsatt har klar identitet.
        gl_FragColor = vec4(lightCol, density * 0.55);
      }
    `,
  })

  const mesh = new THREE.Mesh(geometry, material)
  // Skyene må tegnes etter globen ellers ser man dem gjennom
  // jordkulen på baksiden via depthTest-sammenligning.
  mesh.renderOrder = 1

  return {
    mesh,
    tick: (_dt, total) => {
      ;(material.uniforms.uTime.value as number) = total
      // Egen mesh-rotasjon legger på uavhengig vind-paralakse
      // mot grunnen under (selv om kamera står stille).
      mesh.rotation.y = total * 0.003
    },
    setSunDir: (v) => {
      const u = material.uniforms.uSunDir.value as THREE.Vector3
      u.copy(v)
    },
  }
}

/* ── Nordlys ─────────────────────────────────────────────────── */

export interface AuroraLayer {
  group: THREE.Group
  tick: (deltaSeconds: number, totalSeconds: number) => void
}

/**
 * To koniske «gardiner» rundt magnetiske polkalotter — en på Nord-
 * og en på Sørpolen. Render-orden settes etter skyene så nordlyset
 * tegnes oppå atmosfæren men uten depth-write (additivt blend).
 *
 * Geometrien er en LatheGeometry rotert om y-aksen, der profilen
 * vokser litt utover med høyden så bandet legger seg som en
 * trompet rundt polen i stedet for en flat skive.
 */
export function buildAuroraLayer(globeRadius: number): AuroraLayer {
  const group = new THREE.Group()

  // Profilen — i lokal-rom for hver kalott. Punktene definerer en
  // halv-tverrsnitt i (radius, height); LatheGeometry roterer dem
  // om y-aksen for å lage gardinet.
  const r = globeRadius
  const auroraProfile: THREE.Vector2[] = []
  // Nedre kant ved breddegrad ~63°, øvre ved ~78°. Tilpasset så
  // skandinavia/finland akkurat klipper inn under bandets nedre rand.
  const lats = [62, 65, 68, 71, 74, 77, 80]
  for (const lat of lats) {
    const phi = ((90 - lat) * Math.PI) / 180
    // Litt hevet over overflaten så det ikke z-fighter med skyene.
    const rr = r * 1.018 + (lat - 62) * 0.05
    auroraProfile.push(new THREE.Vector2(Math.sin(phi) * rr, Math.cos(phi) * rr))
  }

  function buildHalf(flipY: boolean): THREE.Mesh {
    const geometry = new THREE.LatheGeometry(auroraProfile, 128)
    if (flipY) geometry.scale(1, -1, 1)

    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        // Hovedfarge skifter sakte mellom emerald-grønn og turkis-
        // cyan; en slumset, blod-rosa biting fra nede legges på
        // toppen som en lysbølge.
        uColorBase: { value: new THREE.Color('#36ffb0') },
        uColorTop: { value: new THREE.Color('#7ad7ff') },
        uColorAccent: { value: new THREE.Color('#c474ff') },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorldPos;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColorBase;
        uniform vec3 uColorTop;
        uniform vec3 uColorAccent;
        varying vec3 vWorldPos;
        varying vec2 vUv;

        // Sinusbølger med ulike faser/perioder i bredderetning —
        // gir karakteristisk «gardin-flagring». uv.x går rundt om
        // polen (0..1), uv.y går opp gardinet (0..1).
        float curtain(float x, float t) {
          return
            sin(x * 38.0 + t * 0.6) * 0.5 +
            sin(x * 17.0 - t * 0.4 + 1.7) * 0.3 +
            sin(x * 71.0 + t * 0.9 + 3.1) * 0.2;
        }

        void main() {
          float band = curtain(vUv.x, uTime);
          // Vertikal envelope — sterkest nede, fader opp.
          float vEnv = pow(1.0 - vUv.y, 1.4);
          // Lateral envelope — gjør lyset til diskrete vertikale
          // søyler, ikke en jevn ring rundt polen.
          float lateral = smoothstep(0.0, 0.12, band + 0.55);
          float intensity = vEnv * lateral;

          // Farge-gradient: grønn nede, turkis oppe, lilla-aksent
          // pulserer inn periodisk.
          float pulse = 0.5 + 0.5 * sin(uTime * 0.27 + vUv.x * 6.28);
          vec3 col = mix(uColorBase, uColorTop, vUv.y);
          col = mix(col, uColorAccent, pulse * vEnv * 0.35);

          // Tynn sterk topp-rim som «brennende kant» på flammene.
          float topGlow = smoothstep(0.7, 0.95, band) * vEnv * 1.2;
          col += vec3(0.8, 1.0, 0.95) * topGlow;

          gl_FragColor = vec4(col, intensity * 0.55);
        }
      `,
    })

    return new THREE.Mesh(geometry, material)
  }

  const north = buildHalf(false)
  const south = buildHalf(true)
  north.renderOrder = 2
  south.renderOrder = 2
  group.add(north, south)

  return {
    group,
    tick: (_dt, total) => {
      ;((north.material as THREE.ShaderMaterial).uniforms.uTime.value as number) = total
      ;((south.material as THREE.ShaderMaterial).uniforms.uTime.value as number) = total
      // Sakte rotasjon — magnetisk pol driver, men ikke synlig på
      // korte tidsskalaer; her er det rent estetisk.
      north.rotation.y = total * 0.02
      south.rotation.y = -total * 0.018
    },
  }
}

/* ── Stjerneskudd ────────────────────────────────────────────── */

export interface ShootingStarLayer {
  group: THREE.Group
  tick: (deltaSeconds: number, totalSeconds: number) => void
}

/**
 * Stjerneskudd langt bak globen — én av gangen, kommer ~hvert 18-32.
 * sek, krysser et tilfeldig segment av himmelen og fader. Bruker en
 * line-segment-mesh med en gradient-tail via vertex-attributter.
 */
export function buildShootingStars(): ShootingStarLayer {
  const group = new THREE.Group()
  // Posisjoner stjerneskuddene langt bak globen så de leses som
  // himmel-fenomen, ikke som «UFO foran kameraet».
  const FAR = 600

  const SEGMENTS = 24
  const positions = new Float32Array(SEGMENTS * 3)
  const alphas = new Float32Array(SEGMENTS)
  for (let i = 0; i < SEGMENTS; i++) {
    alphas[i] = 1 - i / (SEGMENTS - 1)
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1))

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute float aAlpha;
      varying float vAlpha;
      void main() {
        vAlpha = aAlpha;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uOpacity;
      varying float vAlpha;
      void main() {
        // Hvit kjerne med blå hale — matcher nattehimmelen.
        vec3 col = mix(vec3(0.6, 0.8, 1.0), vec3(1.0, 1.0, 1.0), vAlpha);
        gl_FragColor = vec4(col, vAlpha * uOpacity);
      }
    `,
  })

  const line = new THREE.Line(geometry, material)
  line.frustumCulled = false
  line.renderOrder = -1
  group.add(line)

  // Aktiv tilstand: posisjon og retning i 3D-rom.
  let active = false
  let nextSpawn = 4 // første stjerneskudd 4 sek etter mount
  let life = 0
  let lifespan = 1
  const start = new THREE.Vector3()
  const dir = new THREE.Vector3()
  const trailLen = 80 // verden-units; ~13% av FAR

  function spawn() {
    // Tilfeldig retning på en hemisfære bak kameraet. theta over
    // hele 0..2π, phi smal i øvre halvkule så streken sjelden går
    // gjennom globens silhuett.
    const theta = Math.random() * Math.PI * 2
    const phi = Math.acos(0.4 + Math.random() * 0.5)
    start.set(
      FAR * Math.sin(phi) * Math.cos(theta),
      FAR * Math.cos(phi),
      FAR * Math.sin(phi) * Math.sin(theta),
    )
    // Tangentiell retning — kryss-produkt mot opp-vektor gir en
    // bevegelse «over himmelen» i stedet for inn/ut fra kameraet.
    const up = new THREE.Vector3(0, 1, 0)
    dir.copy(start).cross(up).normalize()
    // 50% sjanse for å reversere så stjerneskudd kommer fra begge
    // retninger, ikke kun «til høyre».
    if (Math.random() < 0.5) dir.multiplyScalar(-1)
    life = 0
    lifespan = 0.9 + Math.random() * 0.5
    active = true
  }

  return {
    group,
    tick: (dt, _total) => {
      if (!active) {
        nextSpawn -= dt
        if (nextSpawn <= 0) {
          spawn()
          nextSpawn = 18 + Math.random() * 14
        }
        ;(material.uniforms.uOpacity.value as number) = 0
        return
      }
      life += dt
      const t = life / lifespan
      if (t >= 1) {
        active = false
        ;(material.uniforms.uOpacity.value as number) = 0
        return
      }
      // Posisjoner SEGMENTS punkter langs en strek fra hode → hale.
      // Hodet flytter seg med tiden; halen ligger en `trailLen`
      // bak hodet i `-dir`-retning.
      const head = new THREE.Vector3()
        .copy(start)
        .addScaledVector(dir, t * 240) // hodet beveger seg
      const tail = new THREE.Vector3()
        .copy(head)
        .addScaledVector(dir, -trailLen)
      const arr = positions
      for (let i = 0; i < SEGMENTS; i++) {
        const f = i / (SEGMENTS - 1)
        arr[i * 3 + 0] = head.x * (1 - f) + tail.x * f
        arr[i * 3 + 1] = head.y * (1 - f) + tail.y * f
        arr[i * 3 + 2] = head.z * (1 - f) + tail.z * f
      }
      ;(geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true
      // Fade ut mot slutt — bell-formet kurve så midten er sterkest.
      const fade = Math.sin(t * Math.PI)
      ;(material.uniforms.uOpacity.value as number) = fade * 0.85
    },
  }
}

/* ── Premium pin-ikoner ──────────────────────────────────────── */

/**
 * Pin-mesh-håndtak — eksponert til kall-stedet så det kan endre
 * fargen når et kontor flipper status (åpner/stenger på timetimer)
 * uten å bygge meshen på nytt.
 */
export interface PinHandle {
  group: THREE.Object3D
  setColor: (hex: string) => void
}

/**
 * Tre-lags pin-ikon som leser som «levende beacon» på TV-en:
 *
 *  1. **Kjerne** — liten lyssterk sphere i statusfargen. Bloom-pass
 *     i postprocessing tar denne og gir den ekte glød uten at vi
 *     trenger å fake en lysmaske.
 *  2. **Halo** — større semi-transparent sphere rundt kjernen som
 *     lar bloomen smøre utover og gir pinnen volum. Bruker
 *     additive blending så den legger seg over skyer/atmosfære
 *     uten å mørke dem.
 *  3. **Stem** — tynn 1-pikselsline fra overflaten opp til pinnen.
 *     Gradient så den fader inn mot kjernen og leser som «peker
 *     ned mot byen» istedenfor en hengende dråpe.
 *
 *  HQ-pinnen får et 4-spiss stjerne-overlay i gull og en større
 *  halo så øyet umiddelbart finner moderskipet i klyngen.
 *
 *  Pinnen plasseres av globe.gl (objectAltitude i kall-stedet);
 *  vi bygger bare i lokal-rom rundt origo. Stem-en peker nedover
 *  langs lokalt -y (inn mot globens sentrum) — globe.gl orienterer
 *  hele meshen så y-aksen står normalt på sfæroverflaten.
 */
export function buildPinMesh(opts: {
  isHq: boolean
  hex: string
}): PinHandle {
  const { isHq, hex } = opts
  const group = new THREE.Group()
  const color = new THREE.Color(hex)

  // Stem — nedover fra pinnen (sentrum) mot globen. Tre-globe
  // orienterer object-Y normalt på overflaten, så vi setter
  // basen i (0, -altOffset, 0) der altOffset matcher den virkelige
  // PIN_ALT som globe.gl skyver pinnen opp.
  const stemHeight = isHq ? 1.6 : 1.2
  const stemGeom = new THREE.BufferGeometry()
  stemGeom.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([0, 0, 0, 0, -stemHeight, 0]),
      3,
    ),
  )
  const stemMat = new THREE.LineBasicMaterial({
    color: color.clone(),
    transparent: true,
    opacity: 0.55,
  })
  const stem = new THREE.Line(stemGeom, stemMat)
  group.add(stem)

  // Halo — myk ytre kappe som bloomen kan smøre på.
  const haloRadius = isHq ? 1.4 : 0.95
  const haloMat = new THREE.MeshBasicMaterial({
    color: color.clone(),
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(haloRadius, 20, 16),
    haloMat,
  )
  halo.renderOrder = 3
  group.add(halo)

  // Kjerne — full-bright lyspunkt. MeshBasicMaterial så den lyser
  // konstant uavhengig av lysretning (ingen lyskilde i scenen).
  const coreRadius = isHq ? 0.55 : 0.4
  const coreMat = new THREE.MeshBasicMaterial({ color: color.clone() })
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(coreRadius, 20, 16),
    coreMat,
  )
  core.renderOrder = 4
  group.add(core)

  // HQ får i tillegg et 4-spiss «sparkle»-overlay i gull, lett
  // forskjøvet i +y-aksen (oppover, vekk fra globen) så det blinker
  // over kjernen og signaliserer ankerpunktet.
  let hqStarMat: THREE.MeshBasicMaterial | null = null
  if (isHq) {
    const starShape = new THREE.Shape()
    const outer = 1.3
    const inner = 0.45
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? outer : inner
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2
      const x = Math.cos(a) * r
      const y = Math.sin(a) * r
      if (i === 0) starShape.moveTo(x, y)
      else starShape.lineTo(x, y)
    }
    starShape.closePath()
    hqStarMat = new THREE.MeshBasicMaterial({
      color: 0xfde68a,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    const star = new THREE.Mesh(new THREE.ShapeGeometry(starShape), hqStarMat)
    // Vendt utover mot kameraet — three-globe roterer hele
    // object-en så z-aksen peker fra globe-sentrum mot kontoret;
    // stjernen sitter da automatisk «vendt mot rommet».
    star.position.y = 0.05
    star.rotation.x = -Math.PI / 2
    star.renderOrder = 5
    group.add(star)
  }

  return {
    group,
    setColor: (newHex: string) => {
      const c = new THREE.Color(newHex)
      ;(coreMat.color as THREE.Color).copy(c)
      ;(haloMat.color as THREE.Color).copy(c)
      ;(stemMat.color as THREE.Color).copy(c)
      // HQ-stjernen er alltid gull; ikke endres ved status-flip.
    },
  }
}

/* ── Hjelper: finn globe-mesh i scene-grafen ─────────────────── */

/**
 * three-globe putter Earth-meshen som en SphereGeometry med ~100 i
 * radius i sin egen `Group` som child av sceneroten. Denne
 * traverserer scene-grafen og finner den første SphereGeometry-
 * meshen som er stor nok til å være globen — robust mot at
 * three-globe legger inn flere mesher (atmospheres, custom layers).
 */
export function findGlobeMesh(scene: THREE.Object3D): THREE.Mesh | null {
  let best: THREE.Mesh | null = null
  let bestRadius = 0
  scene.traverse(obj => {
    const m = obj as THREE.Mesh
    if (!(m as THREE.Object3D).isObject3D) return
    if (!('geometry' in m) || !m.geometry) return
    if (!(m.geometry instanceof THREE.SphereGeometry)) return
    const params = (m.geometry as THREE.SphereGeometry).parameters
    if (!params) return
    if (params.radius > bestRadius) {
      best = m
      bestRadius = params.radius
    }
  })
  return best
}
