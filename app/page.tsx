"use client";

import { useEffect, useRef, useState } from "react";
import MemoryGame from "./MemoryGame";

type SpotifyPlaybackEvent = {
  data?: {
    duration?: number;
    isBuffering?: boolean;
    isPaused?: boolean;
    playingURI?: string;
    position?: number;
  };
};

type SpotifyEmbedController = {
  addListener: (event: string, callback: (event: SpotifyPlaybackEvent) => void) => void;
  destroy?: () => void;
  loadUri?: (uri: string, preferVideo?: boolean, startAt?: number) => void;
  play?: () => void;
  resume?: () => void;
  seek?: (seconds: number) => void;
};

type SpotifyIframeApi = {
  createController: (
    element: HTMLElement,
    options: { height: number; uri: string; width: string },
    callback: (controller: SpotifyEmbedController) => void,
  ) => void;
};

declare global {
  interface Window {
    __aliSpotifyApi?: SpotifyIframeApi;
    __aliSpotifyApiPromise?: Promise<SpotifyIframeApi>;
    onSpotifyIframeApiReady?: (api: SpotifyIframeApi) => void;
  }
}

const SONG_WINDOW_MS = 10000;
const SONG_EXIT_MS = 900;

function ensureSpotifyIframeApi() {
  if (window.__aliSpotifyApi) return Promise.resolve(window.__aliSpotifyApi);
  if (window.__aliSpotifyApiPromise) return window.__aliSpotifyApiPromise;

  window.__aliSpotifyApiPromise = new Promise<SpotifyIframeApi>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.__aliSpotifyApiPromise = undefined;
      reject(new Error("Spotify tardó demasiado en responder"));
    }, 9000);

    window.onSpotifyIframeApiReady = (api) => {
      window.clearTimeout(timeout);
      window.__aliSpotifyApi = api;
      resolve(api);
    };

    if (!document.querySelector('script[data-ali-spotify-api="true"]')) {
      const script = document.createElement("script");
      script.src = "https://open.spotify.com/embed/iframe-api/v1";
      script.async = true;
      script.dataset.aliSpotifyApi = "true";
      script.addEventListener("error", () => {
        window.clearTimeout(timeout);
        window.__aliSpotifyApiPromise = undefined;
        reject(new Error("No se pudo cargar Spotify"));
      }, { once: true });
      document.body.appendChild(script);
    }
  });

  return window.__aliSpotifyApiPromise;
}

type SoundtrackSong = {
  title: string;
  album: string;
  artist: "Ariana Grande" | "Sabrina Carpenter";
  spotifyId: string;
  background: string;
  ink: string;
  accent: string;
  soft: string;
  lyric: string;
  lyricPosition: number;
  lyricStartSeconds: number;
};

const soundtrack: SoundtrackSong[] = [
  {
    title: "intro (end of the world)",
    album: "eternal sunshine",
    artist: "Ariana Grande",
    spotifyId: "2o1pb13quMReXZqE7jWsgq",
    background: "#b74658",
    ink: "#fff7f0",
    accent: "#7f1f36",
    soft: "#e9a5ad",
    lyric: "How can I tell if I'm in the right relationship?",
    lyricPosition: 0,
    lyricStartSeconds: 1,
  },
  {
    title: "pov",
    album: "positions",
    artist: "Ariana Grande",
    spotifyId: "3UoULw70kMsiVXxW0L3A33",
    background: "#688476",
    ink: "#fffaf1",
    accent: "#294b3c",
    soft: "#abc1b4",
    lyric: "I wanna love me the way that you love me",
    lyricPosition: 1,
    lyricStartSeconds: 51,
  },
  {
    title: "Moonlight",
    album: "Dangerous Woman",
    artist: "Ariana Grande",
    spotifyId: "2ZHH9aoZjrqtFk1SX1dXy7",
    background: "#403b4c",
    ink: "#fff9ff",
    accent: "#211d2c",
    soft: "#aa98ba",
    lyric: "'Cause I never knew, I never knew",
    lyricPosition: 2,
    lyricStartSeconds: 43,
  },
  {
    title: "Tattooed Heart",
    album: "Yours Truly",
    artist: "Ariana Grande",
    spotifyId: "7JmIjOsRish3vYBSLTytEC",
    background: "#a9688f",
    ink: "#fff8fc",
    accent: "#673557",
    soft: "#d9abc7",
    lyric: "I'm the name on your tattooed heart",
    lyricPosition: 3,
    lyricStartSeconds: 42,
  },
  {
    title: "My Everything",
    album: "My Everything",
    artist: "Ariana Grande",
    spotifyId: "0b0hbaQZnkFDOGjOUkIbUK",
    background: "#66738f",
    ink: "#fbfcff",
    accent: "#303a54",
    soft: "#adb7cc",
    lyric: "You are, you are my everything",
    lyricPosition: 4,
    lyricStartSeconds: 56,
  },
  {
    title: "get well soon",
    album: "Sweetener",
    artist: "Ariana Grande",
    spotifyId: "7u6DMPznGbpziuEgCE0JGQ",
    background: "#b9765f",
    ink: "#fffaf5",
    accent: "#754231",
    soft: "#dfb19e",
    lyric: "Girl, what's wrong with you? Come back down",
    lyricPosition: 5,
    lyricStartSeconds: 5,
  },
  {
    title: "ordinary things (feat. Nonna)",
    album: "eternal sunshine",
    artist: "Ariana Grande",
    spotifyId: "4mHM5d2fK3n8xgymjf92w2",
    background: "#a33d50",
    ink: "#fff8f2",
    accent: "#6d1e31",
    soft: "#dda0aa",
    lyric: "There's never gonna be an ordinary thing",
    lyricPosition: 6,
    lyricStartSeconds: 54,
  },
  {
    title: "imperfect for you",
    album: "eternal sunshine",
    artist: "Ariana Grande",
    spotifyId: "6XXKB32Om6WuXg3uEWwTob",
    background: "#ad5271",
    ink: "#fff8fb",
    accent: "#762c4d",
    soft: "#dfa7ba",
    lyric: "How could we know we'd rearrange all the cosmos?",
    lyricPosition: 7,
    lyricStartSeconds: 48,
  },
  {
    title: "Espresso",
    album: "Short n' Sweet",
    artist: "Sabrina Carpenter",
    spotifyId: "2qSkIjg1o9h3YT9RAgYN75",
    background: "#2474a3",
    ink: "#f7fcff",
    accent: "#124b70",
    soft: "#91c6df",
    lyric: "That's that me espresso",
    lyricPosition: 8,
    lyricStartSeconds: 26,
  },
  {
    title: "Please Please Please",
    album: "Short n' Sweet",
    artist: "Sabrina Carpenter",
    spotifyId: "5N3hjp1WNayUPZrA8kJmJP",
    background: "#8a8647",
    ink: "#fffef3",
    accent: "#545326",
    soft: "#c9c694",
    lyric: "Please, please, please, don't prove I'm right",
    lyricPosition: 9,
    lyricStartSeconds: 49,
  },
  {
    title: "Feather",
    album: "emails i can't send fwd:",
    artist: "Sabrina Carpenter",
    spotifyId: "2Zo1PcszsT9WQ0ANntJbID",
    background: "#98699e",
    ink: "#fff9ff",
    accent: "#5f3967",
    soft: "#cfadd2",
    lyric: "I feel so much lighter like a feather",
    lyricPosition: 10,
    lyricStartSeconds: 43,
  },
  {
    title: "Nonsense",
    album: "emails i can't send",
    artist: "Sabrina Carpenter",
    spotifyId: "6dgUya35uo964z7GZXM07g",
    background: "#b36f58",
    ink: "#fffaf6",
    accent: "#784130",
    soft: "#dfb29f",
    lyric: "I don't even know, I'm talking nonsense",
    lyricPosition: 11,
    lyricStartSeconds: 47,
  },
];

const birthdayLetter = [
  "Para la persona más especial e importante de mi vida, mi amor:",
  "Holiiisss, hoy es un día muy especial para ti, para mí y para tu familia, porque hoy cumple años el amor de mi vida, la persona que ha logrado hacer mis días más bonitos y que, sin darme cuenta, se convirtió en alguien indispensable para mí.",
  "Hoy no solo quiero desearte un feliz cumpleaños, también quiero recordarte lo muchísimo que significas para mí. Llegaste a mi vida de una manera tan inesperada y sencilla que jamás habría imaginado todo lo que comenzaría después. Hay personas que aparecen solamente por un momento y otras que, sin proponérselo, terminan cambiándolo todo. Tú eres esa persona para mí.",
  "Aún recuerdo el día en que nos conocimos y, la verdad, todavía me da mucha risa pensarlo, quién diría que todo comenzó simplemente porque nos pusieron a adornar casa de cultura JAJAJAJS, entre todas las formas posibles en las que pudimos coincidir, la vida decidió juntarnos ahí. En ese momento no tenía idea de que estaba conociendo a la persona que después se convertiría en el amor de mi vida y en alguien tan importante para mí.",
  "Y sí, tengo que decirlo: gracias a esa mesita toda chafa por todo 🥺. Puede parecer algo pequeño o incluso gracioso, perooo me encanta recordar que algo tan simple terminó formando parte del inicio de nuestra historia. Jamás imaginé que aquel día sería el comienzo de tantas cosas buenas, malas e increíbles; de tantas risas, aprendizajes, momentos difíciles y recuerdos que ahora guardo con muchísimo cariño.",
  "No todo ha sido perfecto, pero incluso en los momentos complicados hemos aprendido cosas que nos han permitido conocernos mejor y fortalecer lo que sentimos. Cada experiencia contigo me ha enseñado algo y me ha hecho entender que el amor no solamente consiste en vivir momentos bonitos, sino también en elegirnos, escucharnos, apoyarnos y seguir mejorando juntos.",
  "Tú me complementas de una manera que no sé explicar completamente. Me haces sentir vivo, me permites ser yo mismo cuando estoy contigo y haces que me sienta querido tal como soy, sin tener que aparentar nada. Contigo puedo reírme, hablar de cualquier cosa, compartir mis pensamientos y sentir que tengo a alguien que realmente me comprende. Eres una persona a quien amo y aprecio muchooooo, más de lo que muchas veces logro expresar con palabras.",
  "Quiero ser para ti mucho más que una pareja. Quiero ser tu lugar seguro cuando sientas que todo se vuelve demasiado pesado, la persona con quien puedas compartir tus alegrías, tus miedos, tus sueños y también tus días malos. Quiero apoyarte, escucharte y recordarte lo increíble que eres, incluso en aquellos momentos en los que tú misma puedas llegar a olvidarlo.",
  "También quiero seguir aprendiendo contigo, crear muchísimos momentos bonitos y vivir nuevas experiencias a tu lado. Quiero que ambos sigamos creciendo y mejorando, tanto individualmente como juntos, para cuidar y mantener este amor tan bonito que tenemos. Sé que todavía nos quedan muchas cosas por aprender, perooo no quiero aprenderlas con nadie más que contigo.",
  "En este nuevo año de tu vida deseo que cumplas cada una de tus metas, que nunca te falten motivos para sonreír y que recibas todo el amor y la felicidad que mereces. Espero poder acompañarte en cada logro, celebrar tus días felices y abrazarte con más fuerza cuando las cosas no salgan como esperabas.",
  "Gracias por existir, por haber coincidido conmigo aquel día, por permitirme conocerte y por regalarme tantos momentos que jamás imaginé vivir. Hoy celebro tu cumpleaños, pero también celebro la enorme suerte que tengo de compartir mi vida contigo.",
  "Feliz cumpleaños, mi amor. Espero que hoy tengas un día tan bonito y especial como tú. Te amo muchísimooo y deseo que la vida nos permita seguir celebrando muchos cumpleaños más juntos.",
  "Con todo mi amor y cariño",
  "atentamente: El mayor deudor de coppel 🤗",
].join("\n\n");

const memoryCloudPixels = [
  "000011000000",
  "000111100000",
  "011111111000",
  "111111111110",
  "111111111111",
  "001111111100",
];

function PixelMemoryCloud({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`pixel-cloud-art ${compact ? "is-compact" : ""}`} aria-hidden="true">
      {memoryCloudPixels.flatMap((row, rowIndex) =>
        [...row].map((pixel, columnIndex) => (
          <i className={pixel === "1" ? "is-filled" : "is-empty"} key={`${rowIndex}-${columnIndex}`} />
        )),
      )}
      <span className="pixel-cloud-face"><i /><i /><b /></span>
      <span className="pixel-cloud-spark spark-one">✦</span>
      <span className="pixel-cloud-spark spark-two">♡</span>
      <span className="pixel-cloud-spark spark-three">·</span>
    </span>
  );
}

type PreludeStage = "cake" | "surprise" | "envelope" | "letter" | "memory";

function BirthdayExperience() {
  const [stage, setStage] = useState<PreludeStage>("cake");
  const [cakeBites, setCakeBites] = useState(0);
  const [candlesBlowing, setCandlesBlowing] = useState(false);
  const [candlesOut, setCandlesOut] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [giftOpen, setGiftOpen] = useState(false);
  const [songOrder, setSongOrder] = useState(() => soundtrack.map((_, index) => index));
  const [songIndex, setSongIndex] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const [typedLength, setTypedLength] = useState(0);
  const [lyricTypedLength, setLyricTypedLength] = useState(0);
  const [spotifyPlaying, setSpotifyPlaying] = useState(false);
  const [spotifyReady, setSpotifyReady] = useState(false);
  const [spotifyUnavailable, setSpotifyUnavailable] = useState(false);
  const [playRequested, setPlayRequested] = useState(false);
  const [needsPlayTap, setNeedsPlayTap] = useState(false);
  const spotifyHostRef = useRef<HTMLDivElement | null>(null);
  const spotifyControllerRef = useRef<SpotifyEmbedController | null>(null);
  const playbackMsRef = useRef(0);
  const spotifyPlayingRef = useRef(false);

  const activeSongIndex = songOrder[songIndex] ?? 0;
  const activeSong = soundtrack[activeSongIndex];
  const writingProgress = Math.min(100, Math.round((typedLength / birthdayLetter.length) * 100));
  const desiredSpotifyIdRef = useRef(activeSong.spotifyId);

  desiredSpotifyIdRef.current = activeSong.spotifyId;

  useEffect(() => {
    void ensureSpotifyIframeApi();

    setSongOrder((current) => {
      const shuffled = [...current];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const other = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
      }
      return shuffled;
    });
  }, []);

  useEffect(() => {
    if (stage !== "surprise") return;
    const timer = window.setTimeout(() => setStage("envelope"), 3000);
    return () => window.clearTimeout(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "cake") return;

    const blowTimer = window.setTimeout(() => setCandlesBlowing(true), 1600);
    const outTimer = window.setTimeout(() => setCandlesOut(true), 2900);

    return () => {
      window.clearTimeout(blowTimer);
      window.clearTimeout(outTimer);
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "cake" || cakeBites !== 5) return;
    const timer = window.setTimeout(() => setShowGift(true), 1000);
    return () => window.clearTimeout(timer);
  }, [cakeBites, stage]);

  useEffect(() => {
    if (stage !== "letter") return;
    if (typedLength >= birthdayLetter.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setTypedLength(birthdayLetter.length);
      return;
    }

    setTypedLength(0);
    let nextLength = 0;
    const timer = window.setInterval(() => {
      nextLength += 2;
      setTypedLength(Math.min(nextLength, birthdayLetter.length));
      if (nextLength >= birthdayLetter.length) window.clearInterval(timer);
    }, 28);

    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(() => {
    if (stage !== "letter") return;
    if (!spotifyPlaying) {
      setLyricTypedLength(0);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setLyricTypedLength(activeSong.lyric.length);
      return;
    }

    setLyricTypedLength(0);
    const fallbackStartedAt = window.performance.now();
    const timer = window.setInterval(() => {
      const spotifyPosition = playbackMsRef.current;
      const syncedElapsed = spotifyPosition > 0
        ? spotifyPosition
        : window.performance.now() - fallbackStartedAt;
      const revealElapsed = Math.max(0, syncedElapsed - 700);
      setLyricTypedLength(Math.min(activeSong.lyric.length, Math.floor(revealElapsed / 92)));
    }, 80);

    return () => window.clearInterval(timer);
  }, [activeSong.lyric, songIndex, spotifyPlaying, stage]);

  useEffect(() => {
    if (stage !== "letter") return;

    let cancelled = false;
    let controller: SpotifyEmbedController | null = null;
    setSpotifyPlaying(false);
    setSpotifyReady(false);
    setSpotifyUnavailable(false);
    setPlayRequested(false);
    setNeedsPlayTap(false);
    playbackMsRef.current = 0;
    spotifyPlayingRef.current = false;

    void ensureSpotifyIframeApi()
      .then((api) => {
        if (cancelled || !spotifyHostRef.current) return;
        spotifyHostRef.current.replaceChildren();

        api.createController(
          spotifyHostRef.current,
          {
            height: 152,
            uri: `spotify:track:${desiredSpotifyIdRef.current}`,
            width: "100%",
          },
          (createdController) => {
            if (cancelled) {
              createdController.destroy?.();
              return;
            }

            controller = createdController;
            spotifyControllerRef.current = createdController;

            createdController.addListener("ready", () => {
              if (cancelled) return;
              setSpotifyReady(true);

              window.setTimeout(() => {
                createdController.play?.();
                createdController.resume?.();
              }, 80);

              window.setTimeout(() => {
                if (!cancelled && !spotifyPlayingRef.current) setNeedsPlayTap(true);
              }, 1800);
            });

            createdController.addListener("playback_started", () => {
              if (cancelled) return;
              setSpotifyReady(true);
              spotifyPlayingRef.current = true;
              setSpotifyPlaying(true);
              setPlayRequested(false);
              setNeedsPlayTap(false);
            });

            createdController.addListener("playback_update", (event) => {
              if (cancelled) return;
              playbackMsRef.current = event.data?.position ?? 0;
              const playing = !(event.data?.isPaused ?? true) && !(event.data?.isBuffering ?? false);
              spotifyPlayingRef.current = playing;
              setSpotifyPlaying(playing);
              if (playing) {
                setPlayRequested(false);
                setNeedsPlayTap(false);
              }
            });
          },
        );
      })
      .catch(() => {
        if (cancelled) return;
        setSpotifyUnavailable(true);
        setNeedsPlayTap(false);
      });

    return () => {
      cancelled = true;
      if (spotifyControllerRef.current === controller) spotifyControllerRef.current = null;
      controller?.destroy?.();
      spotifyHostRef.current?.replaceChildren();
    };
  }, [stage]);

  useEffect(() => {
    if (stage !== "letter") return;
    const controller = spotifyControllerRef.current;
    if (!controller) return;

    setSpotifyPlaying(false);
    setPlayRequested(false);
    setNeedsPlayTap(false);
    playbackMsRef.current = 0;
    spotifyPlayingRef.current = false;
    controller.loadUri?.(`spotify:track:${activeSong.spotifyId}`);

    const playTimer = window.setTimeout(() => {
      controller.play?.();
      controller.resume?.();
    }, 180);

    const fallbackTimer = window.setTimeout(() => {
      if (!spotifyPlayingRef.current) setNeedsPlayTap(true);
    }, 1900);

    return () => {
      window.clearTimeout(playTimer);
      window.clearTimeout(fallbackTimer);
    };
  }, [activeSong.spotifyId, stage]);

  useEffect(() => {
    if (stage !== "letter" || !spotifyReady || spotifyUnavailable || transitioning) return;
    if (spotifyPlaying) {
      setNeedsPlayTap(false);
      return;
    }

    const timer = window.setTimeout(() => setNeedsPlayTap(true), 1300);
    return () => window.clearTimeout(timer);
  }, [spotifyPlaying, spotifyReady, spotifyUnavailable, stage, transitioning]);

  useEffect(() => {
    if (stage !== "letter" || transitioning || !spotifyPlaying) return;
    const timer = window.setTimeout(() => setTransitioning(true), SONG_WINDOW_MS - SONG_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [songIndex, spotifyPlaying, stage, transitioning]);

  useEffect(() => {
    if (!transitioning) return;
    const timer = window.setTimeout(() => {
      setSongIndex((current) => (current + 1) % songOrder.length);
      setTransitioning(false);
    }, SONG_EXIT_MS);
    return () => window.clearTimeout(timer);
  }, [songOrder.length, transitioning]);

  const takeBite = () => {
    if (!candlesOut || cakeBites >= 5) return;
    setCakeBites(cakeBites + 1);
  };

  const openGift = () => {
    if (!showGift || giftOpen) return;
    setGiftOpen(true);
    window.setTimeout(() => setStage("surprise"), 900);
  };

  const nextSong = () => {
    if (!transitioning) setTransitioning(true);
  };

  const startSpotify = () => {
    const controller = spotifyControllerRef.current;
    if (!controller) return;

    setPlayRequested(true);
    setNeedsPlayTap(false);
    controller.play?.();
    controller.resume?.();

    window.setTimeout(() => {
      if (!spotifyPlayingRef.current) {
        setPlayRequested(false);
        setNeedsPlayTap(true);
      }
    }, 1400);
  };

  if (stage === "cake") {
    const preludeInstruction = !candlesBlowing
      ? "Pide un deseo… las velitas se apagarán solitas."
      : !candlesOut
        ? "Shhh… las velitas se están apagando."
        : cakeBites < 5
          ? "Ahora sí: dale cinco mordiditas al pastel."
          : showGift
            ? "Tu regalo ya está aquí, Ali ♡"
            : "El pastel se va para dejar entrar otra sorpresa…";

    return (
      <section className="birthday-prelude cake-stage" aria-labelledby="birthday-start-title">
        <div className="prelude-stars" aria-hidden="true">
          {Array.from({ length: 19 }, (_, index) => (
            <i key={index} style={{ left: `${4 + ((index * 41) % 92)}%`, top: `${6 + ((index * 29) % 84)}%`, animationDelay: `${index * 120}ms` }} />
          ))}
        </div>
        <button className="skip-prelude" onClick={() => setStage("letter")}>saltar la intro</button>
        <header className="prelude-heading">
          <p>19 años · un deseo · una sorpresa</p>
          <h1 id="birthday-start-title">Felicidades por este gran día.</h1>
          <span aria-live="polite">{preludeInstruction}</span>
        </header>

        <div className={`party-table sequential-party ${showGift ? "is-gift-time" : ""}`}>
          {!showGift ? (
            <div className={`cake-side ${cakeBites === 5 ? "is-finished" : ""}`}>
              <button
                className={`bite-cake cake-bites-${cakeBites} ${candlesBlowing ? "candles-blowing" : ""} ${candlesOut ? "candles-out" : ""}`}
                onClick={takeBite}
                disabled={!candlesOut || cakeBites === 5}
                aria-label={!candlesOut ? "Espera a que se apaguen las velas" : cakeBites === 5 ? "El pastel está terminado" : `Dar la mordida ${cakeBites + 1} de 5`}
              >
                <span className="candle-row" aria-hidden="true">
                  {Array.from({ length: 5 }, (_, index) => <i key={index}><b /></i>)}
                </span>
                <span className="cake-tier cake-top"><i className="icing" /></span>
                <span className="cake-tier cake-bottom"><i className="icing" /></span>
                {Array.from({ length: 5 }, (_, index) => <span className={`bite-mark bite-${index + 1}`} key={index} aria-hidden="true" />)}
                <span className="cake-crumbs" aria-hidden="true">· · ·</span>
              </button>
              <div className="bite-counter" aria-live="polite">
                <span>{!candlesOut ? "pide un deseo…" : cakeBites === 5 ? "pastel terminado ♡" : `${cakeBites} / 5 mordidas`}</span>
                <i><b style={{ width: `${cakeBites * 20}%` }} /></i>
              </div>
            </div>
          ) : (
            <div className="gift-side gift-enters">
              <button
                className={`birthday-gift is-ready ${giftOpen ? "is-open" : ""}`}
                onClick={openGift}
                disabled={giftOpen}
                aria-label="Abrir el regalo"
              >
                <span className="gift-lid"><i className="gift-bow"><b /><b /></i></span>
                <span className="gift-box"><i /></span>
                <span className="gift-sparkles" aria-hidden="true">✦ ♡ ✦</span>
              </button>
              <p>{giftOpen ? "abriendo…" : "ahora toca el regalo ♡"}</p>
            </div>
          )}
        </div>
      </section>
    );
  }

  if (stage === "surprise") {
    return (
      <section className="birthday-prelude reveal-stage cat-stage gift-surprise-stage" aria-live="polite">
        <div className="celebration-burst" aria-hidden="true">
          {Array.from({ length: 19 }, (_, index) => <i key={index} style={{ transform: `rotate(${index * (360 / 19)}deg) translateY(-12rem)` }} />)}
        </div>
        <article className="cat-polaroid gift-surprise-polaroid">
          <p>la sorpresa salió manejando de la caja…</p>
          <div className="cat-reference-frame gift-surprise-frame">
            <img src="gift-surprise.jpeg" alt="Conejito tierno en un carrito acompañado por dos personajes pequeños" />
          </div>
          <h1>¡Feliz cumpleaños, Ali! <span>♡</span></h1>
          <small>tu carta llega en 3 segundos</small>
        </article>
      </section>
    );
  }

  if (stage === "envelope") {
    return (
      <section className="birthday-prelude reveal-stage mail-stage">
        <div className="mail-cloud cloud-one" aria-hidden="true" />
        <div className="mail-cloud cloud-two" aria-hidden="true" />
        <button className="floating-mail" onClick={() => setStage("letter")} aria-label="Abrir la única carta para Ali">
          <span className="mail-greeting">hola, Ali</span>
          <span className="envelope-art" aria-hidden="true">
            <i className="envelope-back" />
            <i className="letter-peek"><b>♡</b><em /><em /><em /></i>
            <i className="envelope-front" />
            <i className="wax-seal">A</i>
          </span>
          <strong>tengo una carta para ti &lt;3</strong>
          <small>tócala para abrirla</small>
        </button>
      </section>
    );
  }

  if (stage === "memory") {
    return (
      <section className="memory-game-host" id="minijuego-recuerdo" aria-label="Recuerdo jugable en Casa de Cultura">
        <button className="memory-game-back" onClick={() => setStage("letter")}>← volver a la carta</button>
        <MemoryGame />
      </section>
    );
  }

  return (
    <section
      className="single-letter-page"
      style={
        {
          "--letter-bg": activeSong.background,
          "--letter-ink": activeSong.ink,
          "--letter-accent": activeSong.accent,
          "--letter-soft": activeSong.soft,
        } as React.CSSProperties
      }
    >
      <header className="single-letter-topbar">
        <span>PARA ALI · 19</span>
        <p>una carta · fragmentos musicales de 10 segundos</p>
        <button onClick={nextSong} disabled={transitioning}>otra canción ↑</button>
      </header>

      <article className="single-letter-story">
        <section className="single-letter-hero" aria-labelledby="single-letter-title">
          <span className="hero-confetti hero-confetti-left" aria-hidden="true">🎉</span>
          <span className="hero-confetti hero-confetti-right" aria-hidden="true">🎉</span>
          <span className="hero-gift" aria-hidden="true">🎁</span>

          <div className="single-photo-wrap">
            <img src="memories/ali-de-pequena.jpeg" alt="Ali de pequeña jugando con una piñata" />
            <i className="single-party-hat" aria-hidden="true"><b /></i>
            <span className="single-cake-sticker" aria-hidden="true">🎂</span>
          </div>

          <p className="single-letter-kicker">para la niña que creció y se convirtió en mi persona favorita</p>
          <h1 id="single-letter-title">¡Feliz cumpleaños, Ali! <span>♡</span></h1>
          <a href="#carta-para-ali">tu carta comienza aquí ↓</a>
        </section>

        <section className="single-letter-copy" id="carta-para-ali" aria-label="Carta de cumpleaños para Ali">
          <div className="single-writing-status">
            <span>{writingProgress < 100 ? "escribiendo para ti…" : "carta completa ♡"}</span>
            <i><b style={{ width: `${writingProgress}%` }} /></i>
            <strong>{writingProgress}%</strong>
          </div>
          <p>
            {birthdayLetter.slice(0, typedLength)}
            {typedLength < birthdayLetter.length && <i className="typing-cursor" aria-hidden="true" />}
          </p>
        </section>

        {typedLength >= birthdayLetter.length && (
          <section className="memory-portal" aria-labelledby="memory-portal-title">
            <p>cuando una carta termina, queda algo flotando en la memoria…</p>
            <h2 id="memory-portal-title">Hay un recuerdo esperando por ti.</h2>
            <button className="pixel-memory-cloud" onClick={() => setStage("memory")} aria-label="Abrir el recuerdo y entrar al minijuego">
              <PixelMemoryCloud />
              <strong>un recuerdo</strong>
              <small>toca la nubecita para entrar</small>
            </button>
          </section>
        )}
      </article>

      <aside
        className={`song-lyric-whisper ${transitioning ? "is-switching" : ""}`}
        data-position={activeSong.lyricPosition}
        aria-live="polite"
      >
        <small>{activeSong.title} · fragmento oficial breve</small>
        <p>
          “{activeSong.lyric.slice(0, lyricTypedLength)}
          {lyricTypedLength < activeSong.lyric.length && <i aria-hidden="true" />}”
        </p>
        <span>{spotifyPlaying ? "acompañando la canción" : "esperando a que suene"}</span>
      </aside>

      {!transitioning && (!spotifyReady || needsPlayTap || spotifyUnavailable) && (
        <aside className="music-activation-card" role="status" aria-live="polite">
          <span aria-hidden="true">♫</span>
          <p>
            <small>{spotifyUnavailable ? "Spotify no pudo abrirse" : spotifyReady ? "un toque para activar el sonido" : "preparando la música"}</small>
            <strong>{activeSong.title}</strong>
            <em>{spotifyUnavailable ? "Puedes abrir esta canción directamente en Spotify." : spotifyReady ? "La carta esperará y los 10 segundos empezarán cuando suene." : "En un momento aparecerá el botón para escucharla."}</em>
          </p>
          {!spotifyUnavailable && (
            <button onClick={startSpotify} disabled={!spotifyReady || playRequested}>
              {playRequested ? "intentando reproducir…" : spotifyReady ? "tocar para escuchar ♫" : "cargando…"}
            </button>
          )}
          <a href={`https://open.spotify.com/track/${activeSong.spotifyId}`} target="_blank" rel="noreferrer">abrir en Spotify ↗</a>
        </aside>
      )}

      <aside className={`hanging-soundtrack ${transitioning ? "is-switching" : ""}`}>
        <span className="soundtrack-rope" aria-hidden="true"><i /></span>
        <span className="soundtrack-clips" aria-hidden="true"><i /><i /></span>
        <div className="soundtrack-polaroid">
          <div className="hanging-soundtrack-heading">
            <span className="mini-disc" aria-hidden="true"><i /></span>
            <p><small>foto musical · 10 segundos</small><strong>{activeSong.title}</strong><span>{activeSong.artist} · {activeSong.album}</span></p>
            <button onClick={nextSong} disabled={transitioning} aria-label="Cambiar a otra canción">↑</button>
          </div>
          <div className="spotify-controller-host" ref={spotifyHostRef} aria-label={`Reproductor de ${activeSong.title}`} />
          <div className="spotify-playback-state">
            <span>{spotifyPlaying ? "sonando ahora…" : needsPlayTap ? "toca el aviso para escuchar" : spotifyUnavailable ? "Spotify no está disponible" : "preparando la canción…"}</span>
          </div>
          <div className={`soundtrack-timer ${spotifyPlaying ? "is-running" : ""}`} aria-label="La canción cambia después de 10 segundos de reproducción"><i key={songIndex} /></div>
        </div>
      </aside>
    </section>
  );
}

export default function Home() {
  return (
    <main className="single-letter-shell">
      <BirthdayExperience />
    </main>
  );
}
